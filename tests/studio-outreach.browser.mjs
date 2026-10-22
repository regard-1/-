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
db.sqlite.prepare(`INSERT INTO studio_outreach_templates(id,title,content,active,created_by,updated_at)
  VALUES('inactive-template','已停用关怀模板','{{称呼}}，已停用模板不应显示。',0,'outreach-admin',?)`).run(Date.now());

let sentText = '';
let releaseBrowserModel;
const browserModelGate = new Promise(resolve => { releaseBrowserModel = resolve; });
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
          imInfo: { externalUserId: 'external-user-1', tags: [{ tagName: '老客' }, { tagName: '老客复购' }, { tagName: '26年天猫包裹卡' }] },
          botInfo: { imBotId: 'bot-1', name: '合成托管账号' },
        }],
        next_seq: '',
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (new URL(String(url)).pathname.endsWith('/message/send')) {
      sentText = JSON.parse(init.body).payload.text;
    }
    if (new URL(String(url)).pathname.endsWith('/message/history')) {
      return new Response(JSON.stringify({ errcode: 0, data: { messages: [], seq: '' } }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ errcode: 0, requestId: 'synthetic-request-id' }), { headers: { 'Content-Type': 'application/json' } });
  },
  fetchModel: async (_url, options) => {
    await browserModelGate;
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
  assert.ok(!(await page.locator('.outreach-template-list').textContent()).includes('已停用关怀模板'));
  const archive = page.locator('details.outreach-archive');
  assert.equal(await archive.count(), 2);
  assert.equal(await archive.locator('summary').filter({ hasText: '30 天真实消息留档' }).count(), 1);
  assert.equal(await archive.locator('summary').filter({ hasText: '画像更新建议' }).count(), 1);
  for (const item of await archive.all()) assert.equal(await item.getAttribute('open'), null);

  const syncResponse = page.waitForResponse(response => response.url().endsWith('/api/studio/outreach/sync'));
  await page.locator('[data-action="outreach-sync"]').click();
  await syncResponse;
  await page.waitForSelector('[data-contact]');
  assert.ok((await page.locator('.outreach-workspace').textContent()).includes('5678'));
  assert.ok(!(await page.locator('.outreach-workspace').textContent()).includes('13800135678'));
  await page.locator('#outreach-exclude-search').fill('老客');
  await page.locator('[data-action="outreach-exclude-select-all"]').click();
  assert.ok((await page.locator('#outreach-exclude-summary').textContent()).includes('已选 2/100 个标签'));
  assert.equal(await page.locator('[data-exclude-tag="老客"]').isChecked(), true);
  assert.equal(await page.locator('[data-exclude-tag="老客复购"]').isChecked(), true);
  await page.locator('[data-action="outreach-exclude-clear"]').click();
  assert.ok((await page.locator('#outreach-exclude-summary').textContent()).includes('已选 0/100 个标签'));
  await page.locator('[data-exclude-tag="老客"]').check();
  assert.ok((await page.locator('#outreach-exclude-summary').textContent()).includes('已选 1/100 个标签'));
  await page.locator('[data-exclude-tag="老客"]').uncheck();
  assert.ok((await page.locator('#outreach-exclude-summary').textContent()).includes('已选 0/100 个标签'));
  await page.locator('#outreach-exclude-search').fill('26年包裹卡');
  assert.ok((await page.locator('#outreach-exclude-summary').textContent()).includes('搜索到 1 个标签'));
  assert.equal(await page.locator('[data-exclude-tag="26年天猫包裹卡"]').isVisible(), true);
  await page.locator('#outreach-strategy-direction').fill('复购提醒');
  assert.equal(await page.locator('#outreach-strategy-direction').inputValue(), '复购提醒');

  const firstHistory = page.waitForResponse(response => response.url().endsWith('/api/studio/outreach/messages/sync'));
  await page.locator('[data-action="outreach-history"]').click();
  assert.equal((await firstHistory).status(), 200);

  const secondHistory = page.waitForResponse(response => response.url().endsWith('/api/studio/outreach/messages/sync'));
  await page.locator('[data-action="outreach-history"]').click();
  assert.equal((await secondHistory).status(), 429);
  await page.locator('.outreach-notice').waitFor();
  assert.ok((await page.locator('.outreach-notice').textContent()).includes('同步间隔未到'));

  const refreshRequests = [];
  const refreshListener = request => {
    if (request.url().includes('/api/studio/outreach')) refreshRequests.push(request);
  };
  page.on('request', refreshListener);
  for (let i = 0; i < 3; i++) {
    const cacheRead = page.waitForResponse(response => new URL(response.url()).pathname === '/api/studio/outreach');
    await page.locator('[data-action="outreach-refresh"]').click();
    await cacheRead;
  }
  page.off('request', refreshListener);
  assert.ok(refreshRequests.length >= 3);
  assert.ok(refreshRequests.every(request => request.method() === 'GET'));
  assert.ok(!refreshRequests.some(request => request.url().endsWith('/outreach/messages/sync')));

  await page.locator('[data-contact]').selectOption('customer-1');
  await page.waitForFunction(() => document.querySelector('[data-contact]')?.value === 'customer-1');
  let abortedJobPoll=false;
  await context.route('**/api/studio/outreach/strategies/jobs/*', async route => {
    if(!abortedJobPoll){
      abortedJobPoll=true;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  const generated = page.waitForResponse(response => response.url().endsWith('/api/studio/outreach/strategies/jobs'));
  const generatedRequest = page.waitForRequest(request => request.url().endsWith('/api/studio/outreach/strategies/jobs'));
  await page.getByRole('button', { name: '生成一客一策' }).click();
  assert.equal(JSON.parse((await generatedRequest).postData()).direction, '复购提醒');
  await generated;
  await page.waitForFunction(() => document.querySelector('.outreach-notice')?.textContent.includes('正在自动重试进度查询'));
  await page.locator('.outreach-job-progress').waitFor();
  await context.unroute('**/api/studio/outreach/strategies/jobs/*');
  await page.locator('[data-page="workbench"]').click();
  await page.getByRole('heading', { name: '今日工作台' }).waitFor();
  await page.locator('[data-page="outreach"]').click();
  await page.locator('.outreach-job-progress').waitFor();
  const progressText = await page.locator('.outreach-job-progress').textContent();
  assert.ok(progressText.includes('切换页面不会中断'));
  assert.ok(progressText.includes('大批量会分批返回'));
  releaseBrowserModel();
  await page.waitForSelector('.drawer [data-action="outreach-queue"]', { timeout: 10000 });
  assert.ok((await page.locator('.outreach-workspace').textContent()).includes('陈哥'));

  assert.equal(await page.locator('.drawer [data-task-select]').count(), 0);
  await page.locator('.drawer-close').click();
  assert.equal(await page.locator('#outreach-batch-queue-button').isDisabled(), true);
  await page.locator('#outreach-task-select-today').check();
  assert.equal(await page.locator('#outreach-task-selected-count').textContent(), '已选今日全部 1 条');
  assert.equal(await page.locator('#outreach-batch-queue-button').isDisabled(), false);
  await page.locator('.outreach-workspace .outreach-task-editor').fill('陈哥，先问一句：最近是精力跟不太上，还是睡眠先受影响？');
  page.once('dialog', dialog => dialog.accept());
  const bulkMessageUpdate = page.waitForRequest(request => request.url().includes('/api/studio/outreach/tasks/') && request.url().endsWith('/message'));
  const bulkQueue = page.waitForResponse(response => response.url().endsWith('/api/studio/outreach/tasks/queue-today'));
  await page.locator('#outreach-batch-queue-button').click();
  const bulkUpdateRequest = await bulkMessageUpdate;
  assert.equal(JSON.parse(bulkUpdateRequest.postData()).message, '陈哥，先问一句：最近是精力跟不太上，还是睡眠先受影响？');
  await bulkQueue;
  await page.waitForFunction(() => document.querySelector('.outreach-queue-list')?.textContent.includes('待人工确认'));
  await page.getByRole('button', { name: '打开对话' }).click();
  await page.locator('.drawer [data-action="outreach-send"]').waitFor();
  await page.locator('.drawer .outreach-task-editor').fill('陈哥，先问一句：最近主要是精力跟不太上，还是睡眠先受影响？');
  page.once('dialog', dialog => dialog.accept());
  const messageUpdate = page.waitForRequest(request => request.url().includes('/api/studio/outreach/tasks/') && request.url().endsWith('/message'));
  const sent = page.waitForResponse(response => response.url().includes('/api/studio/outreach/tasks/') && response.url().endsWith('/send'));
  await page.locator('.drawer [data-action="outreach-send"]').click();
  const updateRequest = await messageUpdate;
  assert.equal(JSON.parse(updateRequest.postData()).message, '陈哥，先问一句：最近主要是精力跟不太上，还是睡眠先受影响？');
  await sent;
  assert.equal(sentText, '陈哥，先问一句：最近主要是精力跟不太上，还是睡眠先受影响？');
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
