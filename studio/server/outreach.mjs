import { fail } from './security.mjs';
import { juziConfigured, listCustomers, listHistory, sendText } from './juzi.mjs';
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
  const day = chinaDay();
  const [bots, contacts, tasks, messages, profileUpdates] = await Promise.all([
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
    store.all(`SELECT p.*,c.display_name AS contact_name FROM studio_customer_profile_updates p
      LEFT JOIN studio_juzi_contacts c ON c.id=p.contact_id ORDER BY p.created_at DESC LIMIT 100`),
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
    sentToday: tasks.filter(t => t.status === 'sent' && t.plan_day === day).length,
    today: tasks.filter(t => t.plan_day === day).length,
    messages: messages.length,
  };
  return { connected: juziConfigured(env), configured: juziConfigured(env), model_configured: !!(env.STUDIO_LLM_API_KEY && env.STUDIO_LLM_BASE_URL), plan_day: day,
    bots, contacts, tasks, messages, profile_updates: profileUpdates,
    local_customers: localCustomers, counts };
}

function phoneSuffix(values = []) {
  for (const value of values || []) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(-4);
  }
  return '';
}

function normalizeTags(...groups) {
  const values = [];
  for (const group of groups) {
    if (Array.isArray(group)) values.push(...group);
    else if (group) values.push(...String(group).split(/[,，、;；\s]+/));
  }
  return [...new Set(values.map(value => maskText(String(value || '')).trim()).filter(Boolean))].slice(0, 50).join('、');
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
    await store.query(`INSERT INTO studio_juzi_contacts(id,im_contact_id,external_user_id,display_name,phone_suffix,gender,im_bot_id,friendship_status,local_customer_id,match_status,last_synced_at,tags,remark)
      VALUES(?,?,?,?,?,?,?,?,NULL,'unmatched',?,?,?)
      ON CONFLICT(im_contact_id) DO UPDATE SET external_user_id=excluded.external_user_id,display_name=excluded.display_name,
        phone_suffix=excluded.phone_suffix,gender=excluded.gender,im_bot_id=excluded.im_bot_id,
        friendship_status=excluded.friendship_status,last_synced_at=excluded.last_synced_at,
        tags=excluded.tags,remark=excluded.remark`,
      crypto.randomUUID(), imContactId, String(row?.imInfo?.externalUserId || '').slice(0, 128),
      maskText(String(row?.name || '')).slice(0, 80), phoneSuffix(row?.remarkMobiles),
      Number.isInteger(row?.gender) ? row.gender : 0, imBotId,
      Number.isInteger(row?.friendshipStatus) ? row.friendshipStatus : 0, now,
      normalizeTags(row?.systemTags, row?.imInfo?.tags), maskText(String(row?.remark || '')).slice(0, 600)).run();
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

function historyText(message) {
  const payload = message?.Payload || {};
  const text = payload.TextPayload?.text || payload.text || '';
  if (typeof text === 'string' && text.trim()) return maskText(text.trim()).slice(0, 4000);
  return '';
}

function historyDay(offset) {
  return chinaDay(new Date(Date.now() - offset * 86400000));
}

function matchHistoryContact(message, contacts) {
  if (message?.coworker) return null;
  const externalUserId = String(message?.customerExternalUserId || '');
  const senderId = String(message?.imContactId || '');
  return contacts.find(contact => (!message?.isSelf && contact.im_contact_id === senderId)
    || (message?.isSelf && externalUserId && contact.external_user_id === externalUserId)) || null;
}

export async function syncConversations(store, env, user, dependencies = {}) {
  if (!juziConfigured(env)) fail(503, '句子互动连接尚未配置，请联系管理员', 'JUZI_NOT_CONFIGURED');
  const bots = await store.all('SELECT im_bot_id FROM studio_juzi_bots ORDER BY im_bot_id');
  let upstreamMessages = 0, textMessages = 0, inserted = 0, latestInbound = new Map();
  for (const bot of bots) {
    const contacts = await store.all('SELECT id,im_contact_id,external_user_id FROM studio_juzi_contacts WHERE im_bot_id=?', bot.im_bot_id);
    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      let seq = '0', pages = 0;
      do {
        const page = await listHistory(env, dependencies, { imBotId: bot.im_bot_id, snapshotDay: historyDay(dayOffset), seq });
        pages++;
        for (const message of page.messages) {
          upstreamMessages++;
          const messageId = String(message?.messageId || '');
          if (!messageId) continue;
          const contact = matchHistoryContact(message, contacts);
          if (!contact) continue;
          const content = historyText(message);
          if (!content) continue;
          textMessages++;
          const at = normalizeTimestamp(message?.timestamp);
          const result = await store.query(`INSERT INTO studio_outreach_messages(id,task_id,contact_id,direction,content,message_id,status,error,created_at)
            VALUES(?,NULL,?,?,?,?,'received','',?)
            ON CONFLICT(message_id) DO NOTHING RETURNING id`, crypto.randomUUID(), contact.id,
            message?.isSelf ? 'outbound' : 'inbound', content, messageId.slice(0, 128), at).first();
          if (result) inserted++;
          if (!message?.isSelf && (!latestInbound.has(contact.id) || at > latestInbound.get(contact.id).at)) {
            latestInbound.set(contact.id, { at, content, messageId });
          }
        }
        seq = page.seq;
      } while (seq && pages < 5);
    }
  }
  for (const [contactId, message] of latestInbound) {
    await updateContactProfile(store, contactId, {
      messageId: message.messageId,
      payload: { text: message.content },
      timestamp: message.at,
    });
  }
  await store.query('DELETE FROM studio_outreach_messages WHERE created_at<?', Date.now() - 2592000000).run();
  return { bots: bots.length, days: 30, upstream_messages: upstreamMessages, text_messages: textMessages, inserted, updated_profiles: latestInbound.size };
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

const STRATEGY_TYPES = ['care', 'repurchase_notice', 'education', 'activity', 'service', 'boundary_check'];

function validateTasks(output, candidates) {
  const allowed = new Map(candidates.map(c => [c.id, c]));
  if (!output || typeof output !== 'object' || !Array.isArray(output.tasks)) fail(502, '模型返回格式异常，请重试', 'MODEL_FORMAT');
  if (output.tasks.length !== candidates.length || new Set(output.tasks.map(item => String(item?.contact_id || ''))).size !== candidates.length) {
    fail(502, '模型必须为每个候选客户生成一条策略，请重试', 'MODEL_FORMAT');
  }
  const tasks = output.tasks.map(item => {
    const candidate = allowed.get(String(item?.contact_id || ''));
    if (!candidate) fail(502, '触达策略包含未提供的客户，请重试', 'MODEL_FORMAT');
    const message = textValue(item.recommended_message, 600, '触达话术');
    if (/保证|一定有效|包治|替代药物|建议停药|高价值客户|内部评分/.test(message)) fail(502, '触达话术包含不安全表述，请重试', 'UNSAFE_STRATEGY');
    return {
      contact_id: candidate.id, local_customer_id: candidate.local_customer_id, audience: candidate.audience,
      priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
      strategy_type: STRATEGY_TYPES.includes(item.strategy_type) ? item.strategy_type : 'care',
      reason: maskText(String(item.reason || '')).slice(0, 600), recommended_message: message,
      next_action: maskText(String(item.next_action || '')).slice(0, 600),
      stop_rule: maskText(String(item.stop_rule || '')).slice(0, 600),
      profile_updates: JSON.stringify(item.profile_updates && typeof item.profile_updates === 'object' ? item.profile_updates : {})
        .slice(0, 4000),
    };
  });
  if (!tasks.length) fail(502, '模型未返回可执行的触达策略，请重试', 'MODEL_FORMAT');
  return tasks;
}

export async function generateStrategies(store, user, body, env, dependencies = {}) {
  const planDay = chinaDay();
  const audience = AUDIENCES[body?.audience] ? body.audience : null;
  if (body?.refresh === true) {
    await store.query("DELETE FROM studio_outreach_tasks WHERE plan_day=? AND status='draft'", planDay).run();
  }
  const contacts = (await store.all(`SELECT c.id,c.im_contact_id,c.display_name,c.local_customer_id,
    c.tags,c.remark,c.profile_json,l.audience,l.display_name AS customer_name,l.salutation,
    l.purchased_products,l.interests,l.concerns,l.contraindications,l.notes,b.im_bot_id,b.bot_name,u.display_name AS owner_name
    FROM studio_juzi_contacts c LEFT JOIN studio_customers l ON l.id=c.local_customer_id AND l.active=1
    JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id LEFT JOIN studio_users u ON u.id=l.owner_user_id
    ORDER BY c.display_name`)).map(c => {
    let profile = {};
    try { profile = JSON.parse(c.profile_json || '{}') || {}; } catch {}
    const derivedAudience = AUDIENCES[c.audience] ? c.audience
      : /nmn|麦角硫因|抗衰/i.test(`${c.tags || ''} ${c.remark || ''}`) ? 'anti_aging' : 'daily_nutrition';
    return { ...c, audience: derivedAudience, profile, recent_messages: [] };
  });
  const selectedContacts = contacts.filter(contact => {
    if (body?.contact_id && contact.id !== String(body.contact_id)) return false;
    if (audience && contact.audience !== audience) return false;
    return !contact.profile?.should_pause;
  });
  const todayTasks = await store.all(`SELECT t.*,c.display_name AS contact_name,l.display_name AS customer_name
    FROM studio_outreach_tasks t JOIN studio_juzi_contacts c ON c.id=t.contact_id
    LEFT JOIN studio_customers l ON l.id=t.local_customer_id
    WHERE t.plan_day=? ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,t.created_at`, planDay);
  const taskContactIds = new Set(todayTasks.map(task => task.contact_id));
  const candidates = selectedContacts.filter(contact => !taskContactIds.has(contact.id));
  if (!selectedContacts.length) fail(400, '暂无可生成策略的真实客户，请先同步句子互动客户');
  const recent = await store.all(`SELECT contact_id,direction,content,created_at FROM studio_outreach_messages
    WHERE created_at>? ORDER BY created_at DESC LIMIT 500`, Date.now() - 2592000000);
  for (const candidate of candidates) candidate.recent_messages = recent.filter(m => m.contact_id === candidate.id).slice(0, 5).reverse();
  const existing = todayTasks.filter(task => selectedContacts.some(contact => contact.id === task.contact_id)
    && ['draft', 'queued', 'sent', 'paused'].includes(task.status));
  if (!candidates.length) {
    return { created_count: 0, existing_count: existing.length, plan_day: planDay, tasks: existing };
  }
  const materials = await store.all(`SELECT title,kind,audience,product,content,valid_from,valid_to
    FROM studio_materials WHERE active=1 ORDER BY updated_at DESC LIMIT 12`);
  const base = modelBase(env);
  const batches = [];
  for (let index = 0; index < candidates.length; index += 20) batches.push(candidates.slice(index, index + 20));
  const tasks = [];
  for (const batch of batches) {
    const modelBody = {
      model: MODEL, stream: false, max_tokens: 8192, enable_search: false, enable_thinking: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `你是多特倍斯私域触达策略助手。为输入的每个真实句子互动客户生成一条可执行的主动开口策略，不允许遗漏或新增客户。目标优先解决客户愿意回复，再根据其可用信息选择关怀、复购通知、教育、活动、售后或边界确认，不默认推销。必须一客一策：优先使用近期聊天、句子互动标签、备注和画像；如存在本地档案，再参考称呼、归属顾问、已购产品、关注点、禁忌。档案缺失时不得编造，只能使用对话和标签中的明确信息。不得编造购买历史、剩余数量、价格、活动、功效保证或个体医疗建议；没有资料支持时不写具体产品事实。语气自然亲切，可沿用已确认称呼。输出 JSON：{"tasks":[{"contact_id":"","strategy_type":"care/repurchase_notice/education/activity/service/boundary_check","priority":"high/medium/low","reason":"","recommended_message":"","next_action":"","stop_rule":"","profile_updates":{"observed_signal":"","next_focus":"","should_pause":false}}]}。` },
        { role: 'user', content: JSON.stringify({ today: planDay, audience, candidates: batch, materials }) },
      ],
    };
    let response;
    try {
      response = await dependencies.fetchModel(`${base.href.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', signal: AbortSignal.timeout(90000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.STUDIO_LLM_API_KEY}` },
        body: JSON.stringify(modelBody),
      });
    } catch { fail(502, '触达策略生成超时或连接异常，请稍后重试', 'MODEL_UNAVAILABLE'); }
    if (!response.ok) fail(502, '触达策略生成服务暂时不可用，请稍后重试', 'MODEL_UNAVAILABLE');
    let payload; try { payload = await response.json(); } catch { fail(502, '触达策略生成格式异常，请重试', 'MODEL_FORMAT'); }
    tasks.push(...validateTasks(extractJSON(payload.choices?.[0]?.message?.content || ''), batch));
  }
  const now = Date.now(), created = [];
  const candidateMap = new Map(candidates.map(c => [c.id, c]));
  for (const task of tasks) {
    const id = crypto.randomUUID();
    const candidate = candidateMap.get(task.contact_id);
    const snapshot = JSON.stringify({
      salutation: candidate?.salutation, owner_name: candidate?.owner_name,
      audience: candidate?.audience, purchased_products: candidate?.purchased_products,
      interests: candidate?.interests, concerns: candidate?.concerns,
      contraindications: candidate?.contraindications, notes: candidate?.notes,
      tags: candidate?.tags, remark: candidate?.remark, profile: candidate?.profile || {},
    }).slice(0, 8000);
    await store.query(`INSERT INTO studio_outreach_tasks(id,contact_id,local_customer_id,audience,priority,reason,
      recommended_message,next_action,stop_rule,status,created_by,created_at,plan_day,strategy_type,profile_snapshot,profile_updates)
      VALUES(?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?,?)`, id, task.contact_id, task.local_customer_id, task.audience,
      task.priority, task.reason, task.recommended_message, task.next_action, task.stop_rule, user.id, now,
      planDay, task.strategy_type, snapshot, task.profile_updates).run();
    created.push({ id, ...task, status: 'draft', created_at: now });
  }
  return { created_count: created.length, existing_count: existing.length, plan_day: planDay, tasks: [...existing, ...created] };
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
  const messageId = String(body.messageId).slice(0, 128);
  const existingMessage = await store.query('SELECT id FROM studio_outreach_messages WHERE message_id=?', messageId).first();
  await store.query(`INSERT INTO studio_outreach_messages(id,task_id,contact_id,direction,content,message_id,status,error,created_at)
    VALUES(?,?,?,?,?,?, 'received', '', ?) ON CONFLICT(message_id) DO NOTHING`,
    crypto.randomUUID(), null, contact.id, body.isSelf ? 'outbound' : 'inbound',
    maskText(body.payload.text).slice(0, 4000), messageId, normalizeTimestamp(body.timestamp)).run();
  if (!body.isSelf && !existingMessage) await updateContactProfile(store, contact.id, body);
  return callbackOK();
}

