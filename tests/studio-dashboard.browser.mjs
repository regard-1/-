import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { LocalDB } from '../studio/local-db.mjs';
import { passwordHash } from '../studio/server/security.mjs';
import { startServer } from '../studio/dev.mjs';
import { chinaDay } from '../studio/shared.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = createRequire(`${process.env.STUDIO_TEST_MODULES}/package.json`)('playwright')); }

const db = new LocalDB();
const hash = await passwordHash('DashboardTest123!');
db.sqlite.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,1,0,?)').run('qa-admin', 'qaadmin', '验收管理员', hash, 'admin', Date.now());
db.sqlite.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,1,0,?)').run('qa-sales', 'qasales', '验收销售', hash, 'sales', Date.now());
db.sqlite.prepare(`INSERT INTO studio_customers(id,display_name,audience,owner_user_id,salutation,phone_suffix,active,updated_by,updated_at)
  VALUES(?,?,?,?,?,?,1,?,?)`).run('customer-1', '陈先生', 'anti_aging', 'qa-sales', '陈哥', '5678', 'qa-sales', Date.now());
db.sqlite.prepare(`INSERT INTO studio_customers(id,display_name,audience,owner_user_id,salutation,phone_suffix,active,updated_by,updated_at)
  VALUES(?,?,?,?,?,?,1,?,?)`).run('customer-2', '王女士', 'daily_nutrition', 'qa-admin', '王姐', '1234', 'qa-admin', Date.now());
db.sqlite.prepare(`INSERT INTO studio_juzi_bots(im_bot_id,bot_name,owner_user_id,last_synced_at) VALUES(?,?,?,?)`)
  .run('bot-1', '验收托管账号', 'qa-sales', Date.now());
const contact = db.sqlite.prepare(`INSERT INTO studio_juzi_contacts
  (id,im_contact_id,display_name,phone_suffix,im_bot_id,local_customer_id,match_status,last_synced_at,tags,remark)
  VALUES(?,?,?,?,?,?,'bound',?,?,?)`);
contact.run('contact-1', 'im-1', '陈先生', '5678', 'bot-1', 'customer-1', Date.now(), 'NMN用户,高互动', '关注精力');
contact.run('contact-2', 'im-2', '王女士', '1234', 'bot-1', 'customer-2', Date.now(), '日常营养', '关注免疫');
const task = db.sqlite.prepare(`INSERT INTO studio_outreach_tasks
  (id,contact_id,local_customer_id,audience,priority,reason,recommended_message,status,created_by,created_at,plan_day,strategy_type)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
task.run('task-1', 'contact-1', 'customer-1', 'anti_aging', 'high', '老客关怀', '陈哥，最近服用感受怎么样？', 'draft', 'qa-admin', Date.now(), chinaDay(), 'care');
task.run('task-2', 'contact-2', 'customer-2', 'daily_nutrition', 'medium', '活动提醒', '王姐，这次组合更适合日常维持。', 'queued', 'qa-admin', Date.now(), chinaDay(), 'activity');
const message = db.sqlite.prepare(`INSERT INTO studio_outreach_messages(id,contact_id,direction,content,status,error,created_at)
  VALUES(?,?,?,?,?,'',?)`);
message.run('message-1', 'contact-1', 'outbound', '陈哥，最近状态怎么样？', 'sent', Date.now() - 86400000);
message.run('message-2', 'contact-1', 'inbound', '还可以，睡眠好一些了。', 'received', Date.now() - 86300000);
message.run('message-3', 'contact-2', 'outbound', '王姐，活动开始啦。', 'sent', Date.now() - 86400000);

const runtime = await startServer({ db });
const browser = await chromium.launch({ headless: true, ...(process.env.STUDIO_BROWSER_CHANNEL ? { channel: process.env.STUDIO_BROWSER_CHANNEL } : {}) });
const page = await browser.newContext({ viewport: { width: 1440, height: 1000 } }).then(context => context.newPage());
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await mkdir('artifacts', { recursive: true });
  await page.goto(runtime.url + '/?page=workbench');
  await page.locator('[name="username"]').fill('qaadmin');
  await page.locator('[name="password"]').fill('DashboardTest123!');
  await page.locator('#login-form [type=submit]').click();
  await page.locator('.dashboard-sales-form').waitFor();
  await page.locator('[name="target_amount"]').fill('1000');
  await page.locator('[name="youzan_actual"]').fill('320.5');
  await page.locator('[name="tianmao_actual"]').fill('279.5');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/studio/dashboard/sales-target'));
  await page.locator('#dashboard-sales-form [type=submit]').click();
  assert.equal((await saved).status(), 200);
  await page.waitForFunction(() => document.body.textContent.includes('达成率 60.0%'));
  assert.ok((await page.locator('#main-content').innerText()).includes('已回复客户\n1'));
  assert.equal(await page.locator('.dashboard-table').count(), 0);
  await page.screenshot({ path: 'artifacts/dashboard-workbench.png', fullPage: true });

  await page.locator('.nav-item[data-page="assets"]').click();
  await page.locator('.dashboard-table').waitFor();
  assert.equal(await page.locator('.dashboard-table tbody tr').count(), 2);
  assert.ok((await page.locator('.dashboard-table').textContent()).includes('尾号5678'));
  assert.ok(!(await page.locator('.dashboard-table').textContent()).match(/1[3-9]\d{9}/));
  await page.locator('#dashboard-asset-tag').fill('NMN');
  await page.locator('.dashboard-filter-bar .primary-button').click();
  await page.waitForFunction(() => document.querySelectorAll('.dashboard-table tbody tr').length === 1);
  await page.screenshot({ path: 'artifacts/dashboard-assets.png', fullPage: true });

  await page.locator('.nav-item[data-page="tasks"]').click();
  await page.locator('#dashboard-task-search').waitFor();
  assert.equal(await page.locator('.dashboard-table tbody tr').count(), 2);
  assert.ok((await page.locator('.dashboard-table').textContent()).includes('陈哥'));
  await page.screenshot({ path: 'artifacts/dashboard-tasks.png', fullPage: true });

  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.nav-item[data-page="workbench"]').click();
    await page.locator('.dashboard-sales-form').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `artifacts/dashboard-mobile-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await runtime.close();
  db.close();
}
