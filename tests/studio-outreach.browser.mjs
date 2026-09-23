import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { LocalDB } from '../studio/local-db.mjs';
import { passwordHash } from '../studio/server/security.mjs';
import { startServer } from '../studio/dev.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = createRequire(`${process.env.STUDIO_TEST_MODULES}/package.json`)('playwright')); }

const db = new LocalDB();
const hash = await passwordHash('OutreachPass123!');
db.sqlite.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,1,0,?)').run('outreach-admin', 'outreach-admin', '验收管理员', hash, 'admin', Date.now());
db.sqlite.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,1,0,?)').run('outreach-sales', 'outreach-sales', '验收销售', hash, 'sales', Date.now());
db.sqlite.prepare(`INSERT INTO studio_customers(id,display_name,audience,owner_user_id,salutation,phone_suffix,
  purchased_products,interests,concerns,contraindications,notes,active,updated_by,updated_at)
  VALUES('customer-1','陈先生','anti_aging','outreach-sales','陈哥','5678','NMN','精力','价格','','先核实安全',1,'outreach-sales',?)`).run(Date.now());

const runtime = await startServer({ db, env: {
  STUDIO_LLM_API_KEY: 'test-only',
  STUDIO_LLM_BASE_URL: 'https://model.example/v1',
  WECOM_API_BASE: 'https://juzi.example/hub-api',
  WECOM_API_TOKEN: 'test-only-juzi-token',
}, dependencies: {
  fetchJuzi: async (url, init) => {
    if (new URL(String(url)).pathname.endsWith('/customer/list')) {
      return new Response(JSON.stringify({
        errcode: 0,
        data: [{
          imContactId: 'external-contact-1',
          name: '陈先生',
          remarkMobiles: ['13800135678'],
          gender: 1,
          friendshipStatus: 1,
          imInfo: { externalUserId: 'external-user-1' },
          botInfo: { imBotId: 'bot-1', name: '合成托管账号' },
        }],
        next_seq: '',
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ errcode: 0, requestId: 'synthetic-request-id' }), { headers: { 'Content-Type': 'application/json' } });
  },
  fetchModel: async (_url, options) => {
    const body = JSON.parse(options.body);
    const candidate = JSON.parse(body.messages.at(-1).content).candidates[0];
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ tasks: [{
        contact_id: candidate.id,
        priority: 'high',
        reason: '已绑定档案且近期无消息',
        recommended_message: '陈哥，最近整体状态还好吗？有哪里想先弄清楚，我再帮您看。',
        next_action: '客户回复后先确认本次关注点',
        stop_rule: '客户明确不需要后暂停触达',
      }] }) } }],
    }), { headers: { 'Content-Type': 'application/json' } });
  },
} });

const browser = await chromium.launch({ headless: true, ...(process.env.STUDIO_BROWSER_CHANNEL ? { channel: process.env.STUDIO_BROWSER_CHANNEL } : {}) });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const screenshot = async name => {
  await page.evaluate(() => scrollTo(0, 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow: ${name}`);
  await page.screenshot({ path: `artifacts/outreach-${name}.png`, fullPage: true });
};

try {
  await mkdir('artifacts', { recursive: true });
  await page.goto(runtime.url + '/');
  await page.locator('#login-form [name=username]').fill('outreach-admin');
  await page.locator('#login-form [name=password]').fill('OutreachPass123!');
  await page.locator('#login-form [type=submit]').click();
  await page.locator('.app-shell').waitFor();
  await page.locator('[data-page="outreach"]').click();
  await page.locator('.outreach-workspace').waitFor();
  assert.ok((await page.locator('.outreach-workspace').textContent()).includes('句子互动已连接'));

  const syncResponse = page.waitForResponse(response => response.url().endsWith('/api/studio/outreach/sync'));
  await page.locator('[data-action="outreach-sync"]').click();
  await syncResponse;
  await page.waitForSelector('[data-contact]');
  assert.ok((await page.locator('.outreach-workspace').textContent()).includes('5678'));
  assert.ok(!(await page.locator('.outreach-workspace').textContent()).includes('13800135678'));

  await page.locator('[data-contact]').selectOption('customer-1');
  await page.waitForFunction(() => document.querySelector('[data-contact]')?.value === 'customer-1');
  const generated = page.waitForResponse(response => response.url().endsWith('/api/studio/outreach/strategies'));
  await page.getByRole('button', { name: '生成一客一策' }).click();
  await generated;
  await page.waitForSelector('.drawer [data-action="outreach-queue"]');
  assert.ok((await page.locator('.outreach-workspace').textContent()).includes('陈哥'));

  await page.locator('.drawer [data-action="outreach-queue"]').click();
  await page.locator('.drawer [data-action="outreach-send"]').waitFor();
  page.once('dialog', dialog => dialog.accept());
  const sent = page.waitForResponse(response => response.url().includes('/api/studio/outreach/tasks/') && response.url().endsWith('/send'));
  await page.locator('.drawer [data-action="outreach-send"]').click();
  await sent;
  await page.waitForFunction(() => document.querySelector('.outreach-workspace')?.textContent.includes('已发送'));
  await screenshot('desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot('mobile');

  const salesContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const salesPage = await salesContext.newPage();
  await salesPage.goto(runtime.url + '/');
  await salesPage.locator('#login-form [name=username]').fill('outreach-sales');
  await salesPage.locator('#login-form [name=password]').fill('OutreachPass123!');
  await salesPage.locator('#login-form [type=submit]').click();
  await salesPage.locator('.app-shell').waitFor();
  assert.ok(await salesPage.locator('[data-page="outreach"]').isHidden());
  await salesPage.close();
  await salesContext.close();
  assert.deepEqual(errors, []);
  console.log('Outreach browser QA passed: native host page, admin sync/bind/generate/queue/send, privacy, mobile layout, and sales permission. Synthetic upstream and model only.');
} finally {
  await browser.close();
  await runtime.close();
  db.close();
}
