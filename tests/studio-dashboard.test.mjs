import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LocalDB } from '../studio/local-db.mjs';
import { handle } from '../studio/server/worker.mjs';
import { passwordHash } from '../studio/server/security.mjs';
import { chinaDay } from '../studio/shared.mjs';

const origin = 'https://studio.example';
const password = 'SyntheticPass123!';
const yesterday = Date.now() - 86400000;

async function setup() {
  const db = new LocalDB();
  const hash = await passwordHash(password);
  const user = db.sqlite.prepare(`INSERT INTO studio_users
    (id,username,display_name,password_hash,role,active,must_change,created_at)
    VALUES(?,?,?,?,?,1,0,?)`);
  user.run('admin', 'admin', '合成管理员', hash, 'admin', Date.now());
  user.run('sales', 'sales', '合成销售', hash, 'sales', Date.now());

  const customer = db.sqlite.prepare(`INSERT INTO studio_customers
    (id,display_name,audience,owner_user_id,salutation,phone_suffix,purchased_products,interests,concerns,notes,active,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)`);
  customer.run('customer-sales', '陈先生', 'anti_aging', 'sales', '陈哥', '5678',
    'NMN', '精力', '价格', '服务优先', 'sales', Date.now());
  customer.run('customer-admin', '王女士', 'daily_nutrition', 'admin', '王姐', '1234',
    '维生素', '免疫', '预算', '只看归属数据', 'admin', Date.now());

  const bot = db.sqlite.prepare(`INSERT INTO studio_juzi_bots(im_bot_id,bot_name,owner_user_id,last_synced_at)
    VALUES(?,?,?,?)`);
  bot.run('bot-sales', '销售托管账号', 'sales', Date.now());
  bot.run('bot-admin', '管理员托管账号', 'admin', Date.now());

  const contact = db.sqlite.prepare(`INSERT INTO studio_juzi_contacts
    (id,im_contact_id,display_name,phone_suffix,im_bot_id,local_customer_id,match_status,last_synced_at,tags,remark)
    VALUES(?,?,?,?,?,?,'bound',?,?,?)`);
  contact.run('contact-sales', 'im-sales', '陈先生', '5678', 'bot-sales', 'customer-sales', Date.now(), 'NMN用户,高互动', '关注精力');
  contact.run('contact-admin', 'im-admin', '王女士', '1234', 'bot-admin', 'customer-admin', Date.now(), '日常营养', '关注免疫');
  contact.run('contact-unmatched', 'im-unmatched', '未绑定客户', '8888', 'bot-admin', null, Date.now(), '新客', '暂无档案');

  const message = db.sqlite.prepare(`INSERT INTO studio_outreach_messages
    (id,contact_id,direction,content,status,error,created_at)
    VALUES(?,?,?,?,?,?,?)`);
  message.run('sales-out-1', 'contact-sales', 'outbound', '陈哥，最近状态怎么样？', 'sent', '', yesterday);
  message.run('sales-in-1', 'contact-sales', 'inbound', '还可以，睡眠好一些了。', 'received', '', yesterday);
  message.run('sales-out-2', 'contact-sales', 'outbound', '收到，我先帮您记录。', 'sent', '', yesterday + 1000);
  message.run('admin-out-1', 'contact-admin', 'outbound', '王姐，活动开始啦。', 'sent', '', yesterday);
  message.run('unmatched-out-1', 'contact-unmatched', 'outbound', '您好，先做个简单关怀。', 'sent', '', yesterday);
  message.run('admin-in-1', 'contact-admin', 'inbound', '这个搭配怎么吃？', 'received', '', yesterday + 2000);
  message.run('unmatched-in-1', 'contact-unmatched', 'inbound', '我想了解一下活动。', 'received', '', yesterday + 3000);

  const task = db.sqlite.prepare(`INSERT INTO studio_outreach_tasks
    (id,contact_id,local_customer_id,audience,priority,reason,recommended_message,status,created_by,created_at,plan_day,strategy_type)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  task.run('task-sales', 'contact-sales', 'customer-sales', 'anti_aging', 'high', '老客关怀',
    '陈哥，最近服用感受怎么样？', 'draft', 'admin', Date.now(), chinaDay(), 'care');
  task.run('task-admin', 'contact-admin', 'customer-admin', 'daily_nutrition', 'medium', '活动提醒',
    '王姐，这次组合更适合日常维持。', 'draft', 'admin', Date.now(), chinaDay(), 'activity');
  task.run('task-unmatched', 'contact-unmatched', null, 'daily_nutrition', 'low', '新客破冰',
    '您好，想先了解您的日常补充习惯。', 'draft', 'admin', Date.now(), chinaDay(), 'cold_start');

  const env = { DB: db };
  const call = async (path, method = 'GET', body, session) => {
    const request = new Request(origin + path, {
      method,
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(session ? { Cookie: session.cookie, 'X-Studio-CSRF': session.csrf } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const response = await handle(request, env);
    let payload = {};
    try { payload = await response.json(); } catch {}
    return { status: response.status, headers: response.headers, ...payload };
  };
  const login = async username => {
    const result = await call('/api/studio/login', 'POST', { username, password });
    assert.equal(result.status, 200);
    return { cookie: result.headers.get('Set-Cookie').split(';')[0], csrf: result.data.csrf };
  };
  return { db, env, call, login };
}

test('sales dashboard uses real outreach data and enforces role boundaries', async t => {
  const h = await setup();
  t.after(() => h.db.close());
  const admin = await h.login('admin');
  const sales = await h.login('sales');

  const denied = await h.call('/api/studio/dashboard/sales-target', 'POST', {
    target_amount: 100, youzan_actual: 20, tianmao_actual: 30,
  }, sales);
  assert.equal(denied.status, 403);
  assert.equal(denied.error.code, 'FORBIDDEN');

  const saved = await h.call('/api/studio/dashboard/sales-target', 'POST', {
    business_day: chinaDay(),
    target_amount: 1000,
    youzan_actual: 320.5,
    tianmao_actual: 279.5,
  }, admin);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.target_amount, 1000);
  assert.equal(saved.data.youzan_actual, 320.5);
  assert.equal(saved.data.tianmao_actual, 279.5);
  assert.equal(saved.data.actual_amount, 600);
  assert.equal(saved.data.achievement_rate, 60);

  const adminSnapshot = await h.call('/api/studio/dashboard', 'GET', undefined, admin);
  assert.equal(adminSnapshot.status, 200);
  assert.equal(adminSnapshot.data.outreach_rate.touched, 3);
  assert.equal(adminSnapshot.data.outreach_rate.replied, 3);
  assert.equal(adminSnapshot.data.outreach_rate.rate, 100);
  assert.equal(adminSnapshot.data.contact_stats.total, 3);
  assert.equal(adminSnapshot.data.task_stats.total, 3);
  assert.equal(adminSnapshot.data.sales.today.actual_amount, 600);

  const salesSnapshot = await h.call('/api/studio/dashboard', 'GET', undefined, sales);
  assert.equal(salesSnapshot.data.outreach_rate.touched, 1);
  assert.equal(salesSnapshot.data.outreach_rate.replied, 1);
  assert.equal(salesSnapshot.data.outreach_rate.rate, 100);
  assert.equal(salesSnapshot.data.contact_stats.total, 1);
  assert.equal(salesSnapshot.data.task_stats.total, 1);
  assert.equal(salesSnapshot.data.priority_tasks[0].salutation, '陈哥');
  assert.equal(salesSnapshot.data.priority_tasks[0].phone, '尾号5678');

  const salesAssets = await h.call('/api/studio/dashboard/assets?limit=10', 'GET', undefined, sales);
  assert.equal(salesAssets.status, 200);
  assert.equal(salesAssets.data.pagination.total, 1);
  assert.equal(salesAssets.data.items.length, 1);
  assert.equal(salesAssets.data.items[0].name, '陈先生');
  assert.equal(salesAssets.data.items[0].phone, '尾号5678');
  assert.ok(salesAssets.data.items[0].tags.includes('NMN用户'));

  const orderedAssets = await h.call('/api/studio/dashboard/assets?limit=10', 'GET', undefined, admin);
  assert.equal(orderedAssets.status, 200);
  assert.ok(orderedAssets.data.items[0].last_reply_at > orderedAssets.data.items[1].last_reply_at);
  assert.equal(orderedAssets.data.items[0].name, '未绑定客户');
  assert.equal(orderedAssets.data.items[1].name, '王女士');

  const adminAssets = await h.call('/api/studio/dashboard/assets?limit=2&page=2', 'GET', undefined, admin);
  assert.equal(adminAssets.data.pagination.page, 2);
  assert.equal(adminAssets.data.pagination.total, 3);
  assert.equal(adminAssets.data.items.length, 1);

  const tagAssets = await h.call('/api/studio/dashboard/assets?tag=NMN', 'GET', undefined, admin);
  assert.equal(tagAssets.data.pagination.total, 1);
  assert.equal(tagAssets.data.items[0].audience, 'anti_aging');

  const salesTasks = await h.call('/api/studio/dashboard/tasks?limit=10', 'GET', undefined, sales);
  assert.equal(salesTasks.status, 200);
  assert.equal(salesTasks.data.pagination.total, 1);
  assert.equal(salesTasks.data.items[0].id, 'task-sales');
  assert.equal(salesTasks.data.items[0].phone, '尾号5678');

  const unsentTasks = await h.call('/api/studio/dashboard/tasks?status=unsent', 'GET', undefined, admin);
  assert.equal(unsentTasks.data.pagination.total, 3);
});

test('dashboard pages call the authenticated studio API instead of demo data', () => {
  const source = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
  const workbench = source.slice(source.indexOf('async function renderWorkbench'), source.indexOf('function ownerChipsHtml'));
  const assets = source.slice(source.indexOf('async function renderAssets'), source.indexOf('async function openAudience'));
  const tasks = source.slice(source.indexOf('async function renderTasks'), source.indexOf('function signed'));
  for (const section of [workbench, assets, tasks]) {
    assert.equal(section.includes('/api/v1/private/'), false);
    assert.ok(section.includes('studioApi'));
    assert.ok(section.includes('/dashboard'));
  }
});
