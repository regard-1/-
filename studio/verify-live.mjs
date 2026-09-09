import { LocalDB } from './local-db.mjs';
import { Store } from './server/store.mjs';
import { generate } from './server/generation.mjs';
import { cases } from '../tests/fixtures/studio-cases.mjs';

// Operator-run technical probe, not a login endpoint or human acceptance shortcut.
// Only aggregate results leave this process; prompts/replies are never printed or saved.
if (!process.argv.includes('--confirm-cost')) throw Error('Explicit --confirm-cost is required.');
if (!process.env.STUDIO_LLM_API_KEY || !process.env.STUDIO_LLM_BASE_URL) throw Error('Configure the private server environment first.');
const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || 4);
if (!Number.isInteger(limit) || limit < 1 || limit > cases.length) throw Error('Invalid case limit.');
const db = new LocalDB(new URL('../.studio-local/studio.db', import.meta.url).pathname);
const store = new Store(db);
const user = await store.query("SELECT id FROM studio_users WHERE role='admin' AND active=1 AND must_change=0 ORDER BY created_at LIMIT 1").first();
if (!user) { db.close(); throw Error('Create the local administrator first.'); }
const initial = await store.budget();
const summary = { attempted: 0, completed: 0, failed: 0, scenario_matches: 0, ready: 0, ready_under_10s: 0, human_reviewed: false, business_acceptance: 'pending' };
try {
  for (const item of cases.slice(0, limit)) {
    await store.cleanup();
    const current = await store.budget();
    if (current.month !== initial.month || current.spent - initial.spent >= 4_000_000) { console.log('Run limit reached; stopped before another request.'); break; }
    await store.rateLimit(`generate:${user.id}`, 12, 60);
    let httpStatus = null, diagnostic = [], vendorCode = null, shape = null;
    const fetchModel = async (...args) => {
      const response = await fetch(...args); httpStatus = response.status;
      if (!response.ok) {
        const raw = await response.clone().text();
        try {
          const payload = JSON.parse(raw), code = payload.error?.code || payload.code;
          if (typeof code === 'string' && /^(?:Invalid|BadRequest|Forbidden|AccessDenied|Unauthorized|Missing|Unsupported|Service|Throttl|Model|Workspace)[A-Za-z0-9._-]{0,70}$/i.test(code)) vendorCode = code;
        } catch { /* A non-JSON provider error still reports only its HTTP status. */ }
        diagnostic = ['response_format', 'json_schema', 'enable_thinking', 'enable_search', 'max_tokens', 'api_key', 'workspace', 'balance', 'arrears'].filter(field => raw.toLowerCase().includes(field));
      } else {
        try {
          const payload = await response.clone().json(), choice = payload.choices?.[0];
          const output = JSON.parse(choice?.message?.content);
          const status = ['ready', 'needs_input'].includes(output.status) ? output.status : 'other';
          shape = { finish: ['stop', 'length', 'content_filter'].includes(choice.finish_reason) ? choice.finish_reason : 'other', status,
            reply_chars: typeof output.reply === 'string' ? output.reply.length : null,
            missing: output.missing_fields?.length ?? null, conflicts: output.conflicts?.length ?? null,
            followups: output.followups?.length ?? null,
            missing_keys: ['status','reply','next_step','followups','missing_fields','conflicts','inferred','used_sources','facts'].filter(key => !(key in output)),
            negated_safety_phrase: /(?:不能|不应|不可以|无法|不做|不作|不提供|没有办法|不能够).{0,8}(?:保证|替代药物)/.test(output.reply || '') };
        } catch { shape = { json_parseable: false }; }
      }
      return response;
    };
    const started = Date.now(); summary.attempted++;
    try {
      const result = await generate(store, user, item, process.env, fetchModel);
      summary.completed++; if (result.status === item.expected_status) summary.scenario_matches++;
      if (result.status === 'ready') { summary.ready++; if (Date.now() - started <= 10000) summary.ready_under_10s++; }
      console.log(JSON.stringify({ case_id: item.id, status: result.status, expected_status: item.expected_status, elapsed_ms: Date.now() - started, citations: result.used_sources.length, http_status: httpStatus, shape }));
    } catch (error) {
      summary.failed++;
      console.log(JSON.stringify({ case_id: item.id, status: 'failed', error_code: typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'UNKNOWN', http_status: httpStatus, vendor_code: vendorCode, diagnostic_fields: diagnostic, elapsed_ms: Date.now() - started, shape }));
      if (httpStatus && httpStatus !== 200) break;
    }
    if (summary.attempted < limit) await new Promise(resolve => setTimeout(resolve, 5100));
  }
  const final = await store.budget(); summary.run_accounted_cny = (final.spent - initial.spent) / 1000000;
  console.log(JSON.stringify(summary));
  process.exitCode = summary.failed || summary.attempted !== limit || summary.scenario_matches !== limit ? 2 : 0;
} finally { db.close(); }
