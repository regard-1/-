import { fail } from './security.mjs';
import { juziConfigured, listCustomers, sendText } from './juzi.mjs';
import { MODEL, maskText, chinaDay, AUDIENCES } from '../shared.mjs';

const textValue = (value, maximum, label) => {
  if (typeof value !== 'string' || !value.trim()) fail(400, `请填写${label}`);
  const text = maskText(value.trim());
  if (text.length > maximum) fail(400, `${label}过长`);
  return text;
};

function normalizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return Date.now();
  return numeric < 10000000000 ? numeric * 1000 : numeric;
}

export async function outreachSnapshot(store, env) {
  const [bots, contacts, tasks, messages] = await Promise.all([
    store.all(`SELECT b.*,u.display_name AS owner_name FROM studio_juzi_bots b
      LEFT JOIN studio_users u ON u.id=b.owner_user_id ORDER BY b.bot_name`),
    store.all(`SELECT c.*,l.display_name AS local_customer_name,l.audience AS local_customer_audience,
      l.salutation,l.purchased_products,l.interests,l.concerns,l.contraindications,l.notes,
      u.display_name AS owner_name FROM studio_juzi_contacts c
      LEFT JOIN studio_customers l ON l.id=c.local_customer_id
      LEFT JOIN studio_users u ON u.id=l.owner_user_id ORDER BY c.display_name LIMIT 500`),
    store.all(`SELECT t.*,c.display_name AS contact_name,l.display_name AS customer_name,
      b.bot_name,b.im_bot_id FROM studio_outreach_tasks t
      JOIN studio_juzi_contacts c ON c.id=t.contact_id
      LEFT JOIN studio_customers l ON l.id=t.local_customer_id
      JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id
      ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,t.created_at DESC LIMIT 200`),
    store.all(`SELECT m.*,c.display_name AS contact_name FROM studio_outreach_messages m
      LEFT JOIN studio_juzi_contacts c ON c.id=m.contact_id ORDER BY m.created_at DESC LIMIT 200`),
  ]);
  const localCustomers = await store.all(`SELECT c.id,c.display_name,c.audience,c.phone_suffix,u.display_name AS owner_name
    FROM studio_customers c LEFT JOIN studio_users u ON u.id=c.owner_user_id WHERE c.active=1 ORDER BY c.display_name`);
  const counts = {
    contacts: contacts.length,
    bound: contacts.filter(c => c.match_status === 'bound').length,
    suggested: contacts.filter(c => c.match_status === 'suggested').length,
    ambiguous: contacts.filter(c => c.match_status === 'ambiguous').length,
    draft: tasks.filter(t => t.status === 'draft').length,
    queued: tasks.filter(t => t.status === 'queued').length,
  };
  return { connected: juziConfigured(env), configured: juziConfigured(env), bots, contacts, tasks, messages, local_customers: localCustomers, counts };
}

function phoneSuffix(values = []) {
  for (const value of values || []) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(-4);
  }
  return '';
}

