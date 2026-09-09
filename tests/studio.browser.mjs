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
const hash = await passwordHash('BrowserTest123!');
db.sqlite.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,1,0,?)').run('qa-admin', 'qaadmin', '验收管理员', hash, 'admin', Date.now());
const requests = [];
let simulateError = false;
// Model doubles only exist inside tests, passed as a dependency, never in the dev or production Worker.
const runtime = await startServer({ db, env: { STUDIO_LLM_API_KEY: 'test-only', STUDIO_LLM_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }, dependencies: {
  fetchModel: async (_url, options) => {
    const body = JSON.parse(options.body), { input } = JSON.parse(body.messages[1].content); requests.push(input);
    if (simulateError) return new Response('synthetic upstream failure', { status: 503 });
    const missing = input.scene === 'activity' && !input.supplement.includes('199元');
    const result = {
      status: missing ? 'needs_input' : 'ready', reply: missing ? null : input.style === 'shorter' ? '先了解，不着急决定。您最想了解哪一点？' : '可以先了解，不着急做决定。您现在最想了解哪方面呢？',
      next_step: missing ? '' : '等待客户说明具体关注点。', followups: missing ? [] : [{ when: '客户说明预算', reply: '明白，咱们按您本次预算看合适的信息。' }],
      missing_fields: missing ? [{ field: 'price', question: '请销售补充产品到手价及条件。' }] : [], conflicts: [],
      inferred: { needs: '待明确当前关注点', goal: '澄清需求', evidence: '客户表示先了解' }, used_sources: [], facts: [],
    };
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 100, completion_tokens: 80 } }));
  },
} });
const browser = await chromium.launch({ headless: true, ...(process.env.STUDIO_BROWSER_CHANNEL ? { channel: process.env.STUDIO_BROWSER_CHANNEL } : {}) });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
const generation = async () => {
  const response = page.waitForResponse(r => r.url().endsWith('/api/studio/generations'));
  await page.locator('[data-action="run"]').click(); await response;
};
async function screenshot(name) {
  await page.evaluate(() => scrollTo(0, 0));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, `horizontal page overflow: ${name}`);
  await page.screenshot({ path: `artifacts/studio-${name}.png`, fullPage: true });
}
try {
  await mkdir('artifacts', { recursive: true });
  const fetched = []; page.on('request', r => fetched.push(r.url()));
  await page.goto(runtime.url + '/script-studio/index.html');
  await page.locator('#username').fill('qaadmin'); await page.locator('#password').fill('BrowserTest123!');
  await page.locator('#login-form [type=submit]').click();
  await page.locator('#composer-text').waitFor();
  assert.equal(await page.locator('[data-action="scene"]').count(), 8);
  assert.ok(!fetched.some(u => /demo-api|seed/.test(u)));
  await page.locator('#composer-text').fill('我想先了解一下，本次客户上下文A。');
  await generation(); await page.locator('#reply').waitFor();
  const beforeCopy = requests.length;
  await page.locator('[data-action="copy"]').click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await page.locator('#reply').inputValue());
  assert.equal(requests.length, beforeCopy);
  await page.locator('#reply').fill('编辑采用版本：先说说您想了解的方向吧。');
  await page.locator('[data-action="adopt"]').click();
  await page.locator('#composer-text').fill('我这次更关心预算。');
  await generation(); await page.locator('#reply').waitFor();
  assert.ok(requests.at(-1).messages.some(m => m.role === 'assistant' && m.content.includes('编辑采用版本')));
  assert.ok(!requests.at(-1).messages.some(m => m.role === 'assistant' && m.content.includes('可以先了解')));
  await page.locator('#reply').fill('草稿改写目标，不算已发送。');
  await page.locator('[data-action="shorter"]').click();
  await page.waitForFunction(() => document.querySelector('#reply')?.value.startsWith('先了解'));
  assert.equal(requests.at(-1).rewrite, '草稿改写目标，不算已发送。');
  assert.ok(!requests.at(-1).messages.some(m => m.content.includes('草稿改写目标')));
  const feedback = page.waitForResponse(r => r.url().endsWith('/feedback'));
  await page.locator('[data-action="feedback"][data-id="edited"]').click(); await feedback;
  await screenshot('desktop-reply');
  await page.locator('[data-action="new"]').click();
  assert.equal(await page.locator('#composer-text').inputValue(), '');
  assert.equal(await page.locator('#reply').count(), 0); assert.equal(await page.locator('.bubble-wrap').count(), 0);
  await page.locator('[data-action="scene"][data-id="activity"]').click();
  await page.locator('#composer-text').fill('测试产品A这次多少钱？'); await generation();
  await page.locator('.missing-box').waitFor(); assert.equal(await page.locator('[data-action="copy"]').count(), 0);
  await page.locator('#supplement').fill('测试产品A每盒199元，无额外优惠。'); await generation(); await page.locator('#reply').waitFor();
  assert.equal(requests.at(-1).supplement, '测试产品A每盒199元，无额外优惠。');
  await page.locator('#composer-text').fill('客户内容已变更'); assert.equal(await page.locator('[data-action="copy"]').count(), 0);
  simulateError = true; await generation(); await page.locator('.error').waitFor();
  assert.ok((await page.locator('.thread').textContent()).includes('客户内容已变更'));
  assert.equal(await page.locator('#reply').count(), 0); simulateError = false;
  await page.locator('[data-action="materials"]').click();
  await page.locator('[data-action="new-material"]').click();
  await page.locator('#material-title').fill('仅合成测试资料');
  await page.locator('#material-content').fill('资料测试内容，不是实际产品说明。');
  await page.locator('[name="confirmed"]').check();
  await page.locator('#material-form [type=submit]').click();
  await page.locator('.material-item').waitFor();
  await page.locator('[data-action="edit-material"]').click();
  await page.locator('#material-content').fill('修订后的合成资料。'); await page.locator('[name="confirmed"]').check();
  await page.locator('#material-form [type=submit]').click();
  await page.waitForFunction(() => document.querySelector('.material-item')?.textContent.includes('V2'));
  await page.locator('[data-action="material-versions"]').click();
  await page.waitForFunction(() => document.querySelector('#modal[open]')?.textContent.includes('V1'));
  assert.ok((await page.locator('#modal').textContent()).includes('V1')); await page.locator('[data-action="close-modal"]').click();
  await page.locator('[data-action="generate-page"]').click();
  await page.locator('[data-action="new"]').click();
  await page.locator('[data-action="audience"][data-id="daily_nutrition"]').click();
  await page.locator('[data-action="scene"][data-id="needs"]').click();
  const phone = ['138','0013','8000'].join('');
  let transmitted = '';
  page.on('request', r => { if (r.url().endsWith('/generations')) transmitted = r.postData(); });
  await page.locator('#composer-text').fill(`测试新咨询，手机号${phone}`); await generation(); await page.locator('#reply').waitFor();
  assert.ok(!transmitted.includes(phone)); assert.ok(transmitted.includes('尾号8000'));
  assert.equal(requests.at(-1).audience, 'daily_nutrition');
  for (const width of [390, 320, 768]) { await page.setViewportSize({ width, height: 844 }); await screenshot(`mobile-${width}`); }
  await page.reload(); await page.locator('#composer-text').waitFor();
  assert.equal(await page.locator('#composer-text').inputValue(), ''); assert.equal(await page.locator('.bubble-wrap').count(), 0);
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
  await page.locator('[data-action="users"]').click(); await page.locator('[data-action="new-user"]').click();
  await page.locator('#new-username').fill('freshsales'); await page.locator('#display-name').fill('合成试用销售');
  await page.locator('#temporary-password').fill('FreshPass123!'); await page.locator('#user-form [type=submit]').click();
  await page.waitForFunction(() => document.querySelector('.table')?.textContent.includes('freshsales'));
  await page.locator('[data-action="logout"]').click(); await page.locator('#login-form').waitFor();
  await page.reload(); await page.locator('#login-form').waitFor();
  await page.locator('#username').fill('freshsales'); await page.locator('#password').fill('FreshPass123!'); await page.locator('#login-form [type=submit]').click();
  await page.locator('#password-form').waitFor();
  await page.locator('#current-password').fill('FreshPass123!'); await page.locator('#new-password').fill('SalesChanged123!');
  await page.locator('#password-form [type=submit]').click(); await page.locator('#login-form').waitFor();
  await page.locator('#username').fill('freshsales'); await page.locator('#password').fill('SalesChanged123!'); await page.locator('#login-form [type=submit]').click();
  await page.locator('#composer-text').waitFor(); assert.equal(await page.locator('[data-action="users"]').count(), 0);
  await page.locator('[data-action="materials"]').click(); await page.locator('.material-item').waitFor();
  assert.equal(await page.locator('[data-action="edit-material"]').count(), 0); assert.equal(await page.locator('[data-action="new-material"]').count(), 0);
  // Exercise the real host navigation and isolated iframe together, not a second application shell.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(runtime.url + '/script-studio');
  await page.locator('#login-view #login-form [type=submit]').click();
  const studio = page.frameLocator('#studio-frame');
  await studio.locator('#composer-text').waitFor();
  assert.equal(await page.locator('.sidebar').count(), 1);
  assert.equal(await studio.locator('.sidebar').count(), 0);
  assert.equal(await page.locator('.nav-item.active').getAttribute('data-page'), 'scripts');
  assert.equal(new URL(page.url()).origin, runtime.url);
  await studio.locator('#composer-text').fill('仅本次嵌入咨询，不应被用户资产读取。');
  const generated = page.waitForResponse(r => r.url().endsWith('/api/studio/generations'));
  await studio.locator('[data-action="run"]').click(); await generated;
  await studio.locator('#reply').waitFor();
  await studio.locator('[data-action="copy"]').click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await studio.locator('#reply').inputValue());
  const documentRequests = [];
  page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documentRequests.push(r.url()); });
  for (const target of ['assets', 'conversations', 'workbench']) {
    await page.locator(`.nav-item[data-page="${target}"]`).click();
    await page.locator('#main-content .loading-card').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#studio-frame').count(), 0);
    await page.locator('.nav-item[data-page="scripts"]').click(); await studio.locator('#composer-text').waitFor();
    assert.equal(await studio.locator('#composer-text').inputValue(), '');
    assert.equal(await studio.locator('.bubble-wrap').count(), 0);
  }
  await page.goBack();
  await page.locator('.nav-item[data-page="workbench"].active').waitFor();
  await page.goForward(); await studio.locator('#composer-text').waitFor();
  await page.evaluate(async () => {
    const original = window.fetch;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    window.fetch = async (url, options) => { if (url === '/api/v1/private/workbench') await gate; return original(url, options); };
    const delayed = navigate('workbench');
    await navigate('scripts'); release(); await delayed;
    window.fetch = original;
  });
  await studio.locator('#composer-text').waitFor();
  assert.equal(await page.locator('#page-title').textContent(), '话术中心');
  assert.equal(await page.locator('#studio-frame').count(), 1);
  await page.evaluate(async () => {
    const original = window.fetch;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    window.fetch = async (url, options) => { if (url === '/api/studio/status') await gate; return original(url, options); };
    const delayed = navigate('scripts');
    await navigate('assets'); release(); await delayed;
    window.fetch = original;
  });
  assert.equal(await page.locator('#studio-frame').count(), 0);
  assert.equal(await page.locator('#page-title').textContent(), '用户资产');
  await page.locator('.nav-item[data-page="scripts"]').click(); await studio.locator('#composer-text').waitFor();
  assert.deepEqual(documentRequests, [], 'Tab switches must not reload or leave the original platform');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    const frame = await page.locator('#studio-frame').elementHandle().then(el => el.contentFrame());
    await frame.evaluate(() => scrollTo(0, 0));
    await screenshot(`embedded-${width}`);
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await studio.locator('[data-action="run"]').scrollIntoViewIfNeeded();
    assert.ok(await studio.locator('[data-action="run"]').isVisible());
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const logout = page.waitForResponse(r => r.url().endsWith('/api/studio/logout'));
  await page.locator('#logout-button').click(); await logout;
  await page.locator('#login-view').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#studio-frame').count(), 0);
  assert.equal((await context.request.get(runtime.url + '/api/studio/me')).status(), 401);
  assert.deepEqual(errors, []);
  console.log('Studio browser QA passed: desktop/mobile, edit/adopt/copy, continuation, missing facts, model failure, privacy, materials versions, logout/refresh, account creation/forced password/sales read-only, embedded host navigation/back/forward/stale responses and scrolling. Synthetic model only.');
} finally { await browser.close(); await runtime.close(); db.close(); }
