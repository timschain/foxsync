/**
 * PostgreSQL Connection Pool Singleton
 *
 * Lazily created on first access so the process can still start without
 * DATABASE_URL set (falling back to the JSON file registry).
 */

import pg from "pg";

const { Pool } = pg;

let _pool: pg.Pool | null = null;

/**
 * Return the shared Pool instance.
 * Throws if DATABASE_URL is not configured.
 */
export function getPool(): pg.Pool {
  if (_pool) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set — cannot create PostgreSQL pool"
    );
  }

  _pool = new Pool({
    connectionString,
    // TLS is required on most managed Postgres services; disable only for local dev
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: true }
        : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  _pool.on("error", (err) => {
    console.error("PostgreSQL pool error:", err.message);
  });

  return _pool;
}

/**
 * Gracefully close the pool (call during SIGTERM/SIGINT).
 */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
