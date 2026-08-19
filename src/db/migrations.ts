/**
 * Database Migrations
 *
 * Creates the schema if it does not exist.  Safe to run on every startup
 * because every statement uses IF NOT EXISTS.
 *
 * Tables:
 *   contributors    — GitHub username → Stellar address mapping
 *   points_history  — Append-only ledger of awarded FoxPoints
 */

import { getPool } from "./pool.js";

const CREATE_CONTRIBUTORS = `
  CREATE TABLE IF NOT EXISTS contributors (
    github_username TEXT PRIMARY KEY,
    stellar_address TEXT NOT NULL,
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_POINTS_HISTORY = `
  CREATE TABLE IF NOT EXISTS points_history (
    id                   TEXT PRIMARY KEY,
    github_username      TEXT NOT NULL,
    repo                 TEXT NOT NULL,
    pr_or_issue_number   INTEGER NOT NULL,
    event_type           TEXT NOT NULL CHECK (event_type IN ('pr_merged', 'issue_closed')),
    title                TEXT NOT NULL DEFAULT '',
    url                  TEXT NOT NULL DEFAULT '',
    fox_points           INTEGER NOT NULL,
    stellar_tx_hash      TEXT NOT NULL DEFAULT '',
    timestamp            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    labels               TEXT[] NOT NULL DEFAULT '{}'
  );
`;

const CREATE_POINTS_HISTORY_IDX = `
  CREATE INDEX IF NOT EXISTS points_history_username_idx
    ON points_history (github_username);
`;

/**
 * Run all migrations in a single transaction.
 * Called once on service startup when DATABASE_URL is configured.
 */
export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(CREATE_CONTRIBUTORS);
    await client.query(CREATE_POINTS_HISTORY);
    await client.query(CREATE_POINTS_HISTORY_IDX);
    await client.query("COMMIT");
    console.log("✅ Database migrations applied");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
