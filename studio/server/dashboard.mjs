import { fail } from './security.mjs';
import { AUDIENCES, chinaDay } from '../shared.mjs';

const DAY_MS = 86400000;

function dayBounds(day) {
  const start = Date.parse(`${day}T00:00:00+08:00`);
  if (!Number.isFinite(start)) fail(400, '日期格式不正确');
  return { start, end: start + DAY_MS };
}

function previousDay(day = chinaDay()) {
  return chinaDay(new Date(Date.parse(`${day}T12:00:00+08:00`) - DAY_MS));
}

function pageValue(value, fallback = 1) {
  const page = Number(value);
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : fallback;
}

function limitValue(value, fallback = 10, maximum = 50) {
  const limit = Number(value);
  return Number.isFinite(limit) ? Math.min(maximum, Math.max(1, Math.floor(limit))) : fallback;
}

function tagsOf(contact) {
  return String(contact?.tags || '').split(/[,，、;；\s]+/).map(value => value.trim()).filter(Boolean);
}

function matchTags(tags, required, mode = 'contains', excluded = []) {
  if (!required.length && !excluded.length) return true;
  const lowerTags = tags.map(tag => tag.toLowerCase());
  if (excluded.some(term => lowerTags.some(tag => tag.includes(term.toLowerCase())))) return false;
  if (!required.length) return true;
  const matched = term => lowerTags.some(tag => tag.includes(term.toLowerCase()));
  return mode === 'and' ? required.every(matched) : required.some(matched);
}

function audienceOf(contact) {
  const text = `${contact.tags || ''} ${contact.remark || ''} ${contact.profile_json || ''} ${contact.local_customer_audience || ''}`.toLowerCase();
  return /nmn|麦角硫因|抗衰/.test(text) ? 'anti_aging' : 'daily_nutrition';
}

function profileSummary(contact) {
  let profile = {};
  try { profile = JSON.parse(contact.profile_json || '{}') || {}; } catch {}
  const tags = tagsOf(contact);
  const lower = `${tags.join('、')} ${contact.remark || ''} ${(profile.conversation_signals || []).join('、')}`.toLowerCase();
  const shouldPause = !!profile.should_pause;
  return {
    audience: audienceOf(contact),
    lifecycle: shouldPause ? '暂停触达'
      : /复购|已购|老客/.test(lower) ? '已购复购'
      : contact.replied ? '互动中'
      : /新客|意向|咨询/.test(lower) ? '新客意向'
      : '待唤醒',
    intent: shouldPause || /不需要|拒绝|退订/.test(lower) ? 'low'
      : /高意向|复购|活动|价格|购买/.test(lower) ? 'high'
      : contact.replied ? 'medium' : 'low',
    risk: shouldPause || /不适|过敏|投诉|退订|不需要/.test(lower) ? 'high' : 'normal',
    summary: shouldPause ? '客户已明确暂停或拒绝触达，优先处理服务问题。'
      : [audienceOf(contact) === 'anti_aging' ? '抗衰人群' : '日常营养补充人群', contact.replied ? '近期有回复' : '暂无近期回复', tags.slice(0, 3).join('、') || '暂无标签'].join(' · '),
  };
}

function replyState(contacts) {
  return contacts.map(contact => ({ ...contact, replied: !!contact.replied }));
}

async function contactRows(store, user) {
  const where = user.role === 'admin' ? '' : 'WHERE COALESCE(l.owner_user_id,b.owner_user_id)=?';
  const args = user.role === 'admin' ? [] : [user.id];
  const rows = await store.all(`SELECT c.*,l.display_name AS local_customer_name,l.audience AS local_customer_audience,
      l.salutation,l.purchased_products,l.interests,l.concerns,l.notes,l.owner_user_id AS local_owner_id,
      b.bot_name,b.owner_user_id AS bot_owner_id,u.display_name AS owner_name
    FROM studio_juzi_contacts c
    LEFT JOIN studio_customers l ON l.id=c.local_customer_id
    LEFT JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id
    LEFT JOIN studio_users u ON u.id=COALESCE(l.owner_user_id,b.owner_user_id)
    ${where} ORDER BY c.display_name,c.id`, ...args);
  const replyRows = await store.all(`SELECT contact_id,
      MAX(CASE WHEN direction='inbound' THEN created_at END) AS last_inbound_at,
      MAX(CASE WHEN direction='outbound' THEN created_at END) AS last_outbound_at
    FROM studio_outreach_messages GROUP BY contact_id`);
  const replyMap = new Map(replyRows.map(row => [row.contact_id, row]));
  return replyState(rows.map(contact => {
    const reply = replyMap.get(contact.id) || {};
    let profile = {};
    try { profile = JSON.parse(contact.profile_json || '{}') || {}; } catch {}
    const lastInbound = Math.max(Number(reply.last_inbound_at || 0), Number(profile.last_reply_at || 0));
    const lastOutbound = Number(reply.last_outbound_at || 0);
    return {
      ...contact,
      phone: contact.phone_suffix ? `尾号${contact.phone_suffix}` : '',
      replied: contact.reply_status_override === 1
        || (contact.reply_status_override === 0 && lastInbound > 0 && lastInbound > lastOutbound),
    };
  }));
}

