/**
 * PostgreSQL Points History Store
 *
 * Reads/writes the `points_history` table created by src/db/migrations.ts.
 * Used when DATABASE_URL is configured; otherwise the JSON file store in
 * src/routes/history.ts is used as the fallback.
 */

import { getPool } from "./pool.js";
import type { PointsHistoryEntry } from "../routes/history.js";

interface HistoryRow {
  id: string;
  github_username: string;
  repo: string;
  pr_or_issue_number: number;
  event_type: "pr_merged" | "issue_closed";
  title: string;
  url: string;
  fox_points: number;
  stellar_tx_hash: string;
  timestamp: string;
  labels: string[];
}

function rowToEntry(row: HistoryRow): PointsHistoryEntry {
  return {
    id: row.id,
    github_username: row.github_username,
    repo: row.repo,
    pr_or_issue_number: row.pr_or_issue_number,
    event_type: row.event_type,
    title: row.title,
    url: row.url,
    fox_points: row.fox_points,
    stellar_tx_hash: row.stellar_tx_hash,
    timestamp: new Date(row.timestamp).toISOString(),
    labels: row.labels,
  };
}

/**
 * Append a new points history entry to the database.
 */
export async function savePointsHistoryPg(
  entry: PointsHistoryEntry
): Promise<void> {
  await getPool().query(
    `INSERT INTO points_history
       (id, github_username, repo, pr_or_issue_number, event_type,
        title, url, fox_points, stellar_tx_hash, timestamp, labels)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING`,
    [
      entry.id,
      entry.github_username.toLowerCase(),
      entry.repo,
      entry.pr_or_issue_number,
      entry.event_type,
      entry.title,
      entry.url,
      entry.fox_points,
      entry.stellar_tx_hash,
      entry.timestamp,
      entry.labels,
    ]
  );
}

/**
 * Fetch history entries for a single contributor.
 */
export async function getContributorHistoryPg(
  githubUsername: string,
  opts: { limit: number; offset: number; repo?: string }
): Promise<{ entries: PointsHistoryEntry[]; total: number; totalPoints: number }> {
  const name = githubUsername.toLowerCase();

  // Total points and count (unfiltered by repo)
  const totalsResult = await getPool().query<{
    total_contributions: string;
    total_points: string;
  }>(
    `SELECT COUNT(*)::text AS total_contributions,
            COALESCE(SUM(fox_points), 0)::text AS total_points
     FROM points_history
     WHERE github_username = $1`,
    [name]
  );
  const total = parseInt(totalsResult.rows[0]?.total_contributions ?? "0", 10);
  const totalPoints = parseInt(totalsResult.rows[0]?.total_points ?? "0", 10);

  // Paginated entries (optionally filtered by repo)
  let query: string;
  let params: (string | number)[];

  if (opts.repo) {
    query = `
      SELECT * FROM points_history
      WHERE github_username = $1 AND repo = $2
      ORDER BY timestamp DESC
      LIMIT $3 OFFSET $4`;
    params = [name, opts.repo, opts.limit, opts.offset];
  } else {
    query = `
      SELECT * FROM points_history
      WHERE github_username = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3`;
    params = [name, opts.limit, opts.offset];
  }

  const result = await getPool().query<HistoryRow>(query, params);
  return { entries: result.rows.map(rowToEntry), total, totalPoints };
}

/**
 * Return per-repo summary for a contributor.
 */
export async function getContributorSummaryPg(
  githubUsername: string
): Promise<{ repo: string; points: number; contributions: number }[]> {
  const result = await getPool().query<{
    repo: string;
    points: string;
    contributions: string;
  }>(
    `SELECT repo,
            SUM(fox_points)::text  AS points,
            COUNT(*)::text         AS contributions
     FROM points_history
     WHERE github_username = $1
     GROUP BY repo
     ORDER BY SUM(fox_points) DESC`,
    [githubUsername.toLowerCase()]
  );

  return result.rows.map((r) => ({
    repo: r.repo,
    points: parseInt(r.points, 10),
    contributions: parseInt(r.contributions, 10),
  }));
}
