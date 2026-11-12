import { mkdir } from 'node:fs/promises';
import path from 'node:path';

let storePromise;
const schema = [
  `CREATE TABLE IF NOT EXISTS qa_offers (id TEXT PRIMARY KEY, name TEXT NOT NULL, origins TEXT NOT NULL, steps TEXT NOT NULL, public_key TEXT UNIQUE NOT NULL, created_at BIGINT NOT NULL, demo INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS qa_events (id TEXT PRIMARY KEY, offer_id TEXT NOT NULL REFERENCES qa_offers(id), session_id TEXT NOT NULL, type TEXT NOT NULL, step_id TEXT NOT NULL, phase TEXT NOT NULL, button_id TEXT NOT NULL, label TEXT NOT NULL, occurred_at BIGINT NOT NULL, received_at BIGINT NOT NULL, device TEXT NOT NULL, source TEXT NOT NULL, campaign TEXT NOT NULL, path TEXT NOT NULL, dwell_ms INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS qa_events_offer_session ON qa_events(offer_id, session_id, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS qa_events_offer_time ON qa_events(offer_id, received_at)`,
  `CREATE TABLE IF NOT EXISTS qa_login_attempts (id TEXT PRIMARY KEY, address TEXT NOT NULL, received_at BIGINT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS qa_login_address_time ON qa_login_attempts(address, received_at)`,
];

export function localMode() { return process.env.ANALYTICS_LOCAL === '1' && !process.env.VERCEL; }

async function openStore() {
  let db;
  if (localMode()) {
    const { DatabaseSync } = await import('node:sqlite');
    const filename = path.resolve(process.env.ANALYTICS_SQLITE_FILE || '.data/analytics.sqlite');
    await mkdir(path.dirname(filename), { recursive: true });
    const sqlite = new DatabaseSync(filename);
    sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    const query = async (sql, params = []) => {
      const values = [];
      const statement = sqlite.prepare(sql.replace(/\$(\d+)/g, (_, n) => { values.push(params[Number(n) - 1]); return '?'; }));
      return statement.columns().length ? statement.all(...values) : (statement.run(...values), []);
    };
    // SQLite transactions never await other requests; serialize them before BEGIN.
    let tail = Promise.resolve();
    db = { query, kind: 'sqlite-local', close:()=>sqlite.close(), transaction(worker) {
      const work = tail.then(async () => { sqlite.exec('BEGIN'); try { const value = await worker(query); sqlite.exec('COMMIT'); return value; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } });
      tail = work.catch(() => {}); return work;
    } };
  } else {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw Object.assign(new Error('Conecte um banco Postgres pela variável DATABASE_URL.'), { status: 503 });
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000 });
    db = { kind: 'postgres', query: async (sql, values = []) => (await pool.query(sql, values)).rows,
      async transaction(worker) { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await worker(async (sql, values = []) => (await client.query(sql, values)).rows); await client.query('COMMIT'); return result; } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); } },
    };
  }
  await db.transaction(async query=>{
    if(db.kind==='postgres')await query('SELECT pg_advisory_xact_lock(218937420)');
    for(const sql of schema)await query(sql);
  });
  return db;
}

export function store() {
  storePromise ||= openStore().catch(error => { storePromise = undefined; throw error; });
  return storePromise;
}

export function offerFromRow(row) {
  return row && { id: row.id, name: row.name, origins: JSON.parse(row.origins), steps: JSON.parse(row.steps), publicKey: row.public_key, createdAt: Number(row.created_at), demo: !!row.demo };
}
