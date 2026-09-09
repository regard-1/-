import { createInterface } from 'node:readline/promises';
import { cases } from '../tests/fixtures/studio-cases.mjs';
import { normalizeInput } from './server/generation.mjs';
import { MODEL } from './shared.mjs';

for (const item of cases) normalizeInput(item);
if (!process.argv.includes('--live')) {
  console.log(JSON.stringify({ synthetic_cases: cases.length, input_contract: 'passed', real_model: 'not_run', business_acceptance: 'pending', model: MODEL }, null, 2));
  process.exit(0);
}
if (!process.argv.includes('--confirm-cost')) throw Error('Live evaluation consumes the shared model budget. Add --confirm-cost only when authorized.');
const { STUDIO_EVAL_ORIGIN: target, STUDIO_EVAL_USERNAME: username, STUDIO_EVAL_PASSWORD: password } = process.env;
if (!target || !username || !password) throw Error('Configure STUDIO_EVAL_ORIGIN, STUDIO_EVAL_USERNAME and STUDIO_EVAL_PASSWORD outside source control.');
const origin = new URL(target).origin;
if (!origin.startsWith('https://') && !origin.startsWith('http://127.0.0.1:')) throw Error('Evaluation requires HTTPS or the loopback preview.');
if (!process.stdin.isTTY) throw Error('Live acceptance requires an interactive reviewer, not automatic approval.');
let cookie = '', csrf = '';
async function call(path, body) {
  const response = await fetch(`${origin}/api/studio${path}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(40000),
    headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie, 'X-Studio-CSRF': csrf } : {}) }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok || !value.success) throw Error(`Studio API ${response.status}: ${value.error?.code || 'REQUEST_FAILED'}`);
  if (path === '/login') { cookie = response.headers.get('Set-Cookie').split(';')[0]; csrf = value.data.csrf; }
  return value.data;
}
await call('/login', { username, password });
const rl = createInterface({ input: process.stdin, output: process.stdout });
const summary = { model: MODEL, cases: cases.length, completed: 0, failed: 0, ready: 0, fast: 0, usable: 0, rated: 0, invented_facts: 0, scenario_mismatches: 0, human_reviewed: true };
try {
  for (const item of cases) {
    console.log(`\n${item.id} | ${item.audience} | ${item.scene}\n${item.messages.at(-1).content}\n核对重点：${item.criterion}`);
    try {
      const started = Date.now(), result = await call('/generations', item), elapsed = Date.now() - started;
      summary.completed++; if (result.status !== item.expected_status) summary.scenario_mismatches++;
      console.log(result.status === 'ready' ? `回复：${result.reply}\n下一步：${result.next_step}` : `待补：${result.missing_fields.map(x => x.question).join('；')} ${result.conflicts.join('；')}`);
      if (result.status === 'ready') {
        summary.ready++; if (elapsed <= 10000) summary.fast++;
        let rating;
        while (!['direct', 'edited', 'unusable'].includes(rating)) rating = ({ d: 'direct', e: 'edited', u: 'unusable' })[(await rl.question('采用评价 d=直接可用 / e=小改可用 / u=不可用：')).trim()];
        summary.rated++; if (rating !== 'unusable') summary.usable++;
        await call('/feedback', { generation_id: result.generation_id, rating });
      }
      if ((await rl.question('关键事实、称呼、边界已逐项核对且无编造？输入 yes 确认：')).trim() !== 'yes') summary.invented_facts++;
    } catch { summary.failed++; console.log('本例未完成，请检查服务状态后重新验收。'); }
    // Honor the account's 12 calls/minute limit even when a reviewer answers quickly.
    await new Promise(resolve => setTimeout(resolve, 5100));
  }
} finally { rl.close(); await call('/logout', {}).catch(() => {}); }
summary.passed = summary.completed >= 30 && summary.failed === 0 && summary.scenario_mismatches === 0 && summary.invented_facts === 0 && summary.rated > 0 && summary.usable / summary.rated >= 0.8 && summary.ready > 0 && summary.fast / summary.ready >= 0.8;
console.log(JSON.stringify(summary, null, 2));
console.log('This is synthetic-sample acceptance only. Approved real product materials and pilot-team review are still required.');
process.exitCode = summary.passed ? 0 : 2;
