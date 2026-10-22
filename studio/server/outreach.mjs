import { fail } from './security.mjs';
import { juziConfigured, listCustomers, listHistory, sendText } from './juzi.mjs';
import { retrieveKnowledge } from './knowledge.mjs';
import { maskText, chinaDay, AUDIENCES } from '../shared.mjs';

const textValue = (value, maximum, label) => {
  if (typeof value !== 'string' || !value.trim()) fail(400, `请填写${label}`);
  const text = maskText(value.trim());
  if (text.length > maximum) fail(400, `${label}过长`);
  return text;
};

// qwen3.8-max supports 131072 output tokens, but outreach JSON stays compact.
// A bounded ceiling avoids pathological long generations and request timeouts.
const OUTREACH_BATCH_MAX_TOKENS = 30000;
const OUTREACH_REPLY_MAX_TOKENS = 1500;
const OUTREACH_BATCH_CONCURRENCY = 3;
const OUTREACH_DEFAULT_BATCH_SIZE = 10;
const OUTREACH_TASK_LIMIT = 2000;
const OUTREACH_BATCH_MODEL_TIMEOUT_MS = 120000;
const PACKAGE_CARD_WORDING_PATTERN = /包裹卡|药盒/;

function removePackageCardMarkers(value) {
  if (typeof value === 'string') {
    return value
      .replace(/包裹卡|药盒/g, '')
      .replace(/\s*[-－—–]\s*(?=$|[,，、;；])/g, '')
      .trim();
  }
  if (Array.isArray(value)) return value.map(removePackageCardMarkers);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, removePackageCardMarkers(item)]));
  }
  return value;
}

function promptSafeValue(value) {
  return removePackageCardMarkers(value);
}

function assertNoPackageCardWording(value, message, code = 400) {
  if (PACKAGE_CARD_WORDING_PATTERN.test(String(value || ''))) fail(code, message, 'UNSAFE_STRATEGY');
}

function normalizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return Date.now();
  return numeric < 10000000000 ? numeric * 1000 : numeric;
}

export async function outreachSnapshot(store, env, searchParams = new URLSearchParams(), user = null) {
  const day = chinaDay();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 10));
  const query = maskText(String(searchParams.get('q') || '').trim()).slice(0, 80);
  const taskPage = Math.max(1, Number(searchParams.get('task_page')) || 1);
  const taskLimit = Math.min(50, Math.max(1, Number(searchParams.get('task_limit')) || 5));
  const taskQuery = maskText(String(searchParams.get('task_q') || '').trim()).slice(0, 80);
  const taskStatus = ['all', 'sent', 'unsent'].includes(searchParams.get('task_status'))
    ? searchParams.get('task_status') : 'all';
  const replyFilter = ['all', 'replied', 'unread'].includes(searchParams.get('reply')) ? searchParams.get('reply') : 'all';
  const tagFilter = parseTagInput(searchParams.get('tag'));
  const tagMode = ['contains', 'and', 'or'].includes(searchParams.get('tag_mode')) ? searchParams.get('tag_mode') : 'contains';
  const excludeTags = parseTagInput(searchParams.get('exclude_tag'));
  const botFilter = String(searchParams.get('bot_id') || '').trim().slice(0, 100);
  const [bots, contacts, tasks, messages, profileUpdates, templates, replyStats, runningJobRow] = await Promise.all([
    store.all(`SELECT b.*,u.display_name AS owner_name FROM studio_juzi_bots b
      LEFT JOIN studio_users u ON u.id=b.owner_user_id ORDER BY b.bot_name`),
    store.all(`SELECT c.*,l.display_name AS local_customer_name,l.audience AS local_customer_audience,
      l.salutation,l.purchased_products,l.interests,l.concerns,l.contraindications,l.notes,
      b.bot_name,u.display_name AS owner_name FROM studio_juzi_contacts c
      LEFT JOIN studio_customers l ON l.id=c.local_customer_id
      LEFT JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id
      LEFT JOIN studio_users u ON u.id=l.owner_user_id ORDER BY c.display_name`),
    store.all(`SELECT t.*,c.display_name AS contact_name,l.display_name AS customer_name,
      b.bot_name,b.im_bot_id,tpl.title AS template_title FROM studio_outreach_tasks t
      JOIN studio_juzi_contacts c ON c.id=t.contact_id
      LEFT JOIN studio_customers l ON l.id=t.local_customer_id
      JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id
      LEFT JOIN studio_outreach_templates tpl ON tpl.id=t.template_id
      ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,t.created_at DESC LIMIT 200`),
    store.all(`SELECT m.*,c.display_name AS contact_name FROM studio_outreach_messages m
      LEFT JOIN studio_juzi_contacts c ON c.id=m.contact_id ORDER BY m.created_at DESC LIMIT 200`),
    store.all(`SELECT p.*,c.display_name AS contact_name FROM studio_customer_profile_updates p
      LEFT JOIN studio_juzi_contacts c ON c.id=p.contact_id ORDER BY p.created_at DESC LIMIT 100`),
    store.all('SELECT id,title,content,active,updated_at FROM studio_outreach_templates WHERE active=1 ORDER BY updated_at DESC'),
    store.all(`SELECT contact_id,
      MAX(CASE WHEN direction='inbound' THEN created_at END) AS last_inbound_at,
      MAX(CASE WHEN direction='outbound' THEN created_at END) AS last_outbound_at
      FROM studio_outreach_messages GROUP BY contact_id`),
    user ? store.all(`SELECT * FROM studio_outreach_jobs
      WHERE created_by=? AND status IN ('pending','running') ORDER BY created_at DESC LIMIT 1`, user.id) : Promise.resolve([]),
  ]);
  const replyMap = new Map(replyStats.map(row => [row.contact_id, row]));
  for (const contact of contacts) {
    let profile = {};
    try { profile = JSON.parse(contact.profile_json || '{}') || {}; } catch {}
    const inbound = Math.max(Number(replyMap.get(contact.id)?.last_inbound_at || 0), Number(profile.last_reply_at || 0));
    const outbound = Number(replyMap.get(contact.id)?.last_outbound_at || 0);
    contact.last_reply_at = inbound || null;
    const messageInbound = Number(replyMap.get(contact.id)?.last_inbound_at || 0);
    const profileInbound = Number(profile.last_reply_at || 0);
    contact.replied = contact.reply_status_override === 1
      || (contact.reply_status_override === 0 && inbound > outbound);
    contact.reply_source = contact.reply_status_override === 1 ? 'manual'
      : messageInbound > outbound ? 'message'
        : profileInbound > outbound ? 'profile' : null;
    contact.initial_profile = buildInitialProfile(contact);
  }
  contacts.sort((a, b) => Number(b.replied) - Number(a.replied) || String(a.display_name).localeCompare(String(b.display_name), 'zh-Hans-CN'));
  const allContacts = contacts;
  const totalCount = allContacts.length;
  const filteredContacts = allContacts.filter(contact => {
    if (botFilter && String(contact.im_bot_id || '') !== botFilter) return false;
    if (replyFilter === 'replied' && !contact.replied) return false;
    if (replyFilter === 'unread' && contact.replied) return false;
    if (!matchTags(contactTags(contact), tagFilter, tagMode, excludeTags)) return false;
    if (!query) return true;
    return [contact.display_name, contact.phone_suffix, contact.tags, contact.remark,
      contact.owner_name, contact.bot_name, contact.local_customer_name, contact.profile_json]
     .some(value => String(value || '').toLowerCase().includes(query.toLowerCase()));
  });
  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const pageContacts = filteredContacts.slice(start, start + limit);
  const contactPlaceholders = pageContacts.map(() => '?').join(',');
  const contactTasks = pageContacts.length ? await store.all(`SELECT t.*,c.display_name AS contact_name,
      c.phone_suffix,l.display_name AS customer_name,b.bot_name,b.im_bot_id,tpl.title AS template_title
    FROM studio_outreach_tasks t
    JOIN studio_juzi_contacts c ON c.id=t.contact_id
    LEFT JOIN studio_customers l ON l.id=t.local_customer_id
    JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id
    LEFT JOIN studio_outreach_templates tpl ON tpl.id=t.template_id
    WHERE t.plan_day=? AND t.contact_id IN (${contactPlaceholders})
    ORDER BY t.created_at DESC`, day, ...pageContacts.map(contact => contact.id)) : [];
  const queuedTasks = await store.all(`SELECT t.*,c.display_name AS contact_name,c.phone_suffix,
      l.display_name AS customer_name,b.bot_name,b.im_bot_id,tpl.title AS template_title
    FROM studio_outreach_tasks t
    JOIN studio_juzi_contacts c ON c.id=t.contact_id
    LEFT JOIN studio_customers l ON l.id=t.local_customer_id
    JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id
    LEFT JOIN studio_outreach_templates tpl ON tpl.id=t.template_id
    WHERE t.status='queued' ${botFilter ? 'AND b.im_bot_id=?' : ''}
    ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,t.created_at DESC`,
    ...(botFilter ? [botFilter] : []));
  const localCustomers = await store.all(`SELECT c.id,c.display_name,c.audience,c.phone_suffix,u.display_name AS owner_name
    FROM studio_customers c LEFT JOIN studio_users u ON u.id=c.owner_user_id WHERE c.active=1 ORDER BY c.display_name`);
  const taskConditions = ['t.plan_day = ?'];
  const taskParameters = [day];
  if (taskQuery) {
    const pattern = `%${taskQuery}%`;
    taskConditions.push(`(c.display_name LIKE ? OR l.display_name LIKE ? OR t.recommended_message LIKE ?
      OR t.reason LIKE ? OR t.next_action LIKE ? OR t.stop_rule LIKE ? OR t.audience LIKE ? OR t.status LIKE ?
      OR t.strategy_type LIKE ? OR b.bot_name LIKE ? OR tpl.title LIKE ?)`);
    taskParameters.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }
  if (botFilter) {
    taskConditions.push('b.im_bot_id=?');
    taskParameters.push(botFilter);
  }
  if (taskStatus === 'sent') {
    taskConditions.push("t.status = 'sent'");
  } else if (taskStatus === 'unsent') {
    taskConditions.push("t.status IN ('draft', 'queued')");
  }
  const taskWhereSql = taskConditions.join(' AND ');
  const [taskStats] = await store.all(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN t.status = 'sent' THEN 1 ELSE 0 END) AS sent,
    SUM(CASE WHEN t.status IN ('draft','queued') THEN 1 ELSE 0 END) AS unsent
    FROM studio_outreach_tasks t ${(taskQuery || botFilter) ? `JOIN studio_juzi_contacts c ON c.id=t.contact_id
      LEFT JOIN studio_customers l ON l.id=t.local_customer_id
      JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id
      LEFT JOIN studio_outreach_templates tpl ON tpl.id=t.template_id` : ''}
    WHERE ${taskWhereSql}`, ...taskParameters);
  const taskTotal = Number(taskStats?.total || 0);
  const taskTotalPages = Math.max(1, Math.ceil(taskTotal / taskLimit));
  const safeTaskPage = Math.min(taskPage, taskTotalPages);
  const taskStart = (safeTaskPage - 1) * taskLimit;
  const todayTasks = await store.all(`SELECT t.*,c.display_name AS contact_name,c.phone_suffix,l.display_name AS customer_name,
      b.bot_name,b.im_bot_id,tpl.title AS template_title FROM studio_outreach_tasks t
    JOIN studio_juzi_contacts c ON c.id=t.contact_id
    LEFT JOIN studio_customers l ON l.id=t.local_customer_id
    JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id
    LEFT JOIN studio_outreach_templates tpl ON tpl.id=t.template_id
    WHERE ${taskWhereSql}
    ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,t.created_at DESC
    LIMIT ? OFFSET ?`, ...taskParameters, taskLimit, taskStart);
  const [globalTaskStats] = await store.all(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS draft,
    SUM(CASE WHEN plan_day=? AND status='draft' THEN 1 ELSE 0 END) AS draft_today,
    SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,
    SUM(CASE WHEN status='sent' AND plan_day=? THEN 1 ELSE 0 END) AS sent_today,
    SUM(CASE WHEN plan_day=? THEN 1 ELSE 0 END) AS today_total,
    SUM(CASE WHEN plan_day=? AND status IN ('draft','queued') THEN 1 ELSE 0 END) AS unsent_today
  FROM studio_outreach_tasks`, day, day, day, day);
  const accountTaskRows = await store.all(`SELECT b.im_bot_id,
    COUNT(*) AS total,
    SUM(CASE WHEN t.status='queued' THEN 1 ELSE 0 END) AS queued,
    SUM(CASE WHEN t.status='sent' THEN 1 ELSE 0 END) AS sent
    FROM studio_outreach_tasks t JOIN studio_juzi_contacts c ON c.id=t.contact_id
    JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id
    WHERE t.plan_day=? GROUP BY b.im_bot_id`, day);
  const accountTaskMap = new Map(accountTaskRows.map(row => [row.im_bot_id, row]));
  const accountSummary = bots.map(bot => {
    const botContacts = allContacts.filter(contact => contact.im_bot_id === bot.im_bot_id);
    const botTodayTasks = accountTaskMap.get(bot.im_bot_id) || { total: 0, queued: 0, sent: 0 };
    return {
      im_bot_id: bot.im_bot_id,
      bot_name: bot.bot_name,
      owner_name: bot.owner_name || '',
      total: botContacts.length,
      anti_aging: botContacts.filter(contact => contact.initial_profile?.audience === 'anti_aging').length,
      daily_nutrition: botContacts.filter(contact => contact.initial_profile?.audience === 'daily_nutrition').length,
      replied: botContacts.filter(contact => contact.replied).length,
      today_tasks: Number(botTodayTasks.total || 0),
      queued: Number(botTodayTasks.queued || 0),
      sent_today: Number(botTodayTasks.sent || 0),
    };
  });
  const counts = {
    contacts: totalCount,
    filtered_contacts: filteredContacts.length,
    bound: allContacts.filter(c => c.match_status === 'bound').length,
    suggested: allContacts.filter(c => c.match_status === 'suggested').length,
    ambiguous: allContacts.filter(c => c.match_status === 'ambiguous').length,
    draft: Number(globalTaskStats?.draft || 0),
    draftToday: Number(globalTaskStats?.draft_today || 0),
    queued: Number(globalTaskStats?.queued || 0),
    sentToday: Number(globalTaskStats?.sent_today || 0),
    today: Number(globalTaskStats?.today_total || 0),
    unsentToday: Number(globalTaskStats?.unsent_today || 0),
    replied: allContacts.filter(contact => contact.replied).length,
    templates: templates.length,
    messages: messages.length,
  };
  const tagCounts = new Map();
  for (const contact of allContacts) {
    for (const tag of contactTags(contact)) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
  const sortedTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'));
  const tagSummary = {
    distinct_tags: tagCounts.size,
    top: sortedTags.slice(0, 40).map(([name, count]) => ({ name, count })),
    tags: sortedTags.map(([name, count]) => ({ name, count })),
    related: (isAllTagFilter(tagFilter)
      ? sortedTags.slice(0, 20)
      : sortedTags.filter(([name]) => tagFilter.some(term => name.toLowerCase().includes(term.toLowerCase()))).slice(0, 20))
      .map(([name, count]) => ({ name, count })),
  };
  return { connected: juziConfigured(env), configured: juziConfigured(env), model_configured: !!(env.STUDIO_LLM_API_KEY && env.STUDIO_LLM_BASE_URL), plan_day: day,
    running_job: runningJobRow[0] ? jobProgress(runningJobRow[0]) : null,
    bots, contacts: pageContacts, contact_pagination: {
      page: safePage, limit, total: filteredContacts.length, total_contacts: totalCount,
      pages: totalPages, start_index: filteredContacts.length ? start + 1 : 0,
      end_index: Math.min(start + limit, filteredContacts.length), query, reply_filter: replyFilter,
      tag: tagFilter.join('、'), tag_mode: tagMode, exclude_tag: excludeTags.join('、'),
      bot_id: botFilter,
    }, tag_summary: tagSummary, tasks, today_tasks: todayTasks, task_pagination: {
      page: safeTaskPage, limit: taskLimit, total: taskTotal, pages: taskTotalPages,
      start_index: taskTotal ? taskStart + 1 : 0,
      end_index: Math.min(taskStart + taskLimit, taskTotal), query: taskQuery,
      status_filter: taskStatus,
      unsent: Number(taskStats?.unsent || 0),
    }, queued_tasks: queuedTasks, contact_tasks: contactTasks, messages, profile_updates: profileUpdates, templates,
    local_customers: localCustomers, counts, account_summary: accountSummary };
}