function normalizeAssetContact(contact) {
  const summary = profileSummary(contact);
  return {
    id: contact.id,
    name: contact.display_name || contact.local_customer_name || '未命名客户',
    salutation: contact.confirmed_salutation || contact.salutation || contact.display_name,
    phone: contact.phone,
    owner_name: contact.owner_name || '未设置归属',
    bot_name: contact.bot_name || '',
    match_status: contact.match_status,
    tags: tagsOf(contact),
    audience: summary.audience,
    audience_label: AUDIENCES[summary.audience],
    lifecycle: summary.lifecycle,
    intent: summary.intent,
    risk: summary.risk,
    summary: summary.summary,
    remark: contact.remark || '',
    purchased_products: contact.purchased_products || '',
    interests: contact.interests || '',
    concerns: contact.concerns || '',
    notes: contact.notes || '',
    replied: contact.replied,
    last_reply_at: contact.last_reply_at || null,
  };
}

async function taskRows(store, user, onlyToday = false, day = chinaDay()) {
  const roleCondition = user.role === 'admin' ? 'TRUE' : 'COALESCE(l.owner_user_id,b.owner_user_id,t.created_by)=?';
  const dayCondition = onlyToday ? 't.plan_day=?' : 'TRUE';
  const args = [];
  if (onlyToday) args.push(day);
  if (user.role !== 'admin') args.push(user.id);
  return await store.all(`SELECT t.*,c.display_name AS contact_name,c.phone_suffix,
      c.tags,c.remark,l.display_name AS customer_name,l.salutation,
      b.bot_name,b.im_bot_id,tpl.title AS template_title,u.display_name AS owner_name
    FROM studio_outreach_tasks t
    JOIN studio_juzi_contacts c ON c.id=t.contact_id
    LEFT JOIN studio_customers l ON l.id=t.local_customer_id
    LEFT JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id
    LEFT JOIN studio_outreach_templates tpl ON tpl.id=t.template_id
    LEFT JOIN studio_users u ON u.id=COALESCE(l.owner_user_id,b.owner_user_id)
    WHERE ${dayCondition} AND ${roleCondition}
    ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,t.created_at DESC`, ...args);
}

function paginate(items, page, limit) {
  const pages = Math.max(1, Math.ceil(items.length / limit));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * limit;
  return {
    page: safePage, limit, pages, total: items.length,
    start_index: items.length ? start + 1 : 0,
    end_index: Math.min(start + limit, items.length),
  };
}

function salesRecord(row) {
  const target = Number(row?.target_amount || 0);
  const youzan = Number(row?.youzan_actual || 0);
  const tianmao = Number(row?.tianmao_actual || 0);
  const actual = youzan + tianmao;
  return {
    business_day: row?.business_day || '',
    target_amount: target,
    youzan_actual: youzan,
    tianmao_actual: tianmao,
    actual_amount: actual,
    achievement_rate: target > 0 ? Math.round(actual / target * 1000) / 10 : null,
    updated_at: Number(row?.updated_at || 0),
  };
}

async function outreachRate(store, user, day) {
  const { start, end } = dayBounds(day);
  const roleCondition = user.role === 'admin' ? 'TRUE' : 'COALESCE(l.owner_user_id,b.owner_user_id)=?';
  const args = [start, end, start, end];
  if (user.role !== 'admin') args.splice(2, 0, user.id);
  const [row] = await store.all(`SELECT
      COUNT(DISTINCT CASE WHEN m.direction='outbound' THEN m.contact_id END) AS touched,
      COUNT(DISTINCT CASE WHEN m.direction='inbound' THEN m.contact_id END) AS replied_all
    FROM studio_outreach_messages m
    JOIN studio_juzi_contacts c ON c.id=m.contact_id
    LEFT JOIN studio_customers l ON l.id=c.local_customer_id
    LEFT JOIN studio_juzi_bots b ON b.im_bot_id=c.im_bot_id
    WHERE m.created_at>=? AND m.created_at<? AND ${roleCondition}
      AND EXISTS (
        SELECT 1 FROM studio_outreach_messages x
        WHERE x.contact_id=m.contact_id AND x.created_at>=? AND x.created_at<?
          AND x.direction='outbound'
      )`, ...args);
  const touched = Number(row?.touched || 0);
  const replied = Number(row?.replied_all || 0);
  return { touched, replied, rate: touched ? Math.round(replied / touched * 1000) / 10 : null, day };
}

