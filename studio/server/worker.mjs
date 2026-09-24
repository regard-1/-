import { Store } from './store.mjs';
import { checkOrigin, readBody, fail, HttpError, json, checkPassword, passwordHash, verifyPassword, randomToken, digest, cookie } from './security.mjs';
import { generate, validateMaterial } from './generation.mjs';
import { knowledgeConfigured } from './knowledge.mjs';
import { recognizeScreenshot } from './ocr.mjs';
import { createJuziIframe, handleOauth } from './idp.mjs';
import { assignBot, bindContact, createTemplate, deleteTask, deleteTemplate, generateReply, generateStrategies, generateTemplateTasks, handleJuziCallback, outreachSnapshot, queueTask, sendTask, syncContacts, syncConversations, updateContactReplyStatus, updateContactSalutation, updateTaskMessage, updateTemplate } from './outreach.mjs';
import { AUDIENCES, maskText, MODEL, monthKey } from '../shared.mjs';

const cleanName = value => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_.-]{2,39}$/.test(value);
const publicUser = u => ({ id: u.id, username: u.username, display_name: u.display_name, role: u.role, must_change: !!u.must_change });
const admin = user => { if (user.role !== 'admin') fail(403, '仅管理员可执行此操作', 'FORBIDDEN'); };
const localSetup = (request, env) => env.STUDIO_LOCAL_SETUP === '1' && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname);