export async function outreachContactMessages(store, id) {
  const contact = await store.query('SELECT id FROM studio_juzi_contacts WHERE id=?', String(id || '')).first();
  if (!contact) fail(404, '句子互动客户不存在');
  const messages = await store.all(`SELECT m.*,c.display_name AS contact_name FROM studio_outreach_messages m
    LEFT JOIN studio_juzi_contacts c ON c.id=m.contact_id
    WHERE m.contact_id=? AND m.created_at>? ORDER BY m.created_at DESC LIMIT 500`,
    contact.id, Date.now() - 2592000000);
  return { contact_id: contact.id, items: messages, retention_days: 30 };
}

function contactTags(contact) {
  return String(contact?.tags || '').split(/[,，、;；\s]+/).map(value => value.trim()).filter(Boolean);
}

function parseTagInput(value) {
  return maskText(String(value || '').slice(0, 1000)).split(/[,，、;；\s]+/).map(value => value.trim()).filter(Boolean).slice(0, 100);
}

function isAllTagFilter(required) {
  if (required.length !== 1) return false;
  const value = required[0].toLowerCase();
  return value === '全量' || value === '全部' || value === 'all';
}

function matchTags(tags, required, mode, excluded = []) {
  if (!required.length && !excluded.length) return true;
  const lowerTags = tags.map(tag => tag.toLowerCase());
  const excludedSet = new Set(excluded.map(term => term.toLowerCase()));
  if (lowerTags.some(tag => excludedSet.has(tag))) return false;
  if (isAllTagFilter(required)) return true;
  if (!required.length) return true;
  const termMatched = term => lowerTags.some(tag => tag.includes(term.toLowerCase()));
  if (mode === 'and') return required.every(termMatched);
  return required.some(termMatched);
}

