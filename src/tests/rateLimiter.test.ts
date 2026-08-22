/**
 * Tests for per-IP rate limiting on POST /webhook.
 *
 * We build a minimal Express app in-test so we can:
 *  - Set a very small RATE_LIMIT_MAX to trigger 429s quickly
 *  - Avoid needing a full set of env vars for the entire application
 *  - Isolate the middleware from business logic
 */

import { describe, it, expect, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";

// ── Test app factory ──────────────────────────────────────────────────────────

/**
 * Build a minimal Express app with rate limiting applied to POST /webhook.
 *
 * @param max   Max requests allowed per window (keep small for tests)
 * @param windowMs  Window duration in ms
 */
function buildTestApp(max: number, windowMs = 60_000) {
  const app = express();

  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests from this IP, please try again later." },
    keyGenerator: (req) => req.ip ?? req.socket.remoteAddress ?? "unknown",
  });

  // Rate limiter on /webhook only
  app.use("/webhook", limiter);

  // Stub handler — always returns 200 if the limiter lets it through
  app.post("/webhook", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  // Other routes are NOT rate limited
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /webhook — per-IP rate limiting", () => {
  it("allows requests under the limit", async () => {
    const app = buildTestApp(5);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post("/webhook").send({}))
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 when limit is exceeded", async () => {
    const app = buildTestApp(3);

    // Send 3 allowed + 1 that should be blocked
    for (let i = 0; i < 3; i++) {
      await request(app).post("/webhook").send({});
    }

    const blocked = await request(app).post("/webhook").send({});

    expect(blocked.status).toBe(429);
  });

  it("returns a JSON error body on 429", async () => {
    const app = buildTestApp(1);

    // Exhaust the limit
    await request(app).post("/webhook").send({});

    const blocked = await request(app).post("/webhook").send({});

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: "Too many requests from this IP, please try again later.",
    });
  });

  it("includes RateLimit headers on allowed responses (draft-7 combined)", async () => {
    const app = buildTestApp(10);

    const res = await request(app).post("/webhook").send({});

    expect(res.status).toBe(200);
    // draft-7 sends a combined "ratelimit" header: "limit=N, remaining=N, reset=N"
    expect(res.headers).toHaveProperty("ratelimit");
    expect(res.headers["ratelimit"]).toMatch(/limit=\d+/);
    expect(res.headers["ratelimit"]).toMatch(/remaining=\d+/);
    expect(res.headers).toHaveProperty("ratelimit-policy");
  });

  it("includes RateLimit headers on 429 responses with remaining=0", async () => {
    const app = buildTestApp(1);

    await request(app).post("/webhook").send({}); // exhaust

    const blocked = await request(app).post("/webhook").send({});

    expect(blocked.status).toBe(429);
    expect(blocked.headers).toHaveProperty("ratelimit");
    expect(blocked.headers["ratelimit"]).toMatch(/remaining=0/);
    expect(blocked.headers).toHaveProperty("retry-after");
  });

  it("does NOT apply rate limiting to GET /health", async () => {
    // Build an app with limit=1 on /webhook — /health must still respond
    const app = buildTestApp(1);

    // Exhaust the webhook limit
    await request(app).post("/webhook").send({});
    await request(app).post("/webhook").send({}); // 429

    // Health check is unaffected
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
  });

  it("decrements the remaining counter with each request", async () => {
    const app = buildTestApp(5);

    const first = await request(app).post("/webhook").send({});
    const second = await request(app).post("/webhook").send({});

    // Parse "remaining=N" from the combined "ratelimit" header
    const parseRemaining = (header: string) =>
      Number(header.match(/remaining=(\d+)/)?.[1] ?? -1);

    const remainingAfterFirst = parseRemaining(first.headers["ratelimit"] as string);
    const remainingAfterSecond = parseRemaining(second.headers["ratelimit"] as string);

    expect(remainingAfterSecond).toBe(remainingAfterFirst - 1);
  });
});