const ISSUE_REASONS = ['wrong_info', 'too_simple', 'robotic', 'repetitive', 'other'];
const textValue = (value, maximum, label, required = false) => {
  if (value == null) value = '';
  if (typeof value !== 'string' || value.length > maximum) fail(400, `${label}格式不正确或过长`);
  const text = maskText(value.trim());
  if (required && !text) fail(400, `请填写${label}`);
  return text;
};
function validateCustomer(body, user) {
  const data = {
    display_name: textValue(body.display_name, 40, '客户名称', true),
    salutation: textValue(body.salutation, 30, '称呼'),
    phone_suffix: String(body.phone_suffix || '').trim(),
    purchased_products: textValue(body.purchased_products, 600, '已购产品'),
    interests: textValue(body.interests, 600, '关注点'),
    concerns: textValue(body.concerns, 600, '关心点'),
    contraindications: textValue(body.contraindications, 600, '禁忌与特殊情况'),
    notes: textValue(body.notes, 1200, '备注'),
  };
  if (!AUDIENCES[body.audience]) fail(400, '请选择客户人群');
  data.audience = body.audience;
  if (!/^\d{0,4}$/.test(data.phone_suffix)) fail(400, '手机号只能保存后四位');
  data.active = body.active === false ? 0 : 1;
  return data;
}
async function imageToDataUrl(file, maximumBytes) {
  if (!(file instanceof File) || !file.size) return null;
  if (file.size > maximumBytes) fail(413, '截图文件过大');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) fail(400, '截图仅支持 PNG、JPG 或 WebP');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${file.type};base64,${btoa(binary)}`;
}
async function feedbackBody(request) {
  if (request.headers.get('Content-Type')?.startsWith('application/json')) {
    return { ...(await readBody(request)), screenshot: null };
  }
  const form = await request.formData();
  return {
    generation_id: String(form.get('generation_id') || ''),
    rating: String(form.get('rating') || ''),
    reason: String(form.get('reason') || ''),
    note: String(form.get('note') || ''),
    screenshot: await imageToDataUrl(form.get('screenshot'), 2 * 1024 * 1024),
  };
}

async function bootstrap(store, env) {
  if (!env.STUDIO_BOOTSTRAP_USERNAME || !env.STUDIO_BOOTSTRAP_PASSWORD_HASH) return;
  if (!cleanName(env.STUDIO_BOOTSTRAP_USERNAME)) fail(503, '管理员初始化配置不正确');
  await store.query(`INSERT INTO studio_users(id,username,display_name,password_hash,role,active,must_change,created_at)
    SELECT ?,?,?,?,'admin',1,0,? WHERE NOT EXISTS(SELECT 1 FROM studio_users) ON CONFLICT DO NOTHING`, crypto.randomUUID(), env.STUDIO_BOOTSTRAP_USERNAME, '资料管理员', env.STUDIO_BOOTSTRAP_PASSWORD_HASH, Date.now()).run();
}

export async function api(request, env, dependencies = {}) {
  const url = new URL(request.url), route = url.pathname.replace(/\/$/, ''), method = request.method;
  if (!env.DB) fail(503, '资料服务尚未配置', 'DATABASE_NOT_CONFIGURED');
  const store = new Store(env.DB);
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) fail(405, '不支持此操作');
  if (method !== 'GET') checkOrigin(request);
 if (route === '/api/studio/status' && method === 'GET') {
   const count = await store.query('SELECT COUNT(*) AS n FROM studio_users').first();
    const noUsers = !count.n;
    return json({ model_configured: !!(env.STUDIO_LLM_API_KEY && env.STUDIO_LLM_BASE_URL), knowledge_configured: knowledgeConfigured(env), local_setup: noUsers, model: MODEL });
 }
 if (route === '/api/studio/setup' && method === 'POST') {
    const existing = await store.query('SELECT COUNT(*) AS n FROM studio_users').first();
    if (existing.n) fail(404, '接口不存在');
   const body = await readBody(request);
    if (!cleanName(body.username)) fail(400, '账号需为 3 至 40 位字母、数字、点或下划线，并以字母开头');
    const hash = await passwordHash(checkPassword(body.password));
    const result = await store.query(`INSERT INTO studio_users(id,username,display_name,password_hash,role,active,must_change,created_at)
      SELECT ?,?,? ,?,'admin',1,0,? WHERE NOT EXISTS(SELECT 1 FROM studio_users) RETURNING id`, crypto.randomUUID(), body.username, '本机管理员', hash, Date.now()).first();
    if (!result) fail(409, '管理员已创建，请直接登录');
    return json({ created: true }, 201);
  }
  if (route === '/api/studio/login' && method === 'POST') {
    const body = await readBody(request);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    if (!cleanName(username) || typeof body.password !== 'string' || body.password.length > 128) fail(400, '账号或密码格式不正确');
    await store.cleanup();
    const address = request.headers.get('CF-Connecting-IP') || 'local';
    await store.rateLimit(`login-ip:${await digest(address)}`, 30, 900);
    await store.rateLimit(`login-account:${await digest(username.toLowerCase())}`, 8, 900);
    await bootstrap(store, env);
    const user = await store.query('SELECT * FROM studio_users WHERE username=?', username).first();
    const candidate = user?.password_hash || `pbkdf2-sha256$100000$${'0'.repeat(64)}$${'0'.repeat(64)}`;
    const valid = await verifyPassword(body.password, candidate);
    if (!user || !user.active || !valid) fail(401, '账号或密码不正确', 'INVALID_CREDENTIALS');
    const token = randomToken(), csrf = randomToken();
    await store.query('INSERT INTO studio_sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)', await digest(token), user.id, csrf, Date.now() + 43200000).run();
    return json({ user: publicUser(user), csrf }, 200, { 'Set-Cookie': cookie(token, request) });
  }
  const user = await store.authenticate(request);
  if (method !== 'GET' && request.headers.get('X-Studio-CSRF') !== user.csrf) fail(403, '登录校验已失效，请重新登录', 'CSRF_REJECTED');
  if (route === '/api/studio/me' && method === 'GET') return json({ user: publicUser(user), csrf: user.csrf, model_configured: !!(env.STUDIO_LLM_API_KEY && env.STUDIO_LLM_BASE_URL), knowledge_configured: knowledgeConfigured(env) });
  if (route === '/api/studio/logout' && method === 'POST') {
    await store.query('DELETE FROM studio_sessions WHERE token_hash=?', user.token_hash).run();
    return json({ logged_out: true }, 200, { 'Set-Cookie': cookie('', request, 0) });
  }
  if (route === '/api/studio/password' && method === 'POST') {
    await store.rateLimit(`password:${user.id}`, 8, 900);
    const body = await readBody(request), original = await store.query('SELECT password_hash FROM studio_users WHERE id=?', user.id).first();
    if (typeof body.current_password !== 'string' || body.current_password.length > 128 || !await verifyPassword(body.current_password, original.password_hash)) fail(400, '当前密码不正确');
    const hash = await passwordHash(checkPassword(body.new_password));
    await store.db.batch([
      store.query('UPDATE studio_users SET password_hash=?,must_change=0 WHERE id=?', hash, user.id),
      store.query('DELETE FROM studio_sessions WHERE user_id=?', user.id),
    ]);
    return json({ changed: true }, 200, { 'Set-Cookie': cookie('', request, 0) });
  }
  if (user.must_change) fail(403, '首次登录请先修改临时密码', 'PASSWORD_CHANGE_REQUIRED');
  if (route === '/api/studio/juzi/sso' && method === 'GET') {
    admin(user);
    const result = await createJuziIframe(store, user, env);
    if (!result) fail(503, '请联系管理员配置句子互动 SSO 参数', 'IDP_NOT_CONFIGURED');
    return json(result);
  }
  if (route === '/api/studio/outreach' && method === 'GET') {
    admin(user);
    return json(await outreachSnapshot(store, env));
  }
  if (route === '/api/studio/outreach/sync' && method === 'POST') {
    admin(user);
    await store.rateLimit(`outreach-sync:${user.id}`, 2, 60);
    return json(await syncContacts(store, env, user, dependencies));
  }
  if (route === '/api/studio/outreach/messages/sync' && method === 'POST') {
    admin(user);
    await store.rateLimit(`outreach-history-sync:${user.id}`, 1, 300);
    return json(await syncConversations(store, env, user, dependencies));
  }
  const botMatch = route.match(/^\/api\/studio\/outreach\/bots\/([\w-]+)$/);
  if (botMatch && method === 'PUT') {
    admin(user);
    return json(await assignBot(store, botMatch[1], await readBody(request)));
  }
  const bindMatch = route.match(/^\/api\/studio\/outreach\/contacts\/([\w-]+)\/bind$/);
  if (bindMatch && method === 'PUT') {
    admin(user);
    return json(await bindContact(store, bindMatch[1], await readBody(request)));
  }
  if (route === '/api/studio/outreach/strategies' && method === 'POST') {
    admin(user);
    await store.rateLimit(`outreach-strategy:${user.id}`, 30, 60);
    return json(await generateStrategies(store, user, await readBody(request), env, dependencies));
  }
  if (route === '/api/studio/outreach/templates' && method === 'POST') {
    admin(user);
    await store.rateLimit(`outreach-template:${user.id}`, 20, 60);
    return json(await createTemplate(store, user, await readBody(request)), 201);
  }
  const templateMatch = route.match(/^\/api\/studio\/outreach\/templates\/([\w-]+)$/);
  if (templateMatch && method === 'PUT') {
    admin(user);
    await store.rateLimit(`outreach-template:${user.id}`, 20, 60);
    return json(await updateTemplate(store, user, templateMatch[1], await readBody(request)));
  }
  if (templateMatch && method === 'DELETE') {
    admin(user);
    return json(await deleteTemplate(store, user, templateMatch[1]));
  }
  const templateGenerateMatch = route.match(/^\/api\/studio\/outreach\/templates\/([\w-]+)\/generate$/);
  if (templateGenerateMatch && method === 'POST') {
    admin(user);
    await store.rateLimit(`outreach-template-generate:${user.id}`, 4, 60);
    return json(await generateTemplateTasks(store, user, { ...(await readBody(request)), template_id: templateGenerateMatch[1] }));
  }
  const salutationMatch = route.match(/^\/api\/studio\/outreach\/contacts\/([\w-]+)\/salutation$/);
  if (salutationMatch && method === 'PUT') {
    admin(user);
    return json(await updateContactSalutation(store, salutationMatch[1], await readBody(request)));
  }
  const replyStatusMatch = route.match(/^\/api\/studio\/outreach\/contacts\/([\w-]+)\/reply-status$/);
  if (replyStatusMatch && method === 'PUT') {
    admin(user);
    return json(await updateContactReplyStatus(store, replyStatusMatch[1], await readBody(request)));
  }
  if (route === '/api/studio/outreach/replies' && method === 'POST') {
    admin(user);
    await store.rateLimit(`outreach-reply:${user.id}`, 12, 60);
    return json(await generateReply(store, user, await readBody(request), env, dependencies), 201);
  }
  const taskMessageMatch = route.match(/^\/api\/studio\/outreach\/tasks\/([\w-]+)\/message$/);
  if (taskMessageMatch && method === 'PUT') {
    admin(user);
    return json(await updateTaskMessage(store, user, taskMessageMatch[1], await readBody(request)));
  }
  const queueMatch = route.match(/^\/api\/studio\/outreach\/tasks\/([\w-]+)\/queue$/);
  if (queueMatch && method === 'POST') {
    admin(user);
    return json(await queueTask(store, queueMatch[1]));
  }
  const taskMatch = route.match(/^\/api\/studio\/outreach\/tasks\/([\w-]+)$/);
  if (taskMatch && method === 'DELETE') {
    admin(user);
    return json(await deleteTask(store, taskMatch[1]));
  }
  const sendMatch = route.match(/^\/api\/studio\/outreach\/tasks\/([\w-]+)\/send$/);
  if (sendMatch && method === 'POST') {
    admin(user);
    return json(await sendTask(store, env, sendMatch[1], dependencies));
  }
  if (route === '/api/studio/outreach/messages' && method === 'GET') {
    admin(user);
    const messages = await store.all(`SELECT m.*,c.display_name AS contact_name FROM studio_outreach_messages m
      LEFT JOIN studio_juzi_contacts c ON c.id=m.contact_id WHERE m.created_at>? ORDER BY m.created_at DESC LIMIT 500`, Date.now() - 2592000000);
    return json({ items: messages, retention_days: 30 });
  }
  if (route === '/api/studio/materials' && method === 'GET') {
    const rows = await store.all('SELECT * FROM studio_materials ORDER BY updated_at DESC');
    return json({ items: rows.filter(row => user.role === 'admin' || row.active) });
  }
  if (route === '/api/studio/materials' && method === 'POST') {
    admin(user); const data = validateMaterial(await readBody(request)), id = crypto.randomUUID(), at = Date.now();
    const row = { ...data, id, version: 1, updated_by: user.id, updated_at: at };
    await store.db.batch([
      store.query(`INSERT INTO studio_materials(id,version,title,kind,audience,product,price,specification,applicable,effect,usage_notes,precautions,content,valid_from,valid_to,active,updated_by,updated_at)
        VALUES(?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, data.title, data.kind, data.audience, data.product,
        data.price, data.specification, data.applicable, data.effect, data.usage_notes, data.precautions,
        data.content, data.valid_from, data.valid_to, data.active, user.id, at),
      store.query('INSERT INTO studio_material_versions(material_id,version,snapshot,updated_by,updated_at) VALUES(?,1,?,?,?)', id, JSON.stringify(row), user.id, at),
    ]);
    return json(row, 201);
  }
  const materialMatch = route.match(/^\/api\/studio\/materials\/([\w-]+)(\/versions)?$/);
  if (materialMatch) {
    admin(user); const id = materialMatch[1];
    if (materialMatch[2] && method === 'GET') return json({ items: await store.all('SELECT version,snapshot,updated_by,updated_at FROM studio_material_versions WHERE material_id=? ORDER BY version DESC', id) });
    if (!materialMatch[2] && method === 'PUT') {
      const body = await readBody(request), data = validateMaterial(body);
      if (!Number.isInteger(body.version)) fail(400, '缺少资料版本');
      const row = { ...data, id, version: body.version + 1, updated_by: user.id, updated_at: Date.now() };
      const result = await store.db.batch([
        store.query(`UPDATE studio_materials
          SET title=?,kind=?,audience=?,product=?,price=?,specification=?,applicable=?,effect=?,usage_notes=?,precautions=?,content=?,valid_from=?,valid_to=?,active=?,version=version+1,updated_by=?,updated_at=?
          WHERE id=? AND version=? RETURNING id`,
          data.title, data.kind, data.audience, data.product, data.price, data.specification, data.applicable, data.effect, data.usage_notes, data.precautions,
          data.content, data.valid_from, data.valid_to, data.active, user.id, row.updated_at, id, body.version),
        store.query(`INSERT INTO studio_material_versions(material_id,version,snapshot,updated_by,updated_at)
          SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM studio_materials WHERE id=? AND version=? AND updated_at=?)
            AND NOT EXISTS(SELECT 1 FROM studio_material_versions WHERE material_id=? AND version=?)`,
          id, row.version, JSON.stringify(row), user.id, row.updated_at, id, row.version, row.updated_at, id, row.version),
      ]);
     if (!result[0].results.length) fail(409, '资料已被更新，请刷新后再编辑', 'MATERIAL_CHANGED');
     return json(row);
   }
    if (!materialMatch[2] && method === 'DELETE') {
      await store.db.batch([
        store.query('DELETE FROM studio_material_versions WHERE material_id=?', id),
        store.query('DELETE FROM studio_materials WHERE id=?', id),
      ]);
      return json({ ok: true });
    }
 }
  if (route === '/api/studio/generations' && method === 'POST') {
    await store.cleanup();
    await store.rateLimit(`generate:${user.id}`, 12, 60);
    return json(await generate(store, user, await readBody(request), env, dependencies.fetchModel, dependencies.fetchKnowledge));
  }
  if (route === '/api/studio/ocr' && method === 'POST') {
    const form = await request.formData();
    const file = form.get('screenshot');
    return json(await recognizeScreenshot(file, env, dependencies.fetchVision));
  }
  if (route === '/api/studio/customers' && method === 'GET') {
    const where = user.role === 'admin' ? '1=1' : 'c.owner_user_id=?';
    const args = user.role === 'admin' ? [] : [user.id];
    const rows = await store.all(`SELECT c.*,u.display_name AS owner_name FROM studio_customers c
      LEFT JOIN studio_users u ON u.id=c.owner_user_id WHERE ${where} ORDER BY c.updated_at DESC`, ...args);
    return json({ items: rows });
  }
  if (route === '/api/studio/customers' && method === 'POST') {
    const body = await readBody(request), data = validateCustomer(body, user), id = crypto.randomUUID();
    const owner = user.role === 'admin' && typeof body.owner_user_id === 'string' && body.owner_user_id ? body.owner_user_id : user.id;
    if (!(await store.query('SELECT id FROM studio_users WHERE id=? AND active=1', owner).first())) fail(400, '归属顾问不存在');
    await store.query(`INSERT INTO studio_customers(id,display_name,audience,owner_user_id,salutation,phone_suffix,purchased_products,interests,concerns,contraindications,notes,active,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?,?)`, id, data.display_name, data.audience, owner, data.salutation, data.phone_suffix,
      data.purchased_products, data.interests, data.concerns, data.contraindications, data.notes, user.id, Date.now()).run();
    return json({ id }, 201);
  }
  const customerMatch = route.match(/^\/api\/studio\/customers\/([\w-]+)$/);
  if (customerMatch && method === 'PUT') {
    const id = customerMatch[1], row = await store.query('SELECT * FROM studio_customers WHERE id=?', id).first();
    if (!row) fail(404, '客户档案不存在');
    if (row.owner_user_id !== user.id) fail(403, '只能编辑自己维护的客户档案', 'FORBIDDEN');
    const body = await readBody(request);
    if (typeof body.active === 'boolean' && Object.keys(body).length === 1) {
      await store.query('UPDATE studio_customers SET active=? WHERE id=?', body.active ? 1 : 0, id).run();
      return json({ updated: true });
    }
    const data = validateCustomer(body, user);
    await store.query(`UPDATE studio_customers SET display_name=?,audience=?,salutation=?,phone_suffix=?,purchased_products=?,interests=?,concerns=?,contraindications=?,notes=?,active=?,updated_by=?,updated_at=?
      WHERE id=?`, data.display_name, data.audience, data.salutation, data.phone_suffix, data.purchased_products,
      data.interests, data.concerns, data.contraindications, data.notes, data.active, user.id, Date.now(), id).run();
    return json({ updated: true });
  }
  if (route === '/api/studio/feedback' && method === 'POST') {
    const body = await feedbackBody(request);
    if (!['direct', 'edited', 'unusable'].includes(body.rating) || typeof body.generation_id !== 'string') fail(400, '反馈格式不正确');
    if (body.rating === 'unusable' && !ISSUE_REASONS.includes(body.reason)) fail(400, '请选择不可用原因');
    const result = await store.query("UPDATE studio_usage SET feedback=? WHERE id=? AND user_id=? AND status='ready' RETURNING id", body.rating, body.generation_id, user.id).first();
    if (!result) fail(404, '未找到可反馈的本次生成');
    await store.query("UPDATE studio_conversations SET feedback=? WHERE usage_id=? AND user_id=?", body.rating, body.generation_id, user.id).run();
    if (body.rating === 'unusable') {
      const note = textValue(body.note, 500, '补充说明');
      await store.query(`INSERT INTO studio_issues(id,generation_id,user_id,reason,note,screenshot,status,created_at)
        VALUES(?,?,?,?,?,?,'open',?)`, crypto.randomUUID(), body.generation_id, user.id, body.reason, note, body.screenshot ?? null, Date.now()).run();
    }
    return json({ recorded: true });
  }
  if (route === '/api/studio/issues' && method === 'GET') {
    admin(user);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const status = url.searchParams.get('status');
    const where = status ? 'i.status=?' : '1=1', args = status ? [status] : [];
    const total = await store.query(`SELECT COUNT(*) AS n FROM studio_issues i WHERE ${where}`, ...args).first();
    const rows = await store.all(`SELECT i.*,u.display_name,c.audience,c.scene,c.reply,c.messages
      FROM studio_issues i LEFT JOIN studio_users u ON u.id=i.user_id
      LEFT JOIN studio_conversations c ON c.usage_id=i.generation_id
      WHERE ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
    return json({ items: rows.map(row => ({ ...row, messages: row.messages ? JSON.parse(row.messages) : [] })), total, page, limit });
  }
  const issueMatch = route.match(/^\/api\/studio\/issues\/([\w-]+)$/);
  if (issueMatch && method === 'PUT') {
    admin(user);
    const body = await readBody(request);
    if (!['open', 'processing', 'resolved'].includes(body.status)) fail(400, '问题状态不正确');
    const result = await store.query('UPDATE studio_issues SET status=? WHERE id=? RETURNING id', body.status, issueMatch[1]).first();
    if (!result) fail(404, '问题不存在');
    return json({ updated: true });
  }
  if (route === '/api/studio/usage' && method === 'GET') {
    const month = monthKey();
    const own = await store.query(`SELECT COUNT(*) AS calls,SUM(cost) AS cost,
      SUM(CASE WHEN feedback IN ('direct','edited') THEN 1 ELSE 0 END) AS adopted,
      SUM(CASE WHEN feedback IS NOT NULL THEN 1 ELSE 0 END) AS rated,
      SUM(CASE WHEN status='ready' AND elapsed_ms<=10000 THEN 1 ELSE 0 END) AS fast,
      SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) AS ready
      FROM studio_usage WHERE month=? AND (?='admin' OR user_id=?)`, month, user.role, user.id).first();
    return json({ summary: own });
  }
  if (route === '/api/studio/conversations' && method === 'GET') {
    admin(user);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const offset = (page - 1) * limit;
    let where = '1=1', args = [];
    const fUser = url.searchParams.get('user');
    if (fUser) { where += ' AND c.user_id=?'; args.push(fUser); }
    const fScene = url.searchParams.get('scene');
    if (fScene) { where += ' AND c.scene=?'; args.push(fScene); }
    const fAudience = url.searchParams.get('audience');
    if (fAudience) { where += ' AND c.audience=?'; args.push(fAudience); }
    const fFeedback = url.searchParams.get('feedback');
    if (fFeedback) { where += ' AND c.feedback=?'; args.push(fFeedback); }
    const fStatus = url.searchParams.get('status');
    if (fStatus) { where += ' AND c.status=?'; args.push(fStatus); }
    const total = await store.query(`SELECT COUNT(*) AS n FROM studio_conversations c WHERE ${where}`, ...args).first();
    const rows = await store.all(`SELECT c.*,u.username,u.display_name FROM studio_conversations c
      LEFT JOIN studio_users u ON u.id=c.user_id WHERE ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`, ...args, limit, offset);
    return json({ items: rows.map(r => ({ ...r, messages: JSON.parse(r.messages), followups: JSON.parse(r.followups || '[]'), resources: JSON.parse(r.resources || '[]') })), total: total.n, page, limit });
  }
  const convMatch = route.match(/^\/api\/studio\/conversations\/([\w-]+)$/);
  if (convMatch && method === 'GET') {
    admin(user);
    const row = await store.query('SELECT c.*,u.username,u.display_name FROM studio_conversations c LEFT JOIN studio_users u ON u.id=c.user_id WHERE c.id=?', convMatch[1]).first();
    if (!row) fail(404, '留档记录不存在');
    return json({ ...row, messages: JSON.parse(row.messages), followups: JSON.parse(row.followups || '[]'), resources: JSON.parse(row.resources || '[]') });
  }
  if (route === '/api/studio/users' && method === 'GET') {
    admin(user); return json({ items: await store.all('SELECT id,username,display_name,role,active,must_change,created_at FROM studio_users ORDER BY created_at') });
  }
  if (route === '/api/studio/users' && method === 'POST') {
    admin(user); const body = await readBody(request);
    if (!cleanName(body.username) || !['admin', 'sales'].includes(body.role)) fail(400, '请填写正确的账号和角色');
    if (await store.query('SELECT id FROM studio_users WHERE username=?', body.username).first()) fail(409, '账号已存在');
    if (typeof body.display_name !== 'string' || !body.display_name.trim() || body.display_name.length > 40) fail(400, '请填写显示名称');
    const id = crypto.randomUUID(), hash = await passwordHash(checkPassword(body.password));
    await store.query(`INSERT INTO studio_users(id,username,display_name,password_hash,role,active,must_change,created_at) VALUES(?,?,?,?,?,1,1,?)`, id, body.username, maskText(body.display_name.trim()), hash, body.role, Date.now()).run();
    return json({ id }, 201);
  }
  const userMatch = route.match(/^\/api\/studio\/users\/([\w-]+)$/);
  if (userMatch && method === 'PUT') {
    admin(user); const body = await readBody(request), id = userMatch[1];
    const target = await store.query('SELECT id FROM studio_users WHERE id=?', id).first();
    if (!target) fail(404, '账号不存在');
    if (typeof body.active === 'boolean') {
      const updated = await store.query(`UPDATE studio_users SET active=? WHERE id=? AND
        (?=1 OR role!='admin' OR active=0 OR (SELECT COUNT(*) FROM studio_users WHERE role='admin' AND active=1)>1) RETURNING id`, body.active ? 1 : 0, id, body.active ? 1 : 0).first();
      if (!updated) fail(409, '至少保留一位可用管理员');
    } else if (body.password) {
      await store.query('UPDATE studio_users SET password_hash=?,must_change=1 WHERE id=?', await passwordHash(checkPassword(body.password)), id).run();
    } else fail(400, '请选择停用、启用或重置密码');
    await store.query('DELETE FROM studio_sessions WHERE user_id=?', id).run();
    return json({ updated: true });
  }
  fail(404, '接口不存在', 'NOT_FOUND');
}

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'none'";
export async function handle(request, env, dependencies = {}) {
  const url = new URL(request.url);
  if (url.pathname === '/api/webhooks/upstream/messages') {
    const callbackOK = () => new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
    if (!env.DB) return callbackOK();
    try { return await handleJuziCallback(request, env, new Store(env.DB)); }
    catch { return callbackOK(); }
  }
  if (url.pathname.startsWith('/oauth2/')) {
    if (!env.DB) return oauthUnavailable();
    try { return await handleOauth(request, env, new Store(env.DB)); }
    catch { return oauthUnavailable(); }
  }
  if (url.pathname.startsWith('/api/studio')) {
    try { return await api(request, env, dependencies); }
    catch (error) {
      const known = error instanceof HttpError, status = known ? error.status : 500;
      // Never log exceptions, prompts or request/response bodies; record only a random trace identifier.
     const trace = crypto.randomUUID();
      if (!known) console.warn(`studio_error trace=${trace} error=${error?.message} stack=${error?.stack?.split('\n').slice(0,3).join(' | ')}`);
      return new Response(JSON.stringify({ success: false, error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '服务暂时异常，请稍后重试', trace_id: trace } }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  }
 if (url.pathname === '/script-studio/') {
   url.pathname = '/script-studio';
   return new Response(null, { status: 302, headers: { Location: url.pathname + url.search, 'Cache-Control': 'no-store' } });
 }
  // Serve the script studio's standalone page directly at /script-studio
  if (url.pathname === '/script-studio') url.pathname = '/script-studio/index.html';
  if (!env.ASSETS) return new Response('Static assets are not configured', { status: 503 });
  const asset = await env.ASSETS.fetch(new Request(url, request));
  if (!url.pathname.startsWith('/script-studio')) return asset;
  const response = new Response(asset.body, asset);
  response.headers.set('Content-Security-Policy', CSP);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

const oauthUnavailable = () => new Response(JSON.stringify({ error: 'invalid_request' }), {
  status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
export default { fetch: handle };
