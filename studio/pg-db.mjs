import pg from 'pg';
import { readFileSync } from 'node:fs';

// PostgreSQL adapter implementing the same interface as LocalDB.
// Converts SQLite-style ? placeholders to $N, MAX(0,...) to GREATEST(0,...).
export class PgDB {
 constructor(connectionString) {
    // Parse bigint/int8 as JS numbers (default is string, which breaks truthiness checks)
    // OID 20=int8, 21=int2, 23=int4, 26=oid
    for (const oid of [20, 21, 23, 26]) {
      pg.types.setTypeParser(oid, (val) => (val === null ? null : Number(val)));
    }
   this.pool = new pg.Pool({ connectionString, max: 10 });
   this._migrated = false;
 }

  async _ensureMigrations() {
    if (this._migrated) return;
    this._migrated = true;
    const client = await this.pool.connect();
    try {
      await client.query('CREATE TABLE IF NOT EXISTS pg_migrations(tag TEXT PRIMARY KEY)');
      const migrations = [
        { tag: '0002_pg_init', file: '../drizzle/0002_pg_init.sql' },
        { tag: '0003_pg_operational_loop', file: '../drizzle/0003_pg_operational_loop.sql' },
        { tag: '0004_pg_juzi_outreach', file: '../drizzle/0004_pg_juzi_outreach.sql' },
        { tag: '0005_pg_outreach_profile', file: '../drizzle/0005_pg_outreach_profile.sql' },
        { tag: '0006_pg_outreach_template', file: '../drizzle/0006_pg_outreach_template.sql' },
      ];
      for (const migration of migrations) {
        const exists = await client.query('SELECT tag FROM pg_migrations WHERE tag=$1', [migration.tag]);
        if (exists.rows.length) continue;
        const sql = readFileSync(new URL(migration.file, import.meta.url), 'utf8');
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO pg_migrations(tag) VALUES($1)', [migration.tag]);
        await client.query('COMMIT');
      }
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  _convert(sql) {
    let i = 0;
    let converted = sql.replace(/\?/g, () => `$${++i}`);
    converted = converted.replace(/MAX\(0,\s*/g, 'GREATEST(0, ');
    converted = converted.replace(/INSERT OR IGNORE INTO/g, 'INSERT INTO');
    return converted;
  }

  prepare(sql) {
    const convertedSql = this._convert(sql);
    const self = this;
    const bound = function(args) {
      return {
        _sql: convertedSql,
        _args: args,
        bind: (...values) => bound(values),
        first: async () => {
          await self._ensureMigrations();
          const result = await self.pool.query(convertedSql, args);
          return result.rows[0] ?? null;
        },
        all: async () => {
          await self._ensureMigrations();
          const result = await self.pool.query(convertedSql, args);
          return { success: true, results: result.rows };
        },
        run: async () => {
          await self._ensureMigrations();
          const result = await self.pool.query(convertedSql, args);
          return { success: true, results: result.rows, meta: { changes: result.rowCount } };
        },
        execute: async () => {
          await self._ensureMigrations();
          const result = await self.pool.query(convertedSql, args);
          return { success: true, results: result.rows };
        },
      };
    };
    return bound([]);
  }

  async batch(statements) {
    await this._ensureMigrations();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const stmt of statements) {
        const result = await client.query(stmt._sql, stmt._args);
        results.push({ success: true, results: result.rows, meta: { changes: result.rowCount } });
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  close() { return this.pool.end(); }
}