export async function syncContacts(store, env, user, dependencies = {}) {
  const rows = [];
  let seq = '', pages = 0;
  do {
    const page = await listCustomers(env, dependencies, seq || undefined);
    rows.push(...page.items);
    seq = page.nextSeq;
    pages++;
  } while (seq && pages < 10);
  const now = Date.now(), botIds = new Set();
  for (const row of rows) {
    const imBotId = String(row?.botInfo?.imBotId || '');
    const imContactId = String(row?.imContactId || '');
    if (!imBotId || !imContactId) continue;
    botIds.add(imBotId);
    await store.query(`INSERT INTO studio_juzi_bots(im_bot_id,bot_name,owner_user_id,last_synced_at)
      VALUES(?,?,NULL,?) ON CONFLICT(im_bot_id) DO UPDATE SET bot_name=excluded.bot_name,last_synced_at=excluded.last_synced_at`,
      imBotId, maskText(String(row.botInfo?.name || '')).slice(0, 80), now).run();
    await store.query(`INSERT INTO studio_juzi_contacts(id,im_contact_id,external_user_id,display_name,phone_suffix,gender,im_bot_id,friendship_status,local_customer_id,match_status,last_synced_at)
      VALUES(?,?,?,?,?,?,?,?,NULL,'unmatched',?)
      ON CONFLICT(im_contact_id) DO UPDATE SET external_user_id=excluded.external_user_id,display_name=excluded.display_name,
      phone_suffix=excluded.phone_suffix,gender=excluded.gender,im_bot_id=excluded.im_bot_id,
      friendship_status=excluded.friendship_status,last_synced_at=excluded.last_synced_at`,
      crypto.randomUUID(), imContactId, String(row?.imInfo?.externalUserId || '').slice(0, 128),
      maskText(String(row?.name || '')).slice(0, 80), phoneSuffix(row?.remarkMobiles),
      Number.isInteger(row?.gender) ? row.gender : 0, imBotId,
      Number.isInteger(row?.friendshipStatus) ? row.friendshipStatus : 0, now).run();
  }
  for (const botId of botIds) await store.query('UPDATE studio_juzi_bots SET last_synced_at=? WHERE im_bot_id=?', now, botId).run();

  const contacts = await store.all('SELECT id,display_name,phone_suffix,local_customer_id,match_status FROM studio_juzi_contacts');
  const customers = await store.all('SELECT id,display_name,phone_suffix,active FROM studio_customers');
  const counts = { bound: 0, suggested: 0, ambiguous: 0, unmatched: 0 };
  for (const contact of contacts) {
    if (contact.local_customer_id && customers.some(c => c.id === contact.local_customer_id && c.active)) { counts.bound++; continue; }
    const byPhone = customers.filter(c => c.active && c.phone_suffix && c.phone_suffix === contact.phone_suffix);
    const exactName = byPhone.filter(c => c.display_name === contact.display_name);
    const candidates = exactName.length === 1 ? exactName : byPhone;
    const status = candidates.length === 1 ? 'suggested' : candidates.length > 1 ? 'ambiguous' : 'unmatched';
    counts[status]++;
    if (contact.match_status !== status || contact.local_customer_id) {
      await store.query('UPDATE studio_juzi_contacts SET match_status=?,local_customer_id=NULL WHERE id=?', status, contact.id).run();
    }
  }
  return { synced: rows.length, pages, bots: botIds.size, ...counts };
}

export async function assignBot(store, id, body) {
  const owner = body.owner_user_id === null || body.owner_user_id === '' ? null : String(body.owner_user_id || '');
  if (owner) {
    const row = await store.query("SELECT id FROM studio_users WHERE id=? AND active=1 AND role='sales'", owner).first();
    if (!row) fail(400, '归属顾问不存在');
  }
  const result = await store.query('UPDATE studio_juzi_bots SET owner_user_id=? WHERE im_bot_id=? RETURNING im_bot_id', owner, id).first();
  if (!result) fail(404, '托管账号不存在');
  return { updated: true };
}

export async function bindContact(store, id, body) {
  const contact = await store.query('SELECT * FROM studio_juzi_contacts WHERE id=?', id).first();
  if (!contact) fail(404, '句子互动客户不存在');
  const customerId = body.local_customer_id === null || body.local_customer_id === '' ? null : String(body.local_customer_id || '');
  if (customerId) {
    const customer = await store.query('SELECT id,active FROM studio_customers WHERE id=?', customerId).first();
    if (!customer || !customer.active) fail(400, '本地客户档案不存在或已停用');
  }
  await store.query('UPDATE studio_juzi_contacts SET local_customer_id=?,match_status=? WHERE id=?',
    customerId, customerId ? 'bound' : 'unmatched', id).run();
  return { updated: true };
}

function modelBase(env) {
  if (!env.STUDIO_LLM_API_KEY || !env.STUDIO_LLM_BASE_URL) fail(503, '真实生成服务尚未配置，请联系管理员', 'MODEL_NOT_CONFIGURED');
  try {
    const base = new URL(env.STUDIO_LLM_BASE_URL);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) fail(503, '模型服务配置不正确', 'MODEL_NOT_CONFIGURED');
    return base;
  } catch { fail(503, '模型服务配置不正确', 'MODEL_NOT_CONFIGURED'); }
}

