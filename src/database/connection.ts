import pg from 'pg';
export const databaseState = { dbPool: null as pg.Pool | null };
export async function initPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
  try { await pool.query('SELECT 1'); databaseState.dbPool = pool; console.log('[Database] Connected'); }
  catch (error) { await pool.end(); throw error; }
}
