import { Store } from './store.mjs';
import { checkOrigin, readBody, fail, HttpError, json, checkPassword, passwordHash, verifyPassword, randomToken, digest, cookie } from './security.mjs';
import { generate, validateMaterial } from './generation.mjs';
import { maskText, MODEL, monthKey } from '../shared.mjs';

const cleanName = value => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_.-]{2,39}$/.test(value);
const publicUser = u => ({ id: u.id, username: u.username, display_name: u.display_name, role: u.role, must_change: !!u.must_change });
const admin = user => { if (user.role !== 'admin') fail(403, '仅管理员可执行此操作', 'FORBIDDEN'); };
const localSetup = (request, env) => env.STUDIO_LOCAL_SETUP === '1' && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname);

async function bootstrap(store, env) {
  if (!env.STUDIO_BOOTSTRAP_USERNAME || !env.STUDIO_BOOTSTRAP_PASSWORD_HASH) return;
  if (!cleanName(env.STUDIO_BOOTSTRAP_USERNAME)) fail(503, '管理员初始化配置不正确');
  await store.query(`INSERT OR IGNORE INTO studio_users(id,username,display_name,password_hash,role,active,must_change,created_at)
    SELECT ?,?,?,?,'admin',1,0,? WHERE NOT EXISTS(SELECT 1 FROM studio_users)`, crypto.randomUUID(), env.STUDIO_BOOTSTRAP_USERNAME, '资料管理员', env.STUDIO_BOOTSTRAP_PASSWORD_HASH, Date.now()).run();
}

export async function api(request, env, dependencies = {}) {
  const url = new URL(request.url), route = url.pathname.replace(/\/$/, ''), method = request.method;
  if (!env.DB) fail(503, '资料服务尚未配置', 'DATABASE_NOT_CONFIGURED');
  const store = new Store(env.DB);
  if (!['GET', 'POST', 'PUT'].includes(method)) fail(405, '不支持此操作');
  if (method !== 'GET') checkOrigin(request);
 if (route === '/api/studio/status' && method === 'GET') {
   const count = await store.query('SELECT COUNT(*) AS n FROM studio_users').first();
    const noUsers = !count.n;
    return json({ model_configured: !!(env.STUDIO_LLM_API_KEY && env.STUDIO_LLM_BASE_URL), local_setup: noUsers, model: MODEL });
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
  if (route === '/api/studio/me' && method === 'GET') return json({ user: publicUser(user), csrf: user.csrf, model_configured: !!(env.STUDIO_LLM_API_KEY && env.STUDIO_LLM_BASE_URL) });
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
  if (route === '/api/studio/materials' && method === 'GET') {
    const rows = await store.all('SELECT * FROM studio_materials ORDER BY updated_at DESC');
    return json({ items: rows.filter(row => user.role === 'admin' || row.active) });
  }
  if (route === '/api/studio/materials' && method === 'POST') {
    admin(user); const data = validateMaterial(await readBody(request)), id = crypto.randomUUID(), at = Date.now();
    const row = { ...data, id, version: 1, updated_by: user.id, updated_at: at };
    await store.db.batch([
      store.query(`INSERT INTO studio_materials(id,version,title,kind,audience,product,content,valid_from,valid_to,active,updated_by,updated_at)
        VALUES(?,1,?,?,?,?,?,?,?,?,?,?)`, id, data.title, data.kind, data.audience, data.product, data.content, data.valid_from, data.valid_to, data.active, user.id, at),
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
        store.query(`UPDATE studio_materials SET title=?,kind=?,audience=?,product=?,content=?,valid_from=?,valid_to=?,active=?,version=version+1,updated_by=?,updated_at=?
          WHERE id=? AND version=? RETURNING id`, data.title, data.kind, data.audience, data.product, data.content, data.valid_from, data.valid_to, data.active, user.id, row.updated_at, id, body.version),
        store.query('INSERT INTO studio_material_versions(material_id,version,snapshot,updated_by,updated_at) SELECT ?,?,?,?,? WHERE changes()=1', id, row.version, JSON.stringify(row), user.id, row.updated_at),
      ]);
      if (!result[0].results.length) fail(409, '资料已被更新，请刷新后再编辑', 'MATERIAL_CHANGED');
      return json(row);
    }
  }
  if (route === '/api/studio/generations' && method === 'POST') {
    await store.cleanup();
    await store.rateLimit(`generate:${user.id}`, 12, 60);
    return json(await generate(store, user, await readBody(request), env, dependencies.fetchModel));
  }
  if (route === '/api/studio/feedback' && method === 'POST') {
    const body = await readBody(request);
    if (!['direct', 'edited', 'unusable'].includes(body.rating) || typeof body.generation_id !== 'string') fail(400, '反馈格式不正确');
    const result = await store.query("UPDATE studio_usage SET feedback=? WHERE id=? AND user_id=? AND status='ready' RETURNING id", body.rating, body.generation_id, user.id).first();
    if (!result) fail(404, '未找到可反馈的本次生成');
    await store.query("UPDATE studio_conversations SET feedback=? WHERE usage_id=? AND user_id=?", body.rating, body.generation_id, user.id).run();
    return json({ recorded: true });
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
  if (url.pathname.startsWith('/api/studio')) {
    try { return await api(request, env, dependencies); }
    catch (error) {
      const known = error instanceof HttpError, status = known ? error.status : 500;
      // Never log exceptions, prompts or request/response bodies; record only a random trace identifier.
      const trace = crypto.randomUUID();
      if (!known) console.warn(`studio_error trace=${trace}`);
      return new Response(JSON.stringify({ success: false, error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '服务暂时异常，请稍后重试', trace_id: trace } }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  }
  if (url.pathname === '/script-studio/') {
    url.pathname = '/script-studio';
    return new Response(null, { status: 302, headers: { Location: url.pathname + url.search, 'Cache-Control': 'no-store' } });
  }
  // The direct entry uses the original application shell; only the iframe loads the isolated tool.
  if (url.pathname === '/script-studio') url.pathname = '/index.html';
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
export default { fetch: handle };
