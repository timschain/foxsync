/**
 * Points History Route — GET /contributors/:username/points
 *
 * Returns the full FoxPoints history for a contributor including
 * timestamps, repo, PR/issue number, and points awarded.
 *
 * Storage back-end is selected at runtime:
 *   DATABASE_URL set   → PostgreSQL (points_history table)
 *   DATABASE_URL unset → JSON file  (./data/points-history.json)
 */

import { Router, Request, Response } from "express";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";

export const historyRouter = Router();

const HISTORY_PATH = "./data/points-history.json";

// ── Shared entry type ─────────────────────────────────────────────────────────

export interface PointsHistoryEntry {
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

// ── JSON file store (fallback) ────────────────────────────────────────────────

function loadHistory(): PointsHistoryEntry[] {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveToFile(entry: PointsHistoryEntry): void {
  mkdirSync("./data", { recursive: true });
  const history = loadHistory();
  history.unshift(entry); // newest first
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

// ── Public write API (used by contributionProcessor) ─────────────────────────

/**
 * Persist a new points history entry to whichever store is active.
 */
export async function savePointsHistory(entry: PointsHistoryEntry): Promise<void> {
  if (process.env.DATABASE_URL) {
    const { savePointsHistoryPg } = await import("../db/postgresHistoryStore.js");
    await savePointsHistoryPg(entry);
  } else {
    saveToFile(entry);
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /contributors/:username/points
 * Returns FoxPoints history for a specific contributor.
 *
 * Query params:
 *   limit  — max results (default 50, max 200)
 *   offset — pagination offset (default 0)
 *   repo   — filter by repo full name (optional)
 */
historyRouter.get(
  "/:username/points",
  async (req: Request, res: Response): Promise<void> => {
    const { username } = req.params;
    const limit  = Math.min(parseInt((req.query.limit  as string) ?? "50",  10), 200);
    const offset = parseInt((req.query.offset as string) ?? "0",  10);
    const repoFilter = req.query.repo as string | undefined;

    if (process.env.DATABASE_URL) {
      const { getContributorHistoryPg } = await import("../db/postgresHistoryStore.js");
      const { entries, total, totalPoints } = await getContributorHistoryPg(
        username,
        { limit, offset, repo: repoFilter }
      );

      res.json({
        github_username: username,
        total_fox_points: totalPoints,
        total_contributions: total,
        count: entries.length,
        offset,
        limit,
        history: entries,
      });
      return;
    }

    // JSON fallback
    const all = loadHistory().filter(
      (e) => e.github_username.toLowerCase() === username.toLowerCase()
    );
    const filtered = repoFilter
      ? all.filter((e) => e.repo.toLowerCase() === repoFilter.toLowerCase())
      : all;

    res.json({
      github_username: username,
      total_fox_points: all.reduce((sum, e) => sum + e.fox_points, 0),
      total_contributions: all.length,
      count: filtered.slice(offset, offset + limit).length,
      offset,
      limit,
      history: filtered.slice(offset, offset + limit),
    });
  }
);

/**
 * GET /contributors/:username/points/summary
 * Returns a summary of points grouped by repo.
 */
historyRouter.get(
  "/:username/points/summary",
  async (req: Request, res: Response): Promise<void> => {
    const { username } = req.params;

    if (process.env.DATABASE_URL) {
      const { getContributorSummaryPg, getContributorHistoryPg } = await import(
        "../db/postgresHistoryStore.js"
      );
      const [summary, { total, totalPoints }] = await Promise.all([
        getContributorSummaryPg(username),
        getContributorHistoryPg(username, { limit: 0, offset: 0 }),
      ]);

      res.json({
        github_username: username,
        total_fox_points: totalPoints,
        total_contributions: total,
        by_repo: summary,
      });
      return;
    }

    // JSON fallback
    const all = loadHistory().filter(
      (e) => e.github_username.toLowerCase() === username.toLowerCase()
    );

    const byRepo: Record<string, { repo: string; points: number; contributions: number }> = {};
    for (const entry of all) {
      if (!byRepo[entry.repo]) {
        byRepo[entry.repo] = { repo: entry.repo, points: 0, contributions: 0 };
      }
      byRepo[entry.repo].points += entry.fox_points;
      byRepo[entry.repo].contributions += 1;
    }

    res.json({
      github_username: username,
      total_fox_points: all.reduce((sum, e) => sum + e.fox_points, 0),
      total_contributions: all.length,
      by_repo: Object.values(byRepo).sort((a, b) => b.points - a.points),
    });
  }
);
