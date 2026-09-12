import { digest, fail, sessionToken } from './security.mjs';
import { MODEL, monthKey } from '../shared.mjs';

export class Store {
  constructor(db) { this.db = db; }
  query(sql, ...args) { return this.db.prepare(sql).bind(...args); }
  async all(sql, ...args) { return (await this.query(sql, ...args).all()).results; }
  async rateLimit(key, maximum, windowSeconds) {
    const now = Date.now();
    const result = await this.query(`INSERT INTO studio_rate_limits(key,attempts,expires_at) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,
      expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`, key, now + windowSeconds * 1000, now, now).first();
    if (result.attempts > maximum) fail(429, '操作较频繁，请稍后再试', 'RATE_LIMIT');
  }
  async authenticate(request) {
    const token = sessionToken(request);
    if (!token) fail(401, '请登录话术工具', 'LOGIN_REQUIRED');
    const user = await this.query(`SELECT u.id,u.username,u.display_name,u.role,u.must_change,s.csrf,s.token_hash
      FROM studio_sessions s JOIN studio_users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`, await digest(token), Date.now()).first();
    if (!user) fail(401, '登录已失效，请重新登录', 'LOGIN_REQUIRED');
    return user;
  }
  async budget() {
    return await this.query('SELECT * FROM studio_budgets WHERE month=?', monthKey()).first() || { month: monthKey(), spent: 0, reserved: 0, ceiling: 999999999999 };
  }
  async reserve(user, input, reservation) {
    const month = monthKey(), id = crypto.randomUUID(), now = Date.now();
    const results = await this.db.batch([
      this.query('INSERT OR IGNORE INTO studio_budgets(month,spent,reserved,ceiling) VALUES(?,0,0,999999999999)', month),
      this.query(`UPDATE studio_budgets SET reserved=reserved+? WHERE month=?
        AND (SELECT COUNT(*) FROM studio_usage WHERE user_id=? AND status='pending')<1 RETURNING month`, reservation, month, user.id),
      this.query(`INSERT INTO studio_usage(id,user_id,month,audience,scene,model,status,reservation,cost,created_at)
        SELECT ?,?,?,?,?,?,'pending',?,0,? WHERE changes()=1 RETURNING id`, id, user.id, month, input.audience, input.scene, MODEL, reservation, now),
    ]);
    if (!results[2].results.length) fail(429, '正在生成中，请等待当前回复完成', 'BUSY');
    return { id, month, reservation, started: now };
  }
 async settle(entry, status, cost, usage = {}, elapsed = Date.now() - entry.started) {
   await this.db.batch([
     this.query(`UPDATE studio_usage SET status=?,cost=?,input_tokens=?,output_tokens=?,elapsed_ms=?
       WHERE id=? AND status='pending'`, status, cost, usage.prompt_tokens ?? null, usage.completion_tokens ?? null, elapsed, entry.id),
     this.query(`UPDATE studio_budgets SET reserved=MAX(0,reserved-?),spent=spent+?
       WHERE month=? AND changes()=1`, entry.reservation, cost, entry.month),
   ]);
 }
 async saveConversation(data) {
   await this.query(`INSERT INTO studio_conversations(id,usage_id,user_id,audience,scene,messages,reply,next_step,followups,resources,supplement,salutation,needs,goal,instruction,status,feedback,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?)`,
     data.id, data.usage_id, data.user_id, data.audience, data.scene,
     JSON.stringify(data.messages), data.reply ?? null, data.next_step ?? null,
     JSON.stringify(data.followups ?? []), JSON.stringify(data.resources ?? []),
     data.supplement ?? null, data.salutation ?? null, data.needs ?? null,
     data.goal ?? null, data.instruction ?? null, data.status, data.created_at).run();
 }
 async cleanup() {
   const now = Date.now();
   await this.db.batch([
     this.query('DELETE FROM studio_sessions WHERE expires_at<=?', now),
     this.query('DELETE FROM studio_rate_limits WHERE expires_at<=?', now),
     this.query('DELETE FROM studio_conversations WHERE created_at<?', now - 2592000000),
   ]);
    const stale = await this.all("SELECT id,month,reservation,created_at FROM studio_usage WHERE status='pending' AND created_at<? LIMIT 100", now - 120000);
    for (const row of stale) await this.settle({ ...row, started: row.created_at }, 'unknown', row.reservation);
  }
}