function extractJSON(text) {
  const fence = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/);
  const value = fence ? fence[1].trim() : String(text || '').trim();
  const start = value.indexOf('{'), end = value.lastIndexOf('}');
  if (start === -1 || end <= start) fail(502, '模型返回格式异常，请重试', 'MODEL_FORMAT');
  try { return JSON.parse(value.slice(start, end + 1)); } catch { fail(502, '模型返回格式异常，请重试', 'MODEL_FORMAT'); }
}

function validateTasks(output, candidates) {
  const allowed = new Map(candidates.map(c => [c.id, c]));
  if (!output || typeof output !== 'object' || !Array.isArray(output.tasks)) fail(502, '模型返回格式异常，请重试', 'MODEL_FORMAT');
  const tasks = output.tasks.slice(0, 20).map(item => {
    const candidate = allowed.get(String(item?.contact_id || ''));
    if (!candidate) fail(502, '触达策略包含未提供的客户，请重试', 'MODEL_FORMAT');
    const message = textValue(item.recommended_message, 600, '触达话术');
    if (/保证|一定有效|包治|替代药物|建议停药|高价值客户|内部评分/.test(message)) fail(502, '触达话术包含不安全表述，请重试', 'UNSAFE_STRATEGY');
    return {
      contact_id: candidate.id, local_customer_id: candidate.local_customer_id, audience: candidate.audience,
      priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
      reason: maskText(String(item.reason || '')).slice(0, 600), recommended_message: message,
      next_action: maskText(String(item.next_action || '')).slice(0, 600),
      stop_rule: maskText(String(item.stop_rule || '')).slice(0, 600),
    };
  });
  if (!tasks.length) fail(502, '模型未返回可执行的触达策略，请重试', 'MODEL_FORMAT');
  return tasks;
}

export async function generateStrategies(store, user, body, env, dependencies = {}) {
  const limit = Math.min(20, Math.max(1, Number(body?.limit) || 10));
  const audience = AUDIENCES[body?.audience] ? body.audience : null;
  const candidates = (await store.all(`SELECT c.id,c.im_contact_id,c.display_name,c.local_customer_id,
    l.audience,l.display_name AS customer_name,l.salutation,l.purchased_products,l.interests,l.concerns,
    l.contraindications,l.notes,b.im_bot_id,b.bot_name,u.display_name AS owner_name
    FROM studio_juzi_contacts c JOIN studio_customers l ON l.id=c.local_customer_id AND l.active=1
    JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id LEFT JOIN studio_users u ON u.id=l.owner_user_id
    WHERE c.match_status='bound' ${audience ? 'AND l.audience=?' : ''} ORDER BY c.display_name`,
    ...(audience ? [audience] : []))).slice(0, limit).map(c => ({ ...c, recent_messages: [] }));
  const recent = await store.all(`SELECT contact_id,direction,content,created_at FROM studio_outreach_messages
    WHERE created_at>? ORDER BY created_at DESC LIMIT 500`, Date.now() - 2592000000);
  for (const candidate of candidates) candidate.recent_messages = recent.filter(m => m.contact_id === candidate.id).slice(0, 5).reverse();
  if (!candidates.length) fail(400, '暂无已人工绑定的客户，请先同步并确认匹配');
  const materials = await store.all(`SELECT title,kind,audience,product,content,valid_from,valid_to
    FROM studio_materials WHERE active=1 ORDER BY updated_at DESC LIMIT 12`);
  const base = modelBase(env);
  const modelBody = {
    model: MODEL, stream: false, max_tokens: 4096, enable_search: false, enable_thinking: false,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `你是多特倍斯私域触达策略助手。只依据输入客户档案和近期消息选择值得触达的客户，生成一客一策的开口消息。目标优先解决客户回复，不默认推销。不得编造购买历史、剩余数量、价格、活动、功效保证或个体医疗建议；没有资料支持时不写具体产品事实。语气自然亲切，可沿用已确认称呼。输出 JSON：{"tasks":[{"contact_id":"","priority":"high/medium/low","reason":"","recommended_message":"","next_action":"","stop_rule":""}]}。` },
      { role: 'user', content: JSON.stringify({ today: chinaDay(), audience, candidates, materials }) },
    ],
  };
  let response;
  try {
    response = await dependencies.fetchModel(`${base.href.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(60000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.STUDIO_LLM_API_KEY}` },
      body: JSON.stringify(modelBody),
    });
  } catch { fail(502, '触达策略生成超时或连接异常，请稍后重试', 'MODEL_UNAVAILABLE'); }
  if (!response.ok) fail(502, '触达策略生成服务暂时不可用，请稍后重试', 'MODEL_UNAVAILABLE');
  let payload; try { payload = await response.json(); } catch { fail(502, '触达策略生成格式异常，请重试', 'MODEL_FORMAT'); }
  const tasks = validateTasks(extractJSON(payload.choices?.[0]?.message?.content || ''), candidates);
  const now = Date.now(), created = [];
  for (const task of tasks) {
    const id = crypto.randomUUID();
    await store.query(`INSERT INTO studio_outreach_tasks(id,contact_id,local_customer_id,audience,priority,reason,recommended_message,next_action,stop_rule,status,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,'draft',?,?)`, id, task.contact_id, task.local_customer_id, task.audience,
      task.priority, task.reason, task.recommended_message, task.next_action, task.stop_rule, user.id, now).run();
    created.push({ id, ...task, status: 'draft', created_at: now });
  }
  return { created_count: created.length, tasks: created };
}