function suggestions({ yesterdaySales, todayTarget, rate, taskStats, contactStats, queued }) {
  const items = [];
  if (todayTarget.target_amount > 0) {
    const gap = todayTarget.target_amount - (todayTarget.youzan_actual + todayTarget.tianmao_actual);
    items.push(gap > 0 ? `今日私域目标还差 ${gap.toFixed(2)} 元，优先处理已回复和高意向客户。` : '今日私域目标已达到，重点转为确认订单和售后跟进。');
  } else {
    items.push('请先填写今日私域总目标，方便按回复率和队列推进销售节奏。');
  }
  if (rate.touched) {
    items.push(`昨日触达 ${rate.touched} 人、回复 ${rate.replied} 人${rate.rate == null ? '' : `、回复率 ${rate.rate}%`}；优先跟进已回复客户，未回复客户保持低打扰。`);
  } else {
    items.push('昨日暂无外发触达记录，建议今日先生成并执行一小批高质量一客一策。');
  }
  if (queued > 0) items.push(`执行队列中还有 ${queued} 条待发送内容，发送前逐条确认称呼和话术。`);
  else if (taskStats.unsent > 0) items.push(`有 ${taskStats.unsent} 条今日策略未入队，先筛出高优先级客户加入队列。`);
  if (contactStats.risk > 0) items.push(`${contactStats.risk} 位客户存在暂停、拒绝或服务风险信号，只做必要服务响应，不做销售推进。`);
  if (contactStats.unbound > 0) items.push(`${contactStats.unbound} 位真实客户未绑定本地档案，优先补齐归属与购买线索。`);
  return items.slice(0, 8);
}