function buildInitialProfile(contact) {
  const profile = parseSnapshot(contact.profile_json);
  const tags = contactTags(contact);
  const text = `${tags.join('、')} ${contact.remark || ''} ${(profile.conversation_signals || []).join('、')}`;
  const lower = text.toLowerCase();
  const audience = /nmn|麦角硫因|抗衰/i.test(lower) ? 'anti_aging' : 'daily_nutrition';
  const shouldPause = !!profile.should_pause;
  const signals = Array.isArray(profile.conversation_signals) ? profile.conversation_signals : [];
  const lifecycle = shouldPause ? '暂停触达'
    : /复购|已购|老客/.test(lower) ? '已购复购阶段'
    : contact.replied ? '互动中'
    : /新客|意向|咨询/.test(lower) ? '新客或意向培育'
    : '待唤醒';
  const intent = shouldPause || /不需要|拒绝|退订/.test(lower) ? 'low'
    : /高意向|意向|复购|活动|价格|购买/.test(lower) ? 'high'
    : contact.replied || /高互动|互动/.test(lower) ? 'medium' : 'low';
  const activitySensitivity = /活动|优惠|价格|双11|赠品/.test(lower) ? 'high' : /老客|复购/.test(lower) ? 'medium' : 'low';
  const risk = shouldPause || /不适|过敏|投诉|退订|不需要/.test(lower) ? 'high' : 'normal';
  const evidence = [
    tags.length ? `标签：${tags.slice(0, 8).join('、')}` : '',
    contact.remark ? `备注：${contact.remark.slice(0, 120)}` : '',
    signals.length ? `近期回复信号：${signals.slice(-4).join('、')}` : '',
    contact.local_customer_id ? '已绑定本地客户档案' : '未绑定本地客户档案',
  ].filter(Boolean);
  const summary = shouldPause ? '客户已明确暂停或拒绝，当前只保留必要服务响应。'
    : `${audience === 'anti_aging' ? '抗衰人群' : '日常营养补充人群'} · ${lifecycle} · 意向${intent === 'high' ? '较高' : intent === 'medium' ? '中等' : '待确认'}${activitySensitivity !== 'low' ? ` · 对活动${activitySensitivity === 'high' ? '较敏感' : '可能关注'}` : ''}${risk === 'high' ? ' · 存在需要先处理的沟通或服务风险' : ''}`;
  return {
    audience,
    audience_label: audience === 'anti_aging' ? '抗衰人群' : '日常营养补充人群',
    lifecycle,
    intent,
    activity_sensitivity: activitySensitivity,
    risk,
    summary,
    evidence,
    generated_at: Number(contact.last_profile_updated_at) || Date.now(),
  };
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
  const tagText = value => {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(tagText).filter(Boolean).join('、');
    if (typeof value === 'object') {
      const direct = value.tagName ?? value.name ?? value.title ?? value.label;
      if (direct != null && ['string', 'number', 'boolean'].includes(typeof direct)) return String(direct).trim();
      if (Array.isArray(value.tags)) return value.tags.map(tagText).filter(Boolean).join('、');
    }
    return '';
  };
  for (const group of groups) {
    if (Array.isArray(group)) group.forEach(item => values.push(tagText(item)));
    else if (group) values.push(tagText(group));
  }
  return [...new Set(values.flatMap(value => String(value || '').split(/[,，、;；\s]+/))
    .map(value => maskText(value).trim()).filter(Boolean))].slice(0, 50).join('、');
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
    await store.query(`INSERT INTO studio_juzi_contacts(id,im_contact_id,external_user_id,upstream_chat_id,display_name,phone_suffix,gender,im_bot_id,friendship_status,local_customer_id,match_status,last_synced_at,tags,remark)
      VALUES(?,?,?,?,?,?,?,?,?,NULL,'unmatched',?,?,?)
      ON CONFLICT(im_contact_id) DO UPDATE SET external_user_id=excluded.external_user_id,upstream_chat_id=excluded.upstream_chat_id,display_name=excluded.display_name,
        phone_suffix=excluded.phone_suffix,gender=excluded.gender,im_bot_id=excluded.im_bot_id,
        friendship_status=excluded.friendship_status,last_synced_at=excluded.last_synced_at,
        tags=excluded.tags,remark=excluded.remark`,
      crypto.randomUUID(), imContactId, String(row?.imInfo?.externalUserId || imContactId || '').slice(0, 128),
      String(row?.chatId || '').slice(0, 128),
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
  // Juzi marks adviser-sent messages as both isSelf and coworker. Only
  // messages sent by another internal user to the bot should be ignored.
  if (message?.coworker && !message?.isSelf) return null;
  const externalUserId = String(message?.customerExternalUserId || '');
  const chatId = String(message?.chatId || '');
  const senderId = String(message?.imContactId || '');
  return contacts.find(contact => (!message?.isSelf && contact.im_contact_id === senderId)
    || (message?.isSelf && ((externalUserId && contact.external_user_id === externalUserId)
      || (chatId && contact.upstream_chat_id === chatId)))) || null;
}

export async function syncConversations(store, env, user, dependencies = {}) {
  if (!juziConfigured(env)) fail(503, '句子互动连接尚未配置，请联系管理员', 'JUZI_NOT_CONFIGURED');
  const bots = await store.all('SELECT im_bot_id FROM studio_juzi_bots ORDER BY im_bot_id');
  let upstreamMessages = 0, textMessages = 0, inserted = 0, latestInbound = new Map();
  for (const bot of bots) {
    const contacts = await store.all('SELECT id,im_contact_id,external_user_id,upstream_chat_id FROM studio_juzi_contacts WHERE im_bot_id=?', bot.im_bot_id);
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

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function contactFullName(contact) {
  return String(contact.local_customer_name || contact.customer_name || contact.display_name || '').trim();
}

function familyName(name) {
  const characters = Array.from(String(name || '').replace(/\s+/g, ''));
  const common = ['欧阳', '司马', '上官', '诸葛', '皇甫', '令狐'];
  if (characters.length >= 3 && common.includes(characters.slice(0, 2).join(''))) return characters.slice(0, 2).join('');
  return characters[0] || '';
}

function salutationFromText(text, family) {
  const value = String(text || '');
  const pattern = family
    ? new RegExp(`${escapeRegExp(family)}(?:哥|姐|老师|女士|先生|医生|经理|总)`)
    : /(?:称呼|叫)\s*[:：]?\s*([^\s,，。;；]{1,8})/;
  const direct = value.match(pattern);
  if (direct) return family ? direct[0] : direct[1];
  const labelled = value.match(/(?:称呼|叫)\s*[:：]?\s*([^\s,，。;；]{1,8})/);
  return labelled ? labelled[1] : '';
}

function inferSalutation(contact, messages = []) {
  if (contact.confirmed_salutation) return contact.confirmed_salutation;
  const name = contactFullName(contact), family = familyName(name);
  const recent = messages.some(message => salutationFromText(message.content, family));
  if (recent) return salutationFromText((messages.find(message => salutationFromText(message.content, family)) || {}).content, family);
  if (contact.salutation) return contact.salutation;
  const fromRemark = salutationFromText(contact.remark, family);
  if (fromRemark) return fromRemark;
  if (/老师|医生/.test(contact.tags || '')) return family ? `${family}${contact.tags.includes('医生') ? '医生' : '老师'}` : name;
  if (/先生|男士/.test(contact.tags || '') || /先生|男士/.test(name)) return name.includes('先生') ? name : `${family || ''}先生`;
  if (/女士|小姐|太太/.test(contact.tags || '') || /女士|小姐|太太/.test(name)) return name.match(/女士|小姐|太太/)?.[0] ? name : `${family || ''}女士`;
  if (contact.gender === 1) return family ? `${family}哥` : name;
  if (contact.gender === 2) return family ? `${family}姐` : name;
  return name || '您';
}

function renderTemplate(template, contact, messages = []) {
  const salutation = inferSalutation(contact, messages);
  const name = contactFullName(contact);
  const nickname = String(contact.display_name || name || '客户').trim();
  const content = /\{\{\s*(称呼|昵称|姓名)\s*\}\}/.test(template.content)
    ? template.content
    : `{{称呼}}，${template.content}`;
  return maskText(content
    .replace(/\{\{\s*称呼\s*\}\}/g, salutation)
    .replace(/\{\{\s*昵称\s*\}\}/g, nickname)
    .replace(/\{\{\s*姓名\s*\}\}/g, name || nickname)).slice(0, 600);
}

function parseSnapshot(value) {
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
}

function replaceOpeningSalutation(message, oldSalutation, confirmedSalutation) {
  const old = String(oldSalutation || '').trim();
  const confirmed = String(confirmedSalutation || '').trim();
  if (!old || !confirmed || old === confirmed) return String(message || '');
  return String(message || '').replace(
    new RegExp(`^${escapeRegExp(old)}(?=[\\s,，.。:：!！?？]|$)`),
    confirmed,
  );
}

function applyConfirmedSalutation(message, contact, messages = [], snapshot = {}) {
  const confirmed = String(contact?.confirmed_salutation || '').trim();
  if (!confirmed) return String(message || '');
  const family = familyName(contactFullName(contact));
  const genderSalutation = contact?.gender === 1 ? `${family}哥` : contact?.gender === 2 ? `${family}姐` : '';
  const oldSalutations = [
    snapshot.salutation,
    contact?.salutation,
    contact?.local_customer_name,
    contact?.customer_name,
    contact?.display_name,
    genderSalutation,
    inferSalutation({ ...contact, confirmed_salutation: null }),
    inferSalutation({ ...contact, confirmed_salutation: null }, messages),
  ];
  let result = String(message || '');
  for (const old of [...new Set(oldSalutations.map(value => String(value || '').trim()).filter(Boolean))]) {
    result = replaceOpeningSalutation(result, old, confirmed);
  }
  return result;
}

function validateTemplate(body) {
  if (/\d{11}/.test(String(body?.content || ''))) fail(400, '模板内容不能包含完整手机号');
  assertNoPackageCardWording(body?.content, '模板内容不能包含包裹卡或药盒');
  const title = textValue(body?.title, 40, '模板名称');
  const content = textValue(body?.content, 600, '模板内容');
  return { title, content, active: body?.active === false ? 0 : 1 };
}

export async function createTemplate(store, user, body) {
  const data = validateTemplate(body), id = crypto.randomUUID(), now = Date.now();
  await store.query(`INSERT INTO studio_outreach_templates(id,title,content,active,created_by,updated_at)
    VALUES(?,?,?,?,?,?)`, id, data.title, data.content, data.active, user.id, now).run();
  return { id, ...data, created_by: user.id, updated_at: now };
}

export async function updateTemplate(store, user, id, body) {
  const existing = await store.query('SELECT id FROM studio_outreach_templates WHERE id=?', id).first();
  if (!existing) fail(404, '触达模板不存在');
  const data = validateTemplate(body), now = Date.now();
  await store.query('UPDATE studio_outreach_templates SET title=?,content=?,active=?,updated_at=? WHERE id=?',
    data.title, data.content, data.active, now, id).run();
  return { id, ...data, updated: true, updated_at: now };
}

export async function deleteTemplate(store, user, id) {
  const now = Date.now();
  const result = await store.query('UPDATE studio_outreach_templates SET active=0,updated_at=? WHERE id=? AND active=1 RETURNING id', now, id).first();
  if (!result) fail(404, '模板不存在或已停用');
  return { deleted: true };
}

export async function updateContactSalutation(store, id, body) {
  const salutation = textValue(body?.salutation, 30, '称呼');
  const result = await store.query('UPDATE studio_juzi_contacts SET confirmed_salutation=? WHERE id=? RETURNING id', salutation, id).first();
  if (!result) fail(404, '句子互动客户不存在');

  const contact = await store.query(`SELECT c.*,l.display_name AS local_customer_name,l.salutation AS local_salutation
    FROM studio_juzi_contacts c LEFT JOIN studio_customers l ON l.id=c.local_customer_id AND l.active=1 WHERE c.id=?`, id).first();
  const messages = contact ? (await store.all(`SELECT contact_id,direction,content,created_at FROM studio_outreach_messages
    WHERE contact_id=? ORDER BY created_at DESC LIMIT 20`, id)).reverse() : [];
  const tasks = contact ? await store.all(`SELECT id,recommended_message,profile_snapshot,source,template_id
    FROM studio_outreach_tasks WHERE contact_id=? AND status IN('draft','queued') ORDER BY created_at`, id) : [];

  for (const task of tasks) {
    let message = String(task.recommended_message || '');
    const template = task.template_id
      ? await store.query('SELECT * FROM studio_outreach_templates WHERE id=?', task.template_id).first()
      : null;
    if (template && task.source === 'template') {
      message = renderTemplate(template, contact, messages);
    } else {
      const snapshot = parseSnapshot(task.profile_snapshot);
      message = applyConfirmedSalutation(message, {
        ...contact, salutation: contact.local_salutation || contact.salutation,
      }, messages, snapshot);
    }

    const snapshot = parseSnapshot(task.profile_snapshot);
    snapshot.salutation = salutation;
    snapshot.confirmed_salutation = salutation;
    await store.query(`UPDATE studio_outreach_tasks SET recommended_message=?,profile_snapshot=?
      WHERE id=? AND status IN('draft','queued')`, message, JSON.stringify(snapshot).slice(0, 8000), task.id).run();
  }

  return { updated: true, salutation, updated_tasks: tasks.length };
}

export async function updateContactReplyStatus(store, id, body) {
  const status = body?.replied === true ? 1 : body?.replied === false ? 2 : 0;
  const result = await store.query('UPDATE studio_juzi_contacts SET reply_status_override=? WHERE id=? RETURNING id', status, id).first();
  if (!result) fail(404, '句子互动客户不存在');
  return { updated: true, replied: status === 1, automatic: status === 0 };
}

export async function updateTaskMessage(store, user, id, body) {
  const message = textValue(body?.message, 600, '触达内容');
  assertNoPackageCardWording(message, '触达内容不能包含包裹卡或药盒');
  const result = await store.query(`UPDATE studio_outreach_tasks SET recommended_message=?
    WHERE id=? AND status IN('draft','queued') RETURNING id`, message, id).first();
  if (!result) fail(404, '触达任务不存在或已进入不可编辑状态');
  return { updated: true, message };
}

export async function generateTemplateTasks(store, user, body) {
  const templateId = String(body?.template_id || '');
  const template = await store.query('SELECT * FROM studio_outreach_templates WHERE id=? AND active=1', templateId).first();
  if (!template) fail(404, '触达模板不存在或已停用');
  const requestedIds = Array.isArray(body?.contact_ids) ? body.contact_ids.map(String).slice(0, 200) : null;
  const contacts = (await store.all(`SELECT c.*,l.display_name AS local_customer_name,l.audience AS local_customer_audience,
    l.salutation,l.purchased_products,l.interests,l.concerns,l.contraindications,l.notes
    FROM studio_juzi_contacts c LEFT JOIN studio_customers l ON l.id=c.local_customer_id AND l.active=1
    JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id ORDER BY c.display_name`)).map(contact => ({ ...contact, profile: (() => {
      try { return JSON.parse(contact.profile_json || '{}') || {}; } catch { return {}; }
    })() }));
  const messages = await store.all(`SELECT contact_id,direction,content,created_at FROM studio_outreach_messages
    WHERE created_at>? ORDER BY created_at DESC LIMIT 1000`, Date.now() - 2592000000);
  for (const contact of contacts) {
    const contactMessages = messages.filter(item => item.contact_id === contact.id);
    const inbound = Math.max(...contactMessages.filter(item => item.direction === 'inbound').map(item => Number(item.created_at)), Number(contact.profile?.last_reply_at || 0));
    const outbound = Math.max(0, ...contactMessages.filter(item => item.direction === 'outbound').map(item => Number(item.created_at)));
    contact.replied = contact.reply_status_override === 1
      || (contact.reply_status_override === 0 && inbound > 0 && inbound > outbound);
  }
  const eligibleContacts = contacts.filter(contact => {
    if (requestedIds && !requestedIds.includes(contact.id)) return false;
    if (contact.profile?.should_pause) return false;
    if (!requestedIds && contact.replied) return false;
    return true;
  });
  const planDay = chinaDay(), now = Date.now();
  const existing = await store.all(`SELECT contact_id FROM studio_outreach_tasks
    WHERE template_id=? AND plan_day=? AND status IN('draft','queued','sent')`, template.id, planDay);
  const existingIds = new Set(existing.map(row => row.contact_id));
  const candidates = eligibleContacts.filter(contact => !existingIds.has(contact.id));
  const tasks = [];
  for (const contact of candidates) {
    const message = renderTemplate(template, contact, messages.filter(item => item.contact_id === contact.id).slice(0, 20));
    const id = crypto.randomUUID();
    await store.query(`INSERT INTO studio_outreach_tasks(id,contact_id,local_customer_id,audience,priority,reason,
      recommended_message,next_action,stop_rule,status,created_by,created_at,plan_day,strategy_type,profile_snapshot,profile_updates,source,template_id)
      VALUES(?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,'template',?)`, id, contact.id, contact.local_customer_id,
      contact.local_customer_audience || 'daily_nutrition', 'medium', '管理员固定模板批量触达', message,
      '发送后关注客户回复，回复后可生成推荐回复', '客户明确不需要或要求停止时立即暂停', user.id, now, planDay,
      'activity', JSON.stringify({ salutation: inferSalutation(contact), tags: contact.tags, remark: contact.remark }).slice(0, 4000),
      '{}', template.id).run();
    tasks.push({ id, contact_id: contact.id, contact_name: contact.display_name, recommended_message: message,
      status: 'draft', source: 'template', template_id: template.id, template_title: template.title, created_at: now });
  }
  return { plan_day: planDay, created_count: tasks.length, skipped_count: contacts.length - candidates.length, tasks };
}

export async function generateReply(store, user, body, env, dependencies = {}) {
  const contactId = String(body?.contact_id || '');
  const contact = await store.query(`SELECT c.*,l.display_name AS local_customer_name,l.audience AS local_customer_audience,
    l.salutation,l.purchased_products,l.interests,l.concerns,l.contraindications,l.notes,
    u.display_name AS owner_name FROM studio_juzi_contacts c
    LEFT JOIN studio_customers l ON l.id=c.local_customer_id AND l.active=1
    LEFT JOIN studio_users u ON u.id=l.owner_user_id WHERE c.id=?`, contactId).first();
  if (!contact) fail(404, '句子互动客户不存在');
  let contactProfile = {};
  try { contactProfile = JSON.parse(contact.profile_json || '{}') || {}; } catch {}
  contact.profile = contactProfile;
  const shouldPause = !!contact.profile?.should_pause;
  const messages = (await store.all(`SELECT direction,content,created_at FROM studio_outreach_messages
    WHERE contact_id=? AND created_at>? ORDER BY created_at DESC LIMIT 20`, contact.id, Date.now() - 2592000000)).reverse();
  const salutation = inferSalutation(contact, messages);
  const materials = await store.all(`SELECT title,kind,audience,product,content,valid_from,valid_to
    FROM studio_materials WHERE active=1 ORDER BY updated_at DESC LIMIT 8`);
  const base = modelBase(env), fetchModel = dependencies.fetchModel || fetch;
  const modelBody = {
    model: outreachModel(env), stream: false, max_tokens: OUTREACH_REPLY_MAX_TOKENS,
    enable_search: false, enable_thinking: false,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: shouldPause
        ? `你是多特倍斯服务处理回复助手。客户已要求暂停主动触达，只能针对客户当前提出的问题或售后诉求生成一条人工服务回复：先致歉或确认诉求，再给出明确处理动作；不得推销、发活动、追问购买或引导复购。没有资料支持的价格、规格、活动、用法不编造；身体不适优先安全和服务。输出 JSON：{"reply":"","next_action":"","reason":""}。`
        : `你是多特倍斯私域跟进回复助手。根据客户最新回复、可用画像和已核对资料，生成一条可直接编辑后发送的回复。先准确回应客户当前问题，再推进一个自然动作；语气亲切自然，可使用已确认称呼。没有资料支持的价格、规格、活动、用法不编造；售后或身体不适优先处理安全和服务。输出 JSON：{"reply":"","next_action":"","reason":""}。` },
      { role: 'user', content: JSON.stringify(promptSafeValue({ salutation, service_only: shouldPause, contact: {
        display_name: contact.display_name, tags: contact.tags, remark: contact.remark,
        salutation: contact.salutation, confirmed_salutation: contact.confirmed_salutation,
        purchased_products: contact.purchased_products,
        interests: contact.interests, concerns: contact.concerns,
        contraindications: contact.contraindications, profile: contact.profile,
      }, recent_messages: messages, materials })) },
    ],
  };
  let response;
  try {
    response = await fetchModel(`${base.href.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(Math.max(20000, Number(env.STUDIO_OUTREACH_MODEL_TIMEOUT_MS) || 120000)),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.STUDIO_LLM_API_KEY}` },
      body: JSON.stringify(modelBody),
    });
  } catch { fail(502, '推荐回复生成超时或连接异常，请稍后重试', 'MODEL_UNAVAILABLE'); }
  if (!response.ok) fail(502, '推荐回复生成服务暂时不可用，请稍后重试', 'MODEL_UNAVAILABLE');
  let payload; try { payload = await response.json(); } catch { fail(502, '推荐回复生成格式异常，请重试', 'MODEL_FORMAT'); }
  const output = extractJSON(payload.choices?.[0]?.message?.content || '');
  const reply = applyConfirmedSalutation(textValue(output.reply, 600, '推荐回复'), contact, messages);
  if (/保证|一定有效|包治|替代药物|建议停药/.test(reply)) fail(502, '推荐回复包含不安全表述，请重试', 'UNSAFE_STRATEGY');
  assertNoPackageCardWording(reply, '推荐回复不能包含包裹卡或药盒，请重试', 502);
  const id = crypto.randomUUID(), now = Date.now(), planDay = chinaDay();
  const task = {
    id, contact_id: contact.id, local_customer_id: contact.local_customer_id,
    audience: contact.local_customer_audience || 'daily_nutrition', priority: 'medium',
    reason: maskText(String(output.reason || '客户已回复，需要跟进')).slice(0, 600),
    recommended_message: reply, next_action: maskText(String(output.next_action || '')).slice(0, 600),
    stop_rule: shouldPause
      ? '客户已要求暂停触达：本回复仅供人工处理当前服务问题，不能入队或批量发送'
      : '客户明确不需要或要求停止时立即暂停',
    status: shouldPause ? 'paused' : 'draft', created_at: now,
    plan_day: planDay, strategy_type: 'service', source: 'reply', template_id: null,
  };
  await store.query(`INSERT INTO studio_outreach_tasks(id,contact_id,local_customer_id,audience,priority,reason,
    recommended_message,next_action,stop_rule,status,created_by,created_at,plan_day,strategy_type,profile_snapshot,profile_updates,source,template_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, task.contact_id, task.local_customer_id,
    task.audience, task.priority, task.reason, task.recommended_message, task.next_action, task.stop_rule,
    task.status, user.id, now, planDay, task.strategy_type,
    JSON.stringify({ salutation, tags: contact.tags, remark: contact.remark, latest_message: messages.at(-1)?.content || '' }).slice(0, 4000),
    '{}', task.source, null).run();
  return task;
}

function modelBase(env) {
  if (!env.STUDIO_LLM_API_KEY || !env.STUDIO_LLM_BASE_URL) fail(503, '真实生成服务尚未配置，请联系管理员', 'MODEL_NOT_CONFIGURED');
  try {
    const base = new URL(env.STUDIO_LLM_BASE_URL);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) fail(503, '模型服务配置不正确', 'MODEL_NOT_CONFIGURED');
    return base;
  } catch { fail(503, '模型服务配置不正确', 'MODEL_NOT_CONFIGURED'); }
}

function outreachModel(env) {
  return env.STUDIO_OUTREACH_MODEL || 'deepseek-v4-pro-0813';
}

function extractJSON(text) {
  const raw = String(text || '').trim();
  if (!raw) fail(502, '模型未返回正文内容，请重试', 'MODEL_FORMAT');
  const candidates = [];
  for (const match of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) candidates.push(match[1].trim());
  candidates.push(raw);
  for (const value of candidates) {
    try {
      const direct = JSON.parse(value);
      if (direct && typeof direct === 'object') return direct;
    } catch {}
    for (let start = value.indexOf('{'); start !== -1; start = value.indexOf('{', start + 1)) {
      const json = balancedJSON(value, start);
      if (!json) continue;
      try {
        const output = JSON.parse(json);
        if (output && typeof output === 'object') return output;
      } catch {}
    }
  }
  fail(502, '模型输出不是可解析 JSON，可能被截断，请重试', 'MODEL_FORMAT');
}

function balancedJSON(text, start) {
  let depth = 0, inString = false, escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return '';
}

function modelContent(payload) {
  if (payload?.error) fail(502, '模型服务返回错误，请稍后重试', 'MODEL_UNAVAILABLE');
  const message = payload?.choices?.[0]?.message || {};
  let content = message.content;
  if (Array.isArray(content)) content = content.filter(part => typeof part?.text === 'string').map(part => part.text).join('\n');
  if (typeof content === 'string' && content.trim()) return content;
  fail(502, '模型未返回正文内容，请重试', 'MODEL_FORMAT');
}

const STRATEGY_TYPES = ['care', 'repurchase_notice', 'education', 'activity', 'service', 'boundary_check'];

function normalizeStrategyDirection(value) {
  const direction = String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!direction || direction === 'AI自动推荐') return 'auto';
  return direction;
}

function strategyDirectionLabel(direction) {
  return direction === 'auto' ? 'AI自动推荐' : direction;
}

function materialDateStatus(material, today) {
  if (!material?.valid_from && !material?.valid_to) return 'open';
  if (material.valid_from && today < material.valid_from) return 'not_started';
  if (material.valid_to && today > material.valid_to) return 'ended';
  return 'active';
}

const STALE_ACTIVITY_HINT = /活动|优惠|促销|机制|赠品|到手价|满减|折扣|双11|双十一|618|大促/;

function containsStaleActivityDate(value, today) {
  const text = String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');
  if (!text) return false;
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));

  const staleDateNearActivity = (index, dateLength) => {
    const window = text.slice(Math.max(0, index - 20), index + dateLength + 20);
    return STALE_ACTIVITY_HINT.test(window);
  };

  for (const match of text.matchAll(/(?:^|[^\d])((?:19|20)\d{2})(?:年)?(?![\d])/g)) {
    if (Number(match[1]) < currentYear && staleDateNearActivity(match.index + match[0].indexOf(match[1]), match[1].length)) return true;
  }
  for (const match of text.matchAll(/(?:^|[^\d])(\d{1,2})\s*月(?:$|[^\d])/g)) {
    const month = Number(match[1]);
    const monthIndex = match.index + match[0].indexOf(match[1]);
    if (month >= 1 && month < currentMonth && staleDateNearActivity(monthIndex, match[0].length)) return true;
  }
  return false;
}

function assertNoStaleActivityDate(message, today) {
  if (containsStaleActivityDate(message, today)) {
    fail(502, '触达话术包含已过期活动日期，请重试', 'STALE_ACTIVITY');
  }
}

function outreachMaterialForPrompt(material, today) {
  if (!material?.active) return null;
  const dateStatus = materialDateStatus(material, today);
  if (material.kind === 'activity' && dateStatus !== 'active') return null;
  if (containsStaleActivityDate(`${material.title || ''} ${material.content || ''}`, today)) return null;
  return {
    title: material.title,
    kind: material.kind,
    audience: material.audience,
    product: material.product || '',
    content: String(material.content || '').slice(0, 500),
    valid_from: material.valid_from || '',
    valid_to: material.valid_to || '',
    date_status: dateStatus,
    ...(material.external ? { external: true, source_type: material.source_type } : {}),
  };
}

function outreachKnowledgeQuery(direction, contacts) {
  const tags = [...new Set(contacts.flatMap(contact => contactTags(contact)))].slice(0, 12);
  return [
    '多特倍斯 主动触达 一客一策',
    strategyDirectionLabel(direction),
    '活动机制 赠品 产品搭配 双11',
    tags.join('、'),
  ].filter(Boolean).join('；').replace(/\s+/g, ' ').slice(0, 1200);
}

async function outreachKnowledgeMaterials(direction, contacts, env, fetchKnowledge) {
  try {
    const result = await retrieveKnowledge({
      scene: 'outreach',
      audience: 'all',
      needs: outreachKnowledgeQuery(direction, contacts),
      goal: '为真实客户主动触达生成可执行话术',
      messages: [],
    }, env, fetchKnowledge);
    return (result.sources || []).slice(0, 5).map(source => outreachMaterialForPrompt(source, chinaDay())).filter(Boolean);
  } catch {
    return [];
  }
}

function candidateAliases(candidates) {
  const aliases = new Map();
  const normalizeReference = value => String(value || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const aliasValues = candidate => [
    candidate.id,
    candidate.im_contact_id,
    candidate.local_customer_id,
    candidate.customer_id,
    candidate.external_user_id,
  ];
  for (const candidate of candidates) {
    for (const key of aliasValues(candidate)) {
      const value = normalizeReference(key);
      if (value && !aliases.has(value)) aliases.set(value, candidate);
    }
  }
  const nameCounts = new Map();
  for (const candidate of candidates) {
    const names = new Set([candidate.display_name, candidate.customer_name, candidate.local_customer_name]
      .map(value => normalizeReference(value)).filter(Boolean));
    for (const value of names) nameCounts.set(value, (nameCounts.get(value) || 0) + 1);
  }
  for (const candidate of candidates) {
    for (const key of [candidate.display_name, candidate.customer_name, candidate.local_customer_name]) {
      const value = normalizeReference(key);
      if (value && nameCounts.get(value) === 1 && !aliases.has(value)) aliases.set(value, candidate);
    }
  }
  return aliases;
}

function normalizeModelTasks(output) {
  if (!output || typeof output !== 'object') {
    fail(502, '模型未返回任务对象，请重试', 'MODEL_FORMAT');
  }
  let rawTasks = Array.isArray(output) ? output : output.tasks;
  if (rawTasks === undefined && typeof output.recommended_message === 'string') rawTasks = [output];
  if (rawTasks === undefined || rawTasks === null) {
    fail(502, '模型未返回 tasks 字段，请重试', 'MODEL_FORMAT');
  }
  if (Array.isArray(rawTasks)) {
    return rawTasks.map(item => item?.task && typeof item.task === 'object' ? { ...item, ...item.task } : item)
      .filter(item => item && typeof item === 'object');
  }
  if (typeof rawTasks !== 'object') fail(502, '模型 tasks 字段格式不正确，请重试', 'MODEL_FORMAT');
  const entries = Object.entries(rawTasks)
    .filter(([, value]) => value && typeof value === 'object');
  if (entries.length) {
    return entries.map(([key, value]) => ({
      ...value,
      contact_id: value.contact_id ?? value.contactId ?? key,
    }));
  }
  if (typeof rawTasks.recommended_message === 'string') return [rawTasks];
  return [];
}

function taskMessage(item) {
  const keys = ['recommended_message', 'message', 'script', 'outreach_message', 'opening_message', 'reply'];
  for (const key of keys) {
    const value = item?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      for (const nestedKey of ['text', 'message', 'content']) {
        const nested = value[nestedKey];
        if (typeof nested === 'string' && nested.trim()) return nested.trim();
      }
    }
  }
  if (item?.strategy && typeof item.strategy === 'object') return taskMessage(item.strategy);
  if (item?.task && typeof item.task === 'object') return taskMessage(item.task);
  return '';
}

function taskContactReference(item) {
  let value = item?.contact_id ?? item?.contactId ?? item?.candidate_id ?? item?.candidateId ?? item?.id;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    value = value.id ?? value.contact_id ?? value.contactId ?? value.value;
  }
  if (value == null || typeof value === 'object') return '';
  return String(value);
}

function validateTasks(output, candidates, { partial = false } = {}) {
  const rawItems = normalizeModelTasks(output);
  const aliases = candidateAliases(candidates);
  const tasks = [];
  const used = new Set();
  let unmatchedCount = 0, missingMessageCount = 0;
  for (const item of rawItems) {
    const rawId = taskContactReference(item);
    const normalizedId = String(rawId || '').trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    let candidate = aliases.get(normalizedId);
    if (!candidate) {
      if (candidates.length === 1) {
        candidate = candidates[0];
      } else {
        if (!partial) fail(502, '模型返回了未提供的客户策略，请重试', 'MODEL_FORMAT');
        unmatchedCount++;
        continue;
      }
    }
    if (used.has(candidate.id)) continue;
    used.add(candidate.id);
    const rawMessage = taskMessage(item);
    if (!rawMessage) {
      if (!partial) fail(502, '模型未返回触达话术，请重试', 'MODEL_FORMAT');
      missingMessageCount++;
      continue;
    }
    const message = textValue(rawMessage, 600, '触达话术');
    const confirmedMessage = applyConfirmedSalutation(message, candidate, candidate.recent_messages || []);
    assertNoStaleActivityDate(confirmedMessage, chinaDay());
    if (/保证|一定有效|包治|替代药物|建议停药|高价值客户|内部评分/.test(message)) fail(502, '触达话术包含不安全表述，请重试', 'UNSAFE_STRATEGY');
    assertNoPackageCardWording(confirmedMessage, '触达话术不能包含包裹卡或药盒，请重试', 502);
    tasks.push({
      contact_id: candidate.id, local_customer_id: candidate.local_customer_id, audience: candidate.audience,
      priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
      strategy_type: STRATEGY_TYPES.includes(item.strategy_type) ? item.strategy_type : 'care',
      reason: maskText(String(item.reason || '')).slice(0, 600), recommended_message: confirmedMessage,
      next_action: maskText(String(item.next_action || '')).slice(0, 600),
      stop_rule: maskText(String(item.stop_rule || '')).slice(0, 600),
      profile_updates: JSON.stringify(item.profile_updates && typeof item.profile_updates === 'object' ? item.profile_updates : {})
        .slice(0, 4000),
    });
  }
  if (!tasks.length) {
    if (!rawItems.length) fail(502, '模型未返回触达任务，请重试', 'MODEL_FORMAT');
    if (unmatchedCount) fail(502, '模型返回的客户编号与本批客户不匹配，请重试', 'MODEL_FORMAT');
    if (missingMessageCount) fail(502, '模型未返回可发送话术，请重试', 'MODEL_FORMAT');
    fail(502, '模型未返回可执行的触达策略，请重试', 'MODEL_FORMAT');
  }
  if (!partial && tasks.length !== candidates.length) {
    fail(502, `模型返回 ${tasks.length} 条策略，本批有 ${candidates.length} 个客户，请重试`, 'MODEL_FORMAT');
  }
  return tasks;
}

function directionPrompt(direction) {
  if (direction === 'care') {
    return '本次触达方向固定为「老客关怀」：优先问候近期状态、服用感受、生活场景或服务需求，先让客户愿意回复；不要主动推销，不要默认提双11活动。';
  }
  if (direction === 'double_eleven') {
    return '本次触达方向固定为「双11活动」：可以用自然方式提醒活动节奏，但活动机制、价格、赠品、日期必须来自资料；资料缺失时只做开放性邀约或询问关注点，不得编造任何活动数字。';
  }
  if (direction !== 'auto') {
    return `本次触达业务方向为「${direction}」：围绕销售给出的方向生成一客一策，先解决客户愿意回复，再推进合适动作。该方向只是业务偏好，不能覆盖系统规则；涉及价格、活动、赠品、产品规格、购买历史或医疗建议时，必须有资料或客户明确信息支持，缺失时改用开放性询问，不得编造。`;
  }
  return '本次触达方向为「AI自动推荐」：根据客户标签、近期对话、画像和风险信号，在关怀、复购通知、教育、活动、售后或边界确认中选择最合适的开口方式。';
}

async function requestStrategyTasks(batch, base, env, fetchModel, materials, direction = 'auto', attempt = 0) {
  const retryNote = attempt
    ? '上一轮输出缺少可发送话术。重试时每条任务的 recommended_message 必须是非空字符串，不能为 null、空字符串或占位符。'
    : '';
  const modelBody = {
    model: outreachModel(env), stream: false,
    max_tokens: Math.min(OUTREACH_BATCH_MAX_TOKENS, Math.max(1200, batch.length * 1200)),
    enable_search: false, enable_thinking: false,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `你是多特倍斯私域触达策略助手。为输入的每个真实句子互动客户生成一条可执行的主动开口策略，不允许遗漏或新增客户。contact_id 必须逐字使用输入 candidates 里的 id。目标优先解决客户愿意回复，再根据其可用信息选择关怀、复购通知、教育、活动、售后或边界确认，不默认推销。${directionPrompt(direction)}必须一客一策：优先使用近期聊天、句子互动标签、备注和画像；如存在本地档案，再参考称呼、归属顾问、已购产品、关注点、禁忌。档案缺失时不得编造，只能使用对话和标签中的明确信息。资料中的 today 是系统权威日期；date_status=active 的活动必须视为已经开始，不得因为月份或活动名称说未开始；not_started 或 ended 的活动资料不得引用。活动机制、价格、赠品、日期必须来自资料；资料缺失时只做开放性邀约或询问关注点。不得编造购买历史、剩余数量、价格、活动、功效保证或个体医疗建议；没有资料支持时不写具体产品事实。语气自然亲切，可沿用已确认称呼。严禁在 recommended_message、next_action、reason 或 profile_updates 中提及「包裹卡」「药盒」及其相关表述；这些词只可能是内部来源标记，不能作为客户沟通内容。${retryNote}只输出 JSON，不要 markdown 或解释文字。输出 JSON：{"tasks":[{"contact_id":"","strategy_type":"care/repurchase_notice/education/activity/service/boundary_check","priority":"high/medium/low","reason":"","recommended_message":"","next_action":"","stop_rule":"","profile_updates":{"observed_signal":"","next_focus":"","should_pause":false}}]}。` },
      { role: 'user', content: JSON.stringify({ today: chinaDay(), direction, candidates: batch, materials }) },
    ],
  };
  let response;
  const startedAt = Date.now();
  try {
    response = await fetchModel(`${base.href.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(Math.max(30000, Number(env.STUDIO_OUTREACH_MODEL_TIMEOUT_MS) || OUTREACH_BATCH_MODEL_TIMEOUT_MS)),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.STUDIO_LLM_API_KEY}` },
      body: JSON.stringify(modelBody),
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const retriable = ['TimeoutError', 'AbortError', 'TypeError'].includes(error?.name);
    console.warn(JSON.stringify({
      event: 'outreach_model_unavailable', model: outreachModel(env), batch_size: batch.length,
      elapsed_ms: elapsedMs, error_name: error?.name || 'Unknown',
    }));
    if (retriable && batch.length > 1) {
      // A timed-out 50-person batch must not degrade into 50 sequential timeouts.
      // Keep the job responsive and let the operator retry only the failed audience.
      fail(502, '触达策略生成超时或连接异常，请稍后重试', 'MODEL_UNAVAILABLE');
    }
    fail(502, '触达策略生成超时或连接异常，请稍后重试', 'MODEL_UNAVAILABLE');
  }
  if (!response.ok) fail(502, '触达策略生成服务暂时不可用，请稍后重试', 'MODEL_UNAVAILABLE');
  let payload;
  try { payload = await response.json(); } catch { fail(502, '触达策略生成格式异常，请重试', 'MODEL_FORMAT'); }
  let tasks;
  try {
    tasks = validateTasks(extractJSON(modelContent(payload)), batch, { partial: true });
  } catch (error) {
    if (attempt === 0 && batch.length === 1 && ['MODEL_FORMAT', 'STALE_ACTIVITY'].includes(error?.code)) {
      return requestStrategyTasks(batch, base, env, fetchModel, materials, direction, 1);
    }
    throw error;
  }
  if (tasks.length === batch.length) return tasks;
  if (batch.length === 1) {
    if (attempt === 0) return requestStrategyTasks(batch, base, env, fetchModel, materials, direction, 1);
    fail(502, '模型未能返回该客户的触达话术，请重试', 'MODEL_FORMAT');
  }
  const returnedIds = new Set(tasks.map(task => task.contact_id));
  const missing = batch.filter(candidate => !returnedIds.has(candidate.id));
  const retried = [];
  for (const candidate of missing) {
    retried.push(...await requestStrategyTasks([candidate], base, env, fetchModel, materials, direction, attempt));
  }
  return [...tasks, ...retried];
}

async function generateBatchTasks(batch, base, env, fetchModel, materials, direction) {
  try {
    return await requestStrategyTasks(batch, base, env, fetchModel, materials, direction);
  } catch (error) {
    if (batch.length === 1 || !['MODEL_FORMAT', 'STALE_ACTIVITY'].includes(error?.code)) throw error;
    const tasks = [];
    for (const contact of batch) {
      tasks.push(...await requestStrategyTasks([contact], base, env, fetchModel, materials, direction));
    }
    return tasks;
  }
}

async function persistStrategyTasks(store, user, planDay, tasks, candidateMap) {
  const created = [];
  for (const task of tasks) {
    const id = crypto.randomUUID();
    const candidate = candidateMap.get(task.contact_id);
    const snapshot = JSON.stringify({
      salutation: candidate?.confirmed_salutation || candidate?.salutation,
      confirmed_salutation: candidate?.confirmed_salutation, owner_name: candidate?.owner_name,
      audience: candidate?.audience, purchased_products: candidate?.purchased_products,
      interests: candidate?.interests, concerns: candidate?.concerns,
      contraindications: candidate?.contraindications, notes: candidate?.notes,
      tags: candidate?.tags, remark: candidate?.remark, profile: candidate?.profile || {},
    }).slice(0, 8000);
    await store.query(`INSERT INTO studio_outreach_tasks(id,contact_id,local_customer_id,audience,priority,reason,
      recommended_message,next_action,stop_rule,status,created_by,created_at,plan_day,strategy_type,profile_snapshot,profile_updates)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, task.contact_id, task.local_customer_id, task.audience,
      task.priority, task.reason, task.recommended_message, task.next_action, task.stop_rule, 'draft', user.id, Date.now(),
      planDay, task.strategy_type, snapshot, task.profile_updates).run();
    created.push({ id, ...task, status: 'draft', created_at: Date.now() });
  }
  return created;
}