export async function queueTask(store, id) {
  const result = await store.query("UPDATE studio_outreach_tasks SET status='queued' WHERE id=? AND status='draft' RETURNING id", id).first();
  if (!result) fail(404, '触达任务不存在或不是待入队状态');
  return { queued: true };
}

export async function sendTask(store, env, id, dependencies = {}) {
  const task = await store.query(`SELECT t.*,c.im_contact_id,c.im_bot_id FROM studio_outreach_tasks t
    JOIN studio_juzi_contacts c ON c.id=t.contact_id WHERE t.id=?`, id).first();
  if (!task) fail(404, '触达任务不存在');
  if (task.status !== 'queued') fail(409, '仅已入队任务可发送，请先入队');
  if (!task.local_customer_id) fail(409, '请先人工绑定本地客户档案');
  const externalId = crypto.randomUUID(), now = Date.now();
  await store.query(`INSERT INTO studio_outreach_messages(id,task_id,contact_id,direction,content,external_request_id,status,created_at)
    VALUES(?,?,?,'outbound',?,?,'pending',?)`, externalId, task.id, task.contact_id, task.recommended_message, externalId, now).run();
  try {
    const result = await sendText(env, dependencies, {
      imBotId: task.im_bot_id, imContactId: task.im_contact_id,
      text: task.recommended_message, externalRequestId: externalId,
    });
    await store.query("UPDATE studio_outreach_messages SET status='sent',request_id=? WHERE external_request_id=?", result.requestId, externalId).run();
    await store.query("UPDATE studio_outreach_tasks SET status='sent' WHERE id=?", task.id).run();
    return { sent: true, message_id: externalId, request_id: result.requestId };
  } catch (error) {
    await store.query("UPDATE studio_outreach_messages SET status='failed',error=? WHERE external_request_id=?",
      maskText(error?.message || '发送失败').slice(0, 500), externalId).run();
    throw error;
  }
}

export async function handleJuziCallback(request, env, store) {
  const callbackOK = () => new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), {
    status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
  let body;
  try { body = await request.json(); } catch { return callbackOK(); }
  if (!env.WECOM_API_TOKEN || String(body?.token || '') !== env.WECOM_API_TOKEN) return callbackOK();
  if (!body?.messageId || !body?.imContactId || Number(body?.messageType) !== 7 || typeof body?.payload?.text !== 'string') return callbackOK();
  const contact = await store.query('SELECT id FROM studio_juzi_contacts WHERE im_contact_id=?', String(body.imContactId)).first();
  if (!contact) return callbackOK();
  await store.query(`INSERT INTO studio_outreach_messages(id,task_id,contact_id,direction,content,message_id,status,error,created_at)
    VALUES(?,?,?,?,?,?, 'received', '', ?) ON CONFLICT(message_id) DO NOTHING`,
    crypto.randomUUID(), null, contact.id, body.isSelf ? 'outbound' : 'inbound',
    maskText(body.payload.text).slice(0, 4000), String(body.messageId).slice(0, 128), normalizeTimestamp(body.timestamp)).run();
  return callbackOK();
}
