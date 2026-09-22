import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LocalDB } from '../studio/local-db.mjs';
import { Store } from '../studio/server/store.mjs';
import { handle } from '../studio/server/worker.mjs';
import { passwordHash } from '../studio/server/security.mjs';

const origin = 'https://studio.example';
const password = 'SyntheticPass123!';
const juziToken = 'synthetic-juzi-token';
const juziBase = 'https://juzi.example/hub-api';
const fullPhone = '13800135678';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

async function harness(t, dependencies = {}, envExtra = {}) {
  const db = new LocalDB();
  t.after(() => db.close());
  const hash = await passwordHash(password);
  db.sqlite.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,1,0,?)').run('admin', 'admin', '合成管理员', hash, 'admin', Date.now());
  db.sqlite.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,1,0,?)').run('sales', 'sales', '合成销售', hash, 'sales', Date.now());
  db.sqlite.prepare(`INSERT INTO studio_customers(id,display_name,audience,owner_user_id,salutation,phone_suffix,
    purchased_products,interests,concerns,contraindications,notes,active,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).run('customer-1', '陈先生', 'anti_aging', 'sales', '陈哥', '5678',
    'NMN', '精力', '价格', '', '先核实安全', 'sales', Date.now());
  const env = {
    DB: db,
    STUDIO_LLM_API_KEY: 'synthetic-model-key',
    STUDIO_LLM_BASE_URL: 'https://model.example/v1',
    WECOM_API_BASE: juziBase,
    WECOM_API_TOKEN: juziToken,
    ...envExtra,
  };
  const call = async (path, method = 'GET', body, session, headers = {}) => {
    const request = new Request(origin + path, {
      method,
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(session ? { Cookie: session.cookie, 'X-Studio-CSRF': session.csrf } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const response = await handle(request, env, dependencies);
    let payload = {};
    try { payload = await response.json(); } catch {}
    return { status: response.status, headers: response.headers, ...payload };
  };
  const login = async (username = 'admin') => {
    const result = await call('/api/studio/login', 'POST', { username, password });
    assert.equal(result.status, 200);
    return { cookie: result.headers.get('Set-Cookie').split(';')[0], csrf: result.data.csrf };
  };
  const callback = async body => handle(new Request(origin + '/api/webhooks/upstream/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), env, dependencies);
  return { db, env, call, login, callback, store: new Store(db) };
}

function listCustomersResponse() {
  return jsonResponse({
    errcode: 0,
    data: [{
      imContactId: 'external-contact-1',
      name: '陈先生',
      remarkMobiles: [fullPhone],
      systemTags: ['NMN用户', '高互动'],
      remark: '客户关注睡眠和精力',
      gender: 1,
      friendshipStatus: 1,
      imInfo: { externalUserId: 'external-user-1', tags: ['老客', 'NMN用户'] },
      botInfo: { imBotId: 'bot-1', name: '合成托管账号' },
    }],
    next_seq: '',
  });
}

function modelTask(contactId, localCustomerId) {
  return jsonResponse({
    choices: [{
      message: { content: JSON.stringify({ tasks: [{
        contact_id: contactId,
        priority: 'high',
        reason: '已绑定档案且近期无消息',
        recommended_message: '陈哥，最近整体状态还好吗？有哪里想先弄清楚，我再帮您看。',
        next_action: '客户回复后先确认本次关注点',
        stop_rule: '客户明确不需要后暂停触达',
      }] }) },
    }],
  });
}

test('outreach is admin-only and sales calls never reach upstream or model', async t => {
  let upstreamCalls = 0, modelCalls = 0;
  const h = await harness(t, {
    fetchJuzi: async () => { upstreamCalls++; return listCustomersResponse(); },
    fetchModel: async () => { modelCalls++; return modelTask('unused', 'unused'); },
  });
  const sales = await h.login('sales');
  const checks = [
    ['/api/studio/outreach', 'GET', undefined],
    ['/api/studio/outreach/sync', 'POST', {}],
    ['/api/studio/outreach/bots/bot-1', 'PUT', { owner_user_id: 'sales' }],
    ['/api/studio/outreach/contacts/contact-1/bind', 'PUT', { local_customer_id: 'customer-1' }],
    ['/api/studio/outreach/strategies', 'POST', { limit: 1 }],
    ['/api/studio/outreach/tasks/task-1/queue', 'POST', {}],
    ['/api/studio/outreach/tasks/task-1/send', 'POST', {}],
    ['/api/studio/outreach/messages', 'GET', undefined],
  ];
  for (const [path, method, body] of checks) {
    const result = await h.call(path, method, body, sales);
    assert.equal(result.status, 403, `${method} ${path}`);
    assert.equal(result.error.code, 'FORBIDDEN');
  }
  assert.equal(upstreamCalls, 0);
  assert.equal(modelCalls, 0);
});

test('missing Juzi credentials stop before upstream and expose no secret', async t => {
  let upstreamCalls = 0;
  const h = await harness(t, { fetchJuzi: async () => { upstreamCalls++; return listCustomersResponse(); } }, { WECOM_API_TOKEN: '' });
  const admin = await h.login();
  const result = await h.call('/api/studio/outreach/sync', 'POST', {}, admin);
  assert.equal(result.status, 503);
  assert.equal(result.error.code, 'JUZI_NOT_CONFIGURED');
  assert.ok(!JSON.stringify(result).includes(juziBase));
  assert.equal(upstreamCalls, 0);
});

test('sync masks phone, binds matching customer, and never stores token', async t => {
  const requests = [];
  const h = await harness(t, { fetchJuzi: async request => { requests.push(request); return listCustomersResponse(); } });
  const admin = await h.login();
  const result = await h.call('/api/studio/outreach/sync', 'POST', {}, admin);
  assert.equal(result.status, 200);
  assert.equal(result.data.synced, 1);
  assert.equal(result.data.suggested, 1);

  assert.equal(new URL(String(requests[0])).searchParams.get('token'), juziToken);
  assert.equal(new URL(String(requests[0])).pathname, '/hub-api/api/v2/customer/list');
  const contact = h.db.sqlite.prepare('SELECT * FROM studio_juzi_contacts').get();
  assert.equal(contact.phone_suffix, '5678');
  assert.equal(contact.match_status, 'suggested');
  assert.equal(contact.tags, 'NMN用户、高互动、老客');
  assert.equal(contact.remark, '客户关注睡眠和精力');

  const bot = await h.call('/api/studio/outreach/bots/bot-1', 'PUT', { owner_user_id: 'sales' }, admin);
  assert.equal(bot.status, 200);
  const bound = await h.call(`/api/studio/outreach/contacts/${contact.id}/bind`, 'PUT', { local_customer_id: 'customer-1' }, admin);
  assert.equal(bound.status, 200);

  const dump = JSON.stringify(h.db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    .map(row => h.db.sqlite.prepare(`SELECT * FROM ${row.name}`).all()));
  assert.ok(!dump.includes(fullPhone));
  assert.ok(!dump.includes(juziToken));
});

test('strategies require model format, provided customers, and keep credentials separated', async t => {
  const h = await harness(t, { fetchJuzi: async () => listCustomersResponse() });
  const admin = await h.login();
  await h.call('/api/studio/outreach/sync', 'POST', {}, admin);
  const snapshot = await h.call('/api/studio/outreach', 'GET', undefined, admin);
  const contact = snapshot.data.contacts[0];
  await h.call(`/api/studio/outreach/contacts/${contact.id}/bind`, 'PUT', { local_customer_id: 'customer-1' }, admin);

  let modelBody;
  const good = await harness(t, {
    fetchJuzi: async () => listCustomersResponse(),
    fetchModel: async (_, options) => {
      modelBody = options.body;
      const candidate = JSON.parse(JSON.parse(options.body).messages.at(-1).content).candidates[0];
      return modelTask(candidate.id, candidate.local_customer_id);
    },
  });
  await good.call('/api/studio/outreach/sync', 'POST', {}, await good.login());
  const goodSnapshot = await good.call('/api/studio/outreach', 'GET', undefined, await good.login());
  const goodContact = goodSnapshot.data.contacts[0];
  await good.call(`/api/studio/outreach/contacts/${goodContact.id}/bind`, 'PUT', { local_customer_id: 'customer-1' }, await good.login());
  const generated = await good.call('/api/studio/outreach/strategies', 'POST', { audience: 'anti_aging', limit: 1 }, await good.login());
  assert.equal(generated.status, 200);
  assert.equal(generated.data.created_count, 1);
  assert.ok(!modelBody.includes(juziToken));
  assert.ok(modelBody.includes(goodContact.id));

  const invented = await harness(t, {
    fetchJuzi: async () => listCustomersResponse(),
    fetchModel: async () => modelTask('not-provided', 'customer-1'),
  });
  await invented.call('/api/studio/outreach/sync', 'POST', {}, await invented.login());
  const inventedSnapshot = await invented.call('/api/studio/outreach', 'GET', undefined, await invented.login());
  const inventedContact = inventedSnapshot.data.contacts[0];
  await invented.call(`/api/studio/outreach/contacts/${inventedContact.id}/bind`, 'PUT', { local_customer_id: 'customer-1' }, await invented.login());
  const rejected = await invented.call('/api/studio/outreach/strategies', 'POST', { limit: 1 }, await invented.login());
  assert.equal(rejected.status, 502);
  assert.equal(rejected.error.code, 'MODEL_FORMAT');
});

test('queued messages send with unique external IDs and persist request IDs only', async t => {
  const upstream = [];
  const h = await harness(t, {
    fetchJuzi: async (url, init) => {
      upstream.push({ url: String(url), body: String(init.body || '{}') });
      if (new URL(String(url)).pathname.endsWith('/customer/list')) return listCustomersResponse();
      const body = JSON.parse(init.body);
      return jsonResponse({ errcode: 0, requestId: `request-${upstream.length}` });
    },
    fetchModel: async (_, options) => {
      const body = JSON.parse(options.body);
      const candidate = JSON.parse(body.messages.at(-1).content).candidates[0];
      return modelTask(candidate.id, candidate.local_customer_id);
    },
  });
  const admin = await h.login();
  await h.call('/api/studio/outreach/sync', 'POST', {}, admin);
  const snapshot = await h.call('/api/studio/outreach', 'GET', undefined, admin);
  const contact = snapshot.data.contacts[0];
  await h.call(`/api/studio/outreach/contacts/${contact.id}/bind`, 'PUT', { local_customer_id: 'customer-1' }, admin);
  const first = await h.call('/api/studio/outreach/strategies', 'POST', { limit: 1 }, admin);
  h.db.sqlite.prepare('UPDATE studio_outreach_tasks SET plan_day=? WHERE id=?')
    .run('2000-01-01', first.data.tasks[0].id);
  const second = await h.call('/api/studio/outreach/strategies', 'POST', { limit: 1 }, admin);
  await h.call(`/api/studio/outreach/tasks/${first.data.tasks[0].id}/queue`, 'POST', {}, admin);
  await h.call(`/api/studio/outreach/tasks/${second.data.tasks[0].id}/queue`, 'POST', {}, admin);
  const sent1 = await h.call(`/api/studio/outreach/tasks/${first.data.tasks[0].id}/send`, 'POST', {}, admin);
  const sent2 = await h.call(`/api/studio/outreach/tasks/${second.data.tasks[0].id}/send`, 'POST', {}, admin);
  assert.equal(sent1.status, 200);
  assert.equal(sent2.status, 200);
  assert.notEqual(sent1.data.message_id, sent2.data.message_id);
  assert.equal(JSON.parse(upstream.at(-2).body).externalRequestId, sent1.data.message_id);
  assert.equal(JSON.parse(upstream.at(-1).body).externalRequestId, sent2.data.message_id);

  const rows = h.db.sqlite.prepare('SELECT * FROM studio_outreach_messages ORDER BY created_at').all();
  assert.deepEqual(rows.map(row => row.status), ['sent', 'sent']);
  assert.ok(rows.every(row => row.request_id));
  const dump = JSON.stringify(rows);
  assert.ok(!dump.includes(juziToken));
  assert.ok(!dump.includes(juziBase));
});

test('send failure keeps task queued and returns mapped error without URL or token', async t => {
  const h = await harness(t, {
    fetchJuzi: async request => {
      if (new URL(String(request)).pathname.endsWith('/customer/list')) return listCustomersResponse();
      return jsonResponse({ errcode: 1, errmsg: `${juziToken} ${juziBase}` }, 500);
    },
    fetchModel: async (_, options) => {
      const body = JSON.parse(options.body);
      const candidate = JSON.parse(body.messages.at(-1).content).candidates[0];
      return modelTask(candidate.id, candidate.local_customer_id);
    },
  });
  const admin = await h.login();
  await h.call('/api/studio/outreach/sync', 'POST', {}, admin);
  const snapshot = await h.call('/api/studio/outreach', 'GET', undefined, admin);
  const contact = snapshot.data.contacts[0];
  await h.call(`/api/studio/outreach/contacts/${contact.id}/bind`, 'PUT', { local_customer_id: 'customer-1' }, admin);
  const task = await h.call('/api/studio/outreach/strategies', 'POST', { limit: 1 }, admin);
  await h.call(`/api/studio/outreach/tasks/${task.data.tasks[0].id}/queue`, 'POST', {}, admin);
  const failed = await h.call(`/api/studio/outreach/tasks/${task.data.tasks[0].id}/send`, 'POST', {}, admin);
  assert.equal(failed.status, 502);
  assert.equal(failed.error.code, 'JUZI_API_ERROR');
  assert.ok(!JSON.stringify(failed).includes(juziToken));
  assert.ok(!JSON.stringify(failed).includes(juziBase));
  const message = h.db.sqlite.prepare('SELECT * FROM studio_outreach_messages').get();
  assert.equal(message.status, 'failed');
  assert.equal(h.db.sqlite.prepare('SELECT status FROM studio_outreach_tasks WHERE id=?').get(task.data.tasks[0].id).status, 'queued');
});

test('Juzi callback always returns ok, validates token, and is idempotent', async t => {
  const h = await harness(t);
  const body = {
    token: juziToken,
    messageId: 'message-1',
    imContactId: 'external-contact-1',
    messageType: 7,
    payload: { text: `收到消息，电话${fullPhone}` },
    timestamp: Date.now(),
  };
  await h.db.sqlite.prepare(`INSERT INTO studio_juzi_contacts(id,im_contact_id,display_name,phone_suffix,im_bot_id,match_status,last_synced_at)
    VALUES(?,?,?,?,?,?,?)`).run('contact-1', 'external-contact-1', '陈先生', '5678', 'bot-1', 'unmatched', Date.now());

  for (const payload of [null, { ...body, token: 'wrong' }, { ...body, imContactId: 'missing' }, body, body]) {
    const response = await h.callback(payload);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { errcode: 0, errmsg: 'ok' });
  }
  const rows = h.db.sqlite.prepare('SELECT * FROM studio_outreach_messages').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'received');
  assert.equal(rows[0].direction, 'inbound');
  assert.match(rows[0].content, /尾号5678/);
  assert.ok(!rows[0].content.includes(fullPhone));
  assert.ok(!JSON.stringify(rows).includes(juziToken));
});

test('outreach retention is 30 days for tasks and messages', async t => {
  const h = await harness(t);
  const old = Date.now() - 2592001000;
  h.db.sqlite.prepare(`INSERT INTO studio_outreach_tasks(id,contact_id,audience,recommended_message,status,created_by,created_at)
    VALUES(?,?,?,?,?,?,?)`).run('old-task', 'contact-1', 'anti_aging', 'old', 'draft', 'admin', old);
  h.db.sqlite.prepare(`INSERT INTO studio_outreach_messages(id,contact_id,direction,content,status,created_at)
    VALUES(?,?,?,?,?,?)`).run('old-message', 'contact-1', 'inbound', 'old', 'received', old);
  await h.store.cleanup();
  assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM studio_outreach_tasks').get().n, 0);
  assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) n FROM studio_outreach_messages').get().n, 0);
});

test('migrations and production configuration keep the token server-side', () => {
  const sqlite = readFileSync(new URL('../drizzle/0004_juzi_outreach.sql', import.meta.url), 'utf8');
  const postgres = readFileSync(new URL('../drizzle/0004_pg_juzi_outreach.sql', import.meta.url), 'utf8');
  for (const sql of [sqlite, postgres]) {
    assert.ok(/studio_juzi_bots/.test(sql));
    assert.ok(/studio_juzi_contacts/.test(sql));
    assert.ok(/phone_suffix/.test(sql));
    assert.ok(!/INSERT\s+INTO/i.test(sql));
  }
  const env = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(env, /^WECOM_API_TOKEN=$/m);
  assert.ok(!env.includes(juziToken));
  const compose = readFileSync(new URL('../docker-compose.prod.yml', import.meta.url), 'utf8');
  assert.match(compose, /WECOM_API_TOKEN:\s*\$\{WECOM_API_TOKEN\}/);
  assert.ok(!compose.includes(juziToken));
  const pgAdapter = readFileSync(new URL('../studio/pg-db.mjs', import.meta.url), 'utf8');
  assert.match(pgAdapter, /0005_pg_outreach_profile/);
  assert.ok(readFileSync(new URL('../drizzle/0005_pg_outreach_profile.sql', import.meta.url), 'utf8').includes('studio_customer_profile_updates'));
});