export async function generateStrategies(store, user, body, env, dependencies = {}) {
  const fetchModel = dependencies.fetchModel || fetch;
  const planDay = chinaDay();
  const audience = AUDIENCES[body?.audience] ? body.audience : null;
  const tagFilter = parseTagInput(body?.tag);
  const tagMode = ['contains', 'and', 'or'].includes(body?.tag_mode) ? body.tag_mode : 'contains';
  const excludeTags = parseTagInput(body?.exclude_tag);
  const botFilter = String(body?.bot_id || body?.im_bot_id || '').trim().slice(0, 100);
  const direction = normalizeStrategyDirection(body?.direction);
  if (body?.refresh === true) {
    await store.query(`DELETE FROM studio_outreach_tasks WHERE plan_day=? AND status='draft'
      ${botFilter ? 'AND contact_id IN (SELECT id FROM studio_juzi_contacts WHERE im_bot_id=?)' : ''}`,
      planDay, ...(botFilter ? [botFilter] : [])).run();
  }
  const contacts = (await store.all(`SELECT c.id,c.im_contact_id,c.display_name,c.local_customer_id,
    c.confirmed_salutation,c.tags,c.remark,c.profile_json,l.audience,l.display_name AS customer_name,l.salutation,
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
  const matchingContacts = contacts.filter(contact => {
    if (body?.contact_id && contact.id !== String(body.contact_id)) return false;
    if (botFilter && String(contact.im_bot_id || '') !== botFilter) return false;
    if (audience && contact.audience !== audience) return false;
    return matchTags(contactTags(contact), tagFilter, tagMode, excludeTags);
  });
  const pausedSkipped = matchingContacts.filter(contact => contact.profile?.should_pause);
  const selectedContacts = matchingContacts.filter(contact => !contact.profile?.should_pause);
  const todayTasks = await store.all(`SELECT t.*,c.display_name AS contact_name,l.display_name AS customer_name
    FROM studio_outreach_tasks t JOIN studio_juzi_contacts c ON c.id=t.contact_id
    LEFT JOIN studio_customers l ON l.id=t.local_customer_id
    WHERE t.plan_day=? ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,t.created_at`, planDay);
  const taskContactIds = new Set(todayTasks.map(task => task.contact_id));
  const cooldownMap = await recentOutreachMap(store, Date.now() - 259200000);
  const candidates = selectedContacts.filter(contact => !taskContactIds.has(contact.id) && !cooldownMap.has(contact.id));
  if (!selectedContacts.length) {
    if (body?.contact_id) {
      const contact = contacts.find(item => item.id === String(body.contact_id));
      if (contact?.profile?.should_pause) fail(409, '该客户已要求暂停触达，请先处理服务问题');
    }
    fail(400, '暂无可生成策略的真实客户，请先同步句子互动客户');
  }
  const recent = await store.all(`SELECT contact_id,direction,content,created_at FROM studio_outreach_messages
    WHERE created_at>? ORDER BY created_at DESC LIMIT 500`, Date.now() - 2592000000);
  for (const candidate of candidates) candidate.recent_messages = recent.filter(m => m.contact_id === candidate.id).slice(0, 5).reverse();
  const existing = todayTasks.filter(task => selectedContacts.some(contact => contact.id === task.contact_id)
    && ['draft', 'queued', 'sent', 'paused'].includes(task.status));
  const cooldownSkipped = selectedContacts.filter(contact => cooldownMap.has(contact.id));
  const todaySkipped = selectedContacts.filter(contact => taskContactIds.has(contact.id));
  const skippedCount = pausedSkipped.length + todaySkipped.length + cooldownSkipped.length;
  if (!candidates.length) {
    return { created_count: 0, existing_count: existing.length, remaining_count: 0,
      skipped_count: skippedCount, frequency_skipped_count: cooldownSkipped.length,
      paused_skipped_count: pausedSkipped.length, today_skipped_count: todaySkipped.length,
      cooldown_skipped_count: cooldownSkipped.length, plan_day: planDay, tasks: existing };
  }
  const today = chinaDay();
  const localMaterials = (await store.all(`SELECT id,version,title,kind,audience,product,content,valid_from,valid_to,active
    FROM studio_materials WHERE active=1 ORDER BY updated_at DESC LIMIT 20`))
    .map(material => outreachMaterialForPrompt(material, today)).filter(Boolean).slice(0, 12);
  const requestedLimit = Number(body?.limit);
  const requestLimit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, OUTREACH_TASK_LIMIT) : null;
  const limitedCandidates = (requestLimit ? candidates.slice(0, requestLimit) : candidates).map(promptSafeValue);
  const knowledgeMaterials = await outreachKnowledgeMaterials(direction, limitedCandidates,
    env, dependencies.fetchKnowledge || dependencies.fetchModel || fetch);
  const materials = promptSafeValue([...localMaterials, ...knowledgeMaterials]);
  const base = modelBase(env);
  const batchSize = Math.max(1, Math.min(50, Number(env.STUDIO_OUTREACH_BATCH_SIZE) || OUTREACH_DEFAULT_BATCH_SIZE));
  const batchConcurrency = Math.max(1, Math.min(5,
    Number(env.STUDIO_OUTREACH_BATCH_CONCURRENCY) || OUTREACH_BATCH_CONCURRENCY));
  const candidateMap = new Map(limitedCandidates.map(c => [c.id, c]));
  const batches = [];
  for (let index = 0; index < limitedCandidates.length; index += batchSize) batches.push(limitedCandidates.slice(index, index + batchSize));
  await dependencies.onPlan?.({
    total_count: limitedCandidates.length,
    existing_count: existing.length,
    skipped_count: cooldownSkipped.length,
    remaining_count: remainingCountFor(limitedCandidates, candidates),
    batches_total: batches.length,
  });
  const batchResults = Array.from({ length: batches.length });
  let nextBatchIndex = 0;
  let progressQueue = Promise.resolve();
  const runBatchWorker = async () => {
    while (nextBatchIndex < batches.length) {
      const index = nextBatchIndex++;
      const batch = batches[index];
      const settled = await Promise.allSettled([
        generateBatchTasks(batch, base, env, fetchModel, materials, direction),
      ]);
      const entry = { batch, result: { status: 'pending', value: [] } };
      batchResults[index] = entry;
      progressQueue = progressQueue.then(async () => {
        if (settled[0].status === 'fulfilled') {
          try {
            entry.result = {
              status: 'fulfilled',
              value: await persistStrategyTasks(store, user, planDay, settled[0].value, candidateMap),
            };
          } catch (error) {
            entry.result = { status: 'rejected', reason: error };
          }
        } else {
          entry.result = settled[0];
        }
        await dependencies.onWave?.(batchResults.filter(item => item?.result && item.result.status !== 'pending'));
      }).catch(error => {
        console.warn(JSON.stringify({
          event: 'outreach_job_progress_failed', error_name: error?.name || 'Unknown',
          error_message: maskText(error?.message || '').slice(0, 300),
        }));
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(batchConcurrency, batches.length) }, runBatchWorker));
  await progressQueue;
  const failures = batchResults.filter(item => item.result.status === 'rejected').map(item => item.result.reason);
  if (failures.length && !batchResults.some(item => item.result.status === 'fulfilled' && item.result.value.length)) {
    throw failures[0];
  }
  const created = [];
  for (const { result } of batchResults) {
    if (result.status !== 'fulfilled') continue;
    created.push(...result.value);
  }
  const remainingCount = Math.max(0, candidates.length - limitedCandidates.length);
  const failedCount = batchResults.reduce((total, item) =>
    item.result.status === 'rejected' ? total + item.batch.length : total, 0);
  return { created_count: created.length, existing_count: existing.length, remaining_count: remainingCount,
    skipped_count: skippedCount, frequency_skipped_count: cooldownSkipped.length,
    paused_skipped_count: pausedSkipped.length, today_skipped_count: todaySkipped.length,
    cooldown_skipped_count: cooldownSkipped.length,
    plan_day: planDay, direction, direction_label: strategyDirectionLabel(direction),
    partial: failures.length > 0, failed_count: failedCount,
    generation_errors: failures.map(error => ({ message: error?.message || '触达策略生成失败', code: error?.code || 'MODEL_ERROR' })),
    tasks: [...existing, ...created] };
}

function remainingCountFor(limitedCandidates, candidates) {
  return Math.max(0, candidates.length - limitedCandidates.length);
}

function jobProgress(row) {
  return {
    job_id: row.id, status: row.status, direction: row.direction, tag: row.tag, audience: row.audience,
    contact_id: row.contact_id || null, total_count: Number(row.total_count || 0),
    created_count: Number(row.created_count || 0), existing_count: Number(row.existing_count || 0),
    skipped_count: Number(row.skipped_count || 0), failed_count: Number(row.failed_count || 0),
    remaining_count: Number(row.remaining_count || 0), batches_total: Number(row.batches_total || 0),
    batches_completed: Number(row.batches_completed || 0), errors: safeJobErrors(row.error_json),
    created_at: row.created_at, started_at: row.started_at, updated_at: row.updated_at, finished_at: row.finished_at,
  };
}

function safeJobErrors(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 10).map(error => ({
      message: maskText(String(error?.message || '触达策略生成失败')).slice(0, 300),
      code: String(error?.code || 'MODEL_ERROR').slice(0, 40),
    })) : [];
  } catch {
    return [];
  }
}

async function updateOutreachJobProgress(store, id, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const assignments = entries.map(([key]) => `${key}=?`).join(',');
  await store.query(`UPDATE studio_outreach_jobs SET ${assignments},updated_at=? WHERE id=?`,
    ...entries.map(([, value]) => value), Date.now(), id).run();
}

export async function createOutreachStrategyJob(store, user, body, env, dependencies = {}) {
  const active = await store.query(`SELECT id FROM studio_outreach_jobs
    WHERE created_by=? AND status IN ('pending','running') LIMIT 1`, user.id).first();
  if (active) fail(409, '已有触达策略任务正在生成，请等待完成后再发起', 'OUTREACH_JOB_RUNNING');
  const audience = AUDIENCES[body?.audience] ? body.audience : '';
  const tagFilter = parseTagInput(body?.tag);
  const tagMode = ['contains', 'and', 'or'].includes(body?.tag_mode) ? body.tag_mode : 'contains';
  const excludeTags = parseTagInput(body?.exclude_tag);
  const botFilter = String(body?.bot_id || body?.im_bot_id || '').trim().slice(0, 100);
  const direction = normalizeStrategyDirection(body?.direction);
  const contactId = body?.contact_id ? String(body.contact_id).slice(0, 100) : '';
  const requestedLimit = Number(body?.limit);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, OUTREACH_TASK_LIMIT) : null;
  const request = {
    audience, tag: tagFilter.join('、'), tag_mode: tagMode, exclude_tag: excludeTags.join('、'),
    bot_id: botFilter, direction, contact_id: contactId, refresh: body?.refresh === true,
    ...(limit ? { limit } : {}),
  };
  const id = crypto.randomUUID(), now = Date.now();
  await store.query(`INSERT INTO studio_outreach_jobs(id,created_by,status,request_json,direction,tag,audience,contact_id,
    total_count,created_count,existing_count,skipped_count,failed_count,remaining_count,batches_total,batches_completed,
    created_at,started_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,0,0,0,0,0,0,0,0,?,?,?)`, id, user.id, 'pending', JSON.stringify(request),
    direction, request.tag, audience, contactId, now, now, now).run();
  void Promise.resolve().then(() => runOutreachJob(store, id, user, request, env, dependencies));
  return jobProgress(await store.query('SELECT * FROM studio_outreach_jobs WHERE id=?', id).first());
}

export async function outreachJobStatus(store, id) {
  const row = await store.query('SELECT * FROM studio_outreach_jobs WHERE id=?', id).first();
  if (!row) fail(404, '触达策略任务不存在', 'NOT_FOUND');
  return jobProgress(row);
}

export async function markInterruptedOutreachJobs(store) {
  const now = Date.now();
  await store.query(`UPDATE studio_outreach_jobs SET status='failed',error_json=?,updated_at=?,finished_at=?
    WHERE status IN ('pending','running')`,
    JSON.stringify([{ message: '任务因服务重启已中断，已生成内容已保留', code: 'JOB_INTERRUPTED' }]), now, now).run();
}

async function runOutreachJob(store, id, user, request, env, dependencies = {}) {
  let batchResults = [];
  try {
    await updateOutreachJobProgress(store, id, { status: 'running', started_at: Date.now() });
    const result = await generateStrategies(store, user, request, env, {
      ...dependencies,
      onPlan: async progress => updateOutreachJobProgress(store, id, {
        total_count: progress.total_count, existing_count: progress.existing_count,
        skipped_count: progress.skipped_count, remaining_count: progress.remaining_count,
        batches_total: progress.batches_total,
      }),
      onWave: async results => {
        batchResults = results;
        const failedCount = results.reduce((total, item) =>
          item.result.status === 'rejected' ? total + item.batch.length : total, 0);
        const createdCount = results.reduce((total, item) =>
          item.result.status === 'fulfilled' ? total + item.result.value.length : total, 0);
        await updateOutreachJobProgress(store, id, {
          batches_completed: results.length, created_count: createdCount, failed_count: failedCount,
        });
      },
    });
    const failedCount = batchResults.reduce((total, item) =>
      item.result.status === 'rejected' ? total + item.batch.length : total, 0);
    await updateOutreachJobProgress(store, id, {
      status: result.partial ? 'partial' : 'completed',
      created_count: result.created_count, existing_count: result.existing_count,
      skipped_count: result.skipped_count, failed_count: failedCount,
      remaining_count: result.remaining_count, batches_completed: batchResults.length,
      error_json: JSON.stringify(result.generation_errors || []),
      finished_at: Date.now(),
    });
  } catch (error) {
    const errors = [{ message: maskText(error?.message || '触达策略生成失败').slice(0, 300), code: error?.code || 'MODEL_ERROR' }];
    await updateOutreachJobProgress(store, id, { status: 'failed', error_json: JSON.stringify(errors), finished_at: Date.now() });
  }
}

async function recentOutreachMap(store, since) {
  const rows = await store.all(`SELECT t.id,t.contact_id,t.status,t.created_at,m.created_at AS message_created_at
    FROM studio_outreach_tasks t
    LEFT JOIN studio_outreach_messages m ON m.task_id=t.id AND m.direction='outbound'
    WHERE t.status IN('queued','sent')
      AND (t.created_at>? OR m.created_at>?)`, since, since);
  const map = new Map();
  for (const row of rows) {
    const at = Math.max(Number(row.created_at || 0), Number(row.message_created_at || 0));
    if (at >= since) map.set(row.contact_id, at);
  }
  return map;
}

export async function queueTask(store, id) {
  const current = await store.query('SELECT id,status FROM studio_outreach_tasks WHERE id=?', id).first();
  if (!current) fail(404, '触达任务不存在或不是待入队状态');
  if (current.status === 'paused') fail(409, '该客户已要求暂停触达，服务回复不能加入发送队列');
  const result = await store.query("UPDATE studio_outreach_tasks SET status='queued' WHERE id=? AND status='draft' RETURNING id", id).first();
  if (!result) fail(409, '仅草稿策略可加入执行队列');
  return { queued: true };
}

export async function queueTodayTasks(store, body = {}) {
  if (body?.scope !== 'today' || body?.confirm !== true) fail(400, '请确认批量加入今日执行队列');
  const planDay = chinaDay();
  const rows = await store.all(
    "UPDATE studio_outreach_tasks SET status='queued' WHERE plan_day=? AND status='draft' RETURNING id",
    planDay
  );
  return { queued_count: rows.length, plan_day: planDay };
}

export async function deleteTask(store, id) {
  const task = await store.query('SELECT id,status FROM studio_outreach_tasks WHERE id=?', id).first();
  if (!task) fail(404, '触达任务不存在');
  if (!['draft', 'queued'].includes(task.status)) fail(409, '仅未发送任务可删除，已发送内容保留在 30 天留档');
  await store.db.batch([
    store.query("DELETE FROM studio_outreach_messages WHERE task_id=? AND status IN ('pending','failed')", id),
    store.query("DELETE FROM studio_outreach_tasks WHERE id=? AND status IN ('draft','queued') RETURNING id", id),
  ]);
  return { deleted: true };
}

export async function clearTodayTasks(store, user, body = {}) {
  if (body?.scope !== 'today' || body?.confirm !== true) fail(400, '请确认删除今日未发送的一客一策');
  const planDay = chinaDay();
  const unsent = await store.all(`SELECT id,status FROM studio_outreach_tasks
    WHERE plan_day=? AND status IN('draft','queued')`, planDay);
  if (!unsent.length) return { deleted_count: 0, plan_day: planDay };
  const statements = [
    store.query(`DELETE FROM studio_outreach_messages WHERE task_id IN
      (SELECT id FROM studio_outreach_tasks WHERE plan_day=? AND status IN('draft','queued'))
      AND status IN('pending','failed')`, planDay),
    store.query(`DELETE FROM studio_outreach_tasks WHERE plan_day=? AND status IN('draft','queued') RETURNING id`, planDay),
  ];
  await store.db.batch(statements);
  return { deleted_count: unsent.length, plan_day: planDay };
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
  const imContactId = String(body.imContactId || '');
  const chatId = String(body.chatId || '');
  const customerExternalUserId = String(body.customerExternalUserId || '');
  const contact = body.isSelf
    ? await store.query(`SELECT id FROM studio_juzi_contacts
        WHERE (upstream_chat_id=? AND ?<>'') OR (external_user_id=? AND ?<>'') LIMIT 1`,
        chatId, chatId, customerExternalUserId, customerExternalUserId).first()
    : await store.query('SELECT id FROM studio_juzi_contacts WHERE im_contact_id=?', imContactId).first();
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
