import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Local/test adapter only. Production uses the platform's transactional D1 batch API.
export class LocalDB {
  constructor(path = ':memory:') {
    this.sqlite = new DatabaseSync(path);
    this.sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
    this.sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations(tag TEXT PRIMARY KEY)');
    const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
    for (const entry of journal.entries) {
      if (this.sqlite.prepare('SELECT tag FROM local_migrations WHERE tag=?').get(entry.tag)) continue;
      this.sqlite.exec('BEGIN');
      try {
        this.sqlite.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
        this.sqlite.prepare('INSERT INTO local_migrations(tag) VALUES(?)').run(entry.tag);
        this.sqlite.exec('COMMIT');
      } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
    }
  }
  prepare(sql) {
    const stmt = this.sqlite.prepare(sql);
    const bound = args => ({
      bind: (...values) => bound(values),
      first: async () => stmt.get(...args) ?? null,
      all: async () => ({ success: true, results: stmt.all(...args) }),
      run: async () => ({ success: true, results: [], meta: stmt.run(...args) }),
      execute: () => ({ success: true, results: stmt.all(...args) }),
    });
    return bound([]);
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try { const result = statements.map(s => s.execute()); this.sqlite.exec('COMMIT'); return result; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  close() { this.sqlite.close(); }
}
