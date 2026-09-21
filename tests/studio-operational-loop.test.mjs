import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalDB } from '../studio/local-db.mjs';
import { Store } from '../studio/server/store.mjs';
import { handle } from '../studio/server/worker.mjs';
import { passwordHash } from '../studio/server/security.mjs';

const origin = 'https://studio.example';
const input = () => ({
  audience: 'anti_aging',
  scene: 'needs',
  messages: [{ role: 'user', content: '我想先了解一下抗衰产品。' }],
  resources: [],
});
const modelOutput = () => ({
  status: 'ready',
  reply: '咱们可以先弄清楚您这次最想改善的方面，我再帮您看合适的信息。',
  next_step: '等待客户说明关注点。',
  followups: [],
  missing_fields: [],
  conflicts: [],
  inferred: { needs: '抗衰需求待澄清', goal: '确认关注点', evidence: '客户表示想先了解' },
  used_sources: [],
  facts: [],
});
const modelResponse = () => new Response(JSON.stringify({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(modelOutput()) } }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
}), { status: 200 });

async function harness(t, dependencies = {}) {
  const db = new LocalDB();
  t.after(() => db.close());
  const hash = await passwordHash('SyntheticPass123!');
  db.sqlite.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,1,0,?)')
    .run('admin', 'admin', '合成管理员', hash, 'admin', Date.now());
  db.sqlite.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,1,0,?)')
    .run('sales', 'sales', '合成销售', hash, 'sales', Date.now());
  const env = {
    DB: db,
    STUDIO_LLM_API_KEY: 'test-only-not-a-real-key',
    STUDIO_LLM_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  };
  const call = async (path, method = 'GET', body, session, headers = {}) => {
    const isForm = body instanceof FormData;
    const request = new Request(origin + '/api/studio' + path, {
      method,
      headers: {
        Origin: origin,
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(session ? { Cookie: session.cookie, 'X-Studio-CSRF': session.csrf } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
    });
    const response = await handle(request, env, dependencies);
    const payload = await response.json();
    return { status: response.status, headers: response.headers, ...payload };
  };
  const login = async (username = 'admin') => {
    const result = await call('/login', 'POST', { username, password: 'SyntheticPass123!' });
    assert.equal(result.status, 200);
    return {
      cookie: result.headers.get('Set-Cookie').split(';')[0],
      csrf: result.data.csrf,
    };
  };
  return { db, env, call, login, store: new Store(db) };
}

test('customer profiles are owner-scoped and enter generation as internal context only', async t => {
  let sent;
  const h = await harness(t, { fetchModel: async (_, options) => { sent = options.body; return modelResponse(); } });
  const admin = await h.login('admin'), sales = await h.login('sales');
  const customer = {
    display_name: '陈先生', audience: 'anti_aging', salutation: '陈哥', phone_suffix: '5678',
    purchased_products: 'NMN', interests: '睡眠与精力', concerns: '价格',
    contraindications: '用药中', notes: '先核实安全',
  };
  const created = await h.call('/customers', 'POST', customer, sales);
  assert.equal(created.status, 201);
  const salesRows = (await h.call('/customers', 'GET', undefined, sales)).data.items;
  const adminRows = (await h.call('/customers', 'GET', undefined, admin)).data.items;
  assert.equal(salesRows.length, 1);
  assert.equal(adminRows.length, 1);
  assert.equal((await h.call(`/customers/${created.data.id}`, 'PUT', { ...customer, display_name: '陈先生改' }, admin)).status, 403);
  assert.equal((await h.call('/customers', 'POST', { ...customer, phone_suffix: '13800135678' }, sales)).status, 400);

  const generated = await h.call('/generations', 'POST', { ...input(), customer_id: created.data.id }, sales);
  assert.equal(generated.status, 200);
  const body = JSON.parse(sent);
  const context = JSON.parse(body.messages[1].content);
  assert.equal(context.input.customer_profile.phone_suffix, '5678');
  assert.ok(!sent.includes('13800135678'));
  const dump = JSON.stringify(h.db.sqlite.prepare('SELECT * FROM studio_customers').all());
  assert.ok(!dump.includes('13800135678'));
});

test('unusable feedback becomes an admin issue with screenshot and 30-day cleanup', async t => {
  const h = await harness(t, { fetchModel: async () => modelResponse() });
  const admin = await h.login('admin'), sales = await h.login('sales');
  const first = await h.call('/generations', 'POST', input(), sales);
  assert.equal((await h.call('/feedback', 'POST', { generation_id: first.data.generation_id, rating: 'edited' }, sales)).status, 200);
  assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM studio_issues').get().n, 0);

  const second = await h.call('/generations', 'POST', input(), sales);
  const form = new FormData();
  form.append('generation_id', second.data.generation_id);
  form.append('rating', 'unusable');
  form.append('reason', 'wrong_info');
  form.append('note', '价格和规格都不对');
  form.append('screenshot', new File(['synthetic-image'], 'feedback.png', { type: 'image/png' }));
  assert.equal((await h.call('/feedback', 'POST', form, sales)).status, 200);
  assert.equal((await h.call('/feedback', 'POST', { generation_id: second.data.generation_id, rating: 'unusable' }, sales)).status, 400);
  assert.equal((await h.call('/issues', 'GET', undefined, sales)).status, 403);

  const issues = (await h.call('/issues?status=open', 'GET', undefined, admin)).data.items;
  assert.equal(issues.length, 1);
  assert.equal(issues[0].reason, 'wrong_info');
  assert.match(issues[0].screenshot, /^data:image\/png;base64,/);
  assert.equal(issues[0].messages.length, 1);
  const issueId = issues[0].id;
  assert.equal((await h.call(`/issues/${issueId}`, 'PUT', { status: 'processing' }, admin)).status, 200);
  assert.equal(h.db.sqlite.prepare('SELECT status FROM studio_issues WHERE id=?').get(issueId).status, 'processing');

  h.db.sqlite.prepare('UPDATE studio_issues SET created_at=? WHERE id=?').run(Date.now() - 2592001000, issueId);
  h.db.sqlite.prepare('UPDATE studio_conversations SET created_at=?').run(Date.now() - 2592001000);
  await h.store.cleanup();
  assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM studio_issues').get().n, 0);
  assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM studio_conversations').get().n, 0);
});

test('structured materials are versioned and deletion is admin-only', async t => {
  const h = await harness(t);
  const admin = await h.login('admin'), sales = await h.login('sales');
  const material = {
    title: '合成辅酶资料', kind: 'knowledge', audience: 'all', product: '辅酶Q10',
    price: '199元/盒', specification: '60粒/盒', applicable: '成人日常营养',
    effect: '支持能量代谢', usage_notes: '每日1粒', precautions: '孕产期先咨询医生',
    content: '辅酶Q10每盒199元，60粒。', confirmed: true, active: true,
  };
  const created = await h.call('/materials', 'POST', material, admin);
  assert.equal(created.status, 201);
  const row = h.db.sqlite.prepare('SELECT * FROM studio_materials WHERE id=?').get(created.data.id);
  assert.equal(row.specification, '60粒/盒');
  assert.equal(row.precautions, '孕产期先咨询医生');

  const updated = await h.call(`/materials/${created.data.id}`, 'PUT', {
    ...material, version: 1, specification: '90粒/盒',
  }, admin);
  assert.equal(updated.status, 200);
  const versions = (await h.call(`/materials/${created.data.id}/versions`, 'GET', undefined, admin)).data.items;
  assert.equal(versions.length, 2);
  assert.equal(JSON.parse(versions[0].snapshot).specification, '90粒/盒');
  assert.equal((await h.call(`/materials/${created.data.id}`, 'DELETE', undefined, sales)).status, 403);
  assert.equal((await h.call(`/materials/${created.data.id}`, 'DELETE', undefined, admin)).status, 200);
  assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM studio_materials WHERE id=?').get(created.data.id).n, 0);
});

test('screenshot OCR is explicit, authenticated, and masked before returning', async t => {
  let visionBody;
  const h = await harness(t, {
    fetchVision: async (_, options) => {
      visionBody = options.body;
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"messages":[{"role":"user","content":"电话13800135678，这个怎么吃"},{"role":"assistant","content":"我先帮您核对用法"}]}' } }],
      }), { status: 200 });
    },
  });
  const sales = await h.login('sales');
  const form = new FormData();
  form.append('screenshot', new File(['synthetic-image'], 'chat.png', { type: 'image/png' }));
  assert.equal((await h.call('/ocr', 'POST', form, sales)).status, 503);

  h.env.STUDIO_VISION_MODEL = 'synthetic-vision-model';
  const result = await h.call('/ocr', 'POST', form, sales);
  assert.equal(result.status, 200);
  assert.equal(result.data.messages.length, 2);
  assert.match(result.data.messages[0].content, /尾号5678/);
  assert.ok(!JSON.stringify(result).includes('13800135678'));
  const request = JSON.parse(visionBody);
  assert.equal(request.model, 'synthetic-vision-model');
  assert.ok(request.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'));
});