export async function dashboardSnapshot(store, user) {
  const today = chinaDay();
  const yesterday = previousDay(today);
  const [todaySalesRow, yesterdaySalesRow, contacts, tasks, rate, messageStats] = await Promise.all([
    store.query('SELECT * FROM studio_sales_targets WHERE business_day=?', today).first(),
    store.query('SELECT * FROM studio_sales_targets WHERE business_day=?', yesterday).first(),
    contactRows(store, user),
    taskRows(store, user, true, today),
    outreachRate(store, user, yesterday),
    store.query(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END) AS last_30_days
      FROM studio_outreach_messages`, Date.now() - 30 * DAY_MS).first(),
  ]);
  const taskStats = {
    total: tasks.length,
    draft: tasks.filter(task => task.status === 'draft').length,
    queued: tasks.filter(task => task.status === 'queued').length,
    sent: tasks.filter(task => task.status === 'sent').length,
    failed: tasks.filter(task => ['failed', 'paused'].includes(task.status)).length,
    unsent: tasks.filter(task => ['draft', 'queued'].includes(task.status)).length,
  };
  const contactStats = {
    total: contacts.length,
    replied: contacts.filter(contact => contact.replied).length,
    unbound: contacts.filter(contact => contact.match_status !== 'bound').length,
    anti_aging: contacts.filter(contact => audienceOf(contact) === 'anti_aging').length,
    daily_nutrition: contacts.filter(contact => audienceOf(contact) === 'daily_nutrition').length,
    risk: contacts.filter(contact => profileSummary(contact).risk === 'high').length,
  };
  const tagCounts = new Map();
  for (const contact of contacts) for (const tag of tagsOf(contact)) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  const priorityTasks = tasks.filter(task => ['draft', 'queued'].includes(task.status)).slice(0, 12);
  const todaySales = salesRecord(todaySalesRow);
  const yesterdaySales = salesRecord(yesterdaySalesRow);
  return {
    today, yesterday, role: user.role,
    sales: { today: todaySales, yesterday: yesterdaySales },
    outreach_rate: rate,
    task_stats: taskStats,
    contact_stats: contactStats,
    message_stats: { total: Number(messageStats?.total || 0), last_30_days: Number(messageStats?.last_30_days || 0), retention_days: 30 },
    tag_summary: {
      distinct_tags: tagCounts.size,
      top: [...tagCounts.entries()].map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN')).slice(0, 20),
    },
    priority_tasks: priorityTasks.map(normalizeTask),
    suggestions: suggestions({ yesterdaySales, todayTarget: todaySales, rate, taskStats, contactStats, queued: taskStats.queued }),
  };
}

function normalizeTask(task) {
  return {
    id: task.id,
    contact_id: task.contact_id,
    contact_name: task.contact_name || task.customer_name || '未命名客户',
    salutation: task.salutation || task.contact_name || '客户',
    phone: task.phone_suffix ? `尾号${task.phone_suffix}` : '',
    owner_name: task.owner_name || '未设置归属',
    bot_name: task.bot_name || '',
    audience: task.audience,
    audience_label: AUDIENCES[task.audience] || '未分类',
    priority: task.priority,
    strategy_type: task.strategy_type,
    reason: task.reason,
    recommended_message: task.recommended_message,
    next_action: task.next_action,
    stop_rule: task.stop_rule,
    status: task.status,
    plan_day: task.plan_day,
    tags: tagsOf(task),
    created_at: task.created_at,
    template_title: task.template_title || '',
  };
}

export async function dashboardAssets(store, user, searchParams = new URLSearchParams()) {
  const contacts = await contactRows(store, user);
  const query = String(searchParams.get('q') || '').trim().toLowerCase().slice(0, 80);
  const tag = String(searchParams.get('tag') || '').split(/[,，、;；\s]+/).map(value => value.trim()).filter(Boolean).slice(0, 10);
  const tagMode = ['contains', 'and', 'or'].includes(searchParams.get('tag_mode')) ? searchParams.get('tag_mode') : 'contains';
  const audience = searchParams.get('audience');
  const reply = ['all', 'replied', 'unread'].includes(searchParams.get('reply')) ? searchParams.get('reply') : 'all';
  const items = contacts.map(normalizeAssetContact).filter(item => {
    if (audience && item.audience !== audience) return false;
    if (reply === 'replied' && !item.replied) return false;
    if (reply === 'unread' && item.replied) return false;
    if (!matchTags(item.tags, tag, tagMode)) return false;
    if (!query) return true;
    return [item.name, item.salutation, item.phone, item.owner_name, item.remark, item.purchased_products,
      item.interests, item.concerns, item.notes, item.tags.join('、'), item.summary]
      .some(value => String(value || '').toLowerCase().includes(query));
  });
  const pagination = paginate(items, pageValue(searchParams.get('page')), limitValue(searchParams.get('limit'), 10, 50));
  return { items: items.slice((pagination.page - 1) * pagination.limit, pagination.page * pagination.limit), pagination, total_contacts: contacts.length };
}

export async function dashboardTasks(store, user, searchParams = new URLSearchParams()) {
  const day = searchParams.get('day') || chinaDay();
  const all = searchParams.get('scope') === 'all';
  const tasks = await taskRows(store, user, !all, day);
  const status = ['all', 'sent', 'unsent', 'failed'].includes(searchParams.get('status')) ? searchParams.get('status') : 'all';
  const query = String(searchParams.get('q') || '').trim().toLowerCase().slice(0, 80);
  const filtered = tasks.filter(task => {
    if (status === 'sent' && task.status !== 'sent') return false;
    if (status === 'unsent' && !['draft', 'queued'].includes(task.status)) return false;
    if (status === 'failed' && !['failed', 'paused'].includes(task.status)) return false;
    if (!query) return true;
    return [task.contact_name, task.customer_name, task.recommended_message, task.reason, task.next_action,
      task.strategy_type, task.status, task.bot_name, task.template_title, task.tags].some(value => String(value || '').toLowerCase().includes(query));
  }).map(normalizeTask);
  const pagination = paginate(filtered, pageValue(searchParams.get('page')), limitValue(searchParams.get('limit'), 10, 50));
  return { items: filtered.slice((pagination.page - 1) * pagination.limit, pagination.page * pagination.limit), pagination, day, scope: all ? 'all' : 'today' };
}

export async function saveSalesTarget(store, user, body) {
  const day = String(body?.business_day || chinaDay());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail(400, '请填写正确的业务日期');
  const amount = value => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1000000000) fail(400, '销售金额必须为 0 到 10 亿元之间');
    return Math.round(number * 100) / 100;
  };
  const target = amount(body?.target_amount);
  const youzan = amount(body?.youzan_actual);
  const tianmao = amount(body?.tianmao_actual);
  if (target < 0 || youzan < 0 || tianmao < 0) fail(400, '销售金额不能为负数');
  const row = await store.query(`INSERT INTO studio_sales_targets(business_day,target_amount,youzan_actual,tianmao_actual,updated_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(business_day) DO UPDATE SET target_amount=excluded.target_amount,
      youzan_actual=excluded.youzan_actual,tianmao_actual=excluded.tianmao_actual,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at
    RETURNING *`, day, target, youzan, tianmao, user.id, Date.now(), Date.now()).first();
  return salesRecord(row);
}