async function updateContactProfile(store, contactId, body) {
  const content = maskText(String(body.payload.text || '')).slice(0, 4000);
  const at = normalizeTimestamp(body.timestamp);
  const contact = await store.query('SELECT local_customer_id,profile_json FROM studio_juzi_contacts WHERE id=?', contactId).first();
  if (!contact) return;
  let profile = {};
  try { profile = JSON.parse(contact.profile_json || '{}') || {}; } catch {}

  const pause = /(不要|别|不用|不需要|停止|别再|退订|拉黑)(?:.{0,6})(联系|打扰|发送|推荐|推销)?/i.test(content)
    || /(退订|不要再联系|别再联系|不需要了)/i.test(content);
  const signals = [];
  if (pause) signals.push('明确表达暂停或拒绝触达');
  if (/价格|多少钱|优惠|活动/.test(content)) signals.push('关注价格或活动');
  if (/效果|作用|怎么吃|怎么服用|搭配/.test(content)) signals.push('关注效果或服用方法');
  if (/买|复购|用完|还剩/.test(content)) signals.push('出现复购或库存信号');
  if (/不舒服|过敏|腹泻|头痛|失眠/.test(content)) signals.push('反馈身体不适');
  if (!signals.length) signals.push('一般互动回复');
  const nextFocus = pause ? '暂停主动触达，仅保留必要服务响应'
    : signals.includes('反馈身体不适') ? '优先确认不适情况与服务安全，不推荐产品'
    : signals.includes('关注价格或活动') ? '先澄清权益与适用条件，不制造紧迫感'
    : signals.includes('关注效果或服用方法') ? '基于已核对资料说明用法，缺失事实先补问'
    : signals.includes('出现复购或库存信号') ? '先确认当前使用情况与需求，再给方案'
    : '自然延续当前话题，优先让客户补充具体关注点';

  profile.last_inbound_message = { content: content.slice(0, 500), at };
  profile.last_reply_at = at;
  profile.conversation_signals = [...new Set([...(Array.isArray(profile.conversation_signals) ? profile.conversation_signals : []), ...signals])].slice(-20);
  profile.suggested_followup_focus = nextFocus;
  profile.should_pause = !!pause || !!profile.should_pause;
  if (pause) profile.pause_reason = '客户在句子互动消息中明确要求暂停';

  const updates = { observed_signal: signals.join('、'), next_focus: nextFocus, should_pause: !!pause, last_reply_at: at };
  const existingUpdate = body.messageId
    ? await store.query('SELECT id FROM studio_customer_profile_updates WHERE message_id=?', String(body.messageId).slice(0, 128)).first()
    : null;
  const statements = [
    store.query('UPDATE studio_juzi_contacts SET profile_json=?,last_profile_updated_at=? WHERE id=?',
      JSON.stringify(profile).slice(0, 12000), at, contactId),
  ];
  if (!existingUpdate) {
    statements.push(store.query(`INSERT INTO studio_customer_profile_updates(id,contact_id,local_customer_id,message_id,updates_json,created_by,created_at)
      VALUES(?,?,?,?,?,?,?)`, crypto.randomUUID(), contactId, contact.local_customer_id,
      String(body.messageId || '').slice(0, 128), JSON.stringify(updates), 'juzi-callback', at));
  }
  await store.db.batch(statements);
  if (pause) await store.query(
    "UPDATE studio_outreach_tasks SET status='paused' WHERE contact_id=? AND status IN('draft','queued')",
    contactId).run();
}
