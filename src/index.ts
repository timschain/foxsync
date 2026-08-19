/**
 * GrantFox Webhook Sync Service — Entry Point
 *
 * Starts the Express server and wires up:
 * - GitHub webhook receiver with HMAC signature verification
 * - Contributor registry API
 * - Contribution processing pipeline → Stellar on-chain awards
 * - PostgreSQL migrations (when DATABASE_URL is configured)
 */

import express from "express";
import { config } from "./config.js";
import { webhookRouter } from "./routes/webhook.js";
import { registryRouter } from "./routes/registry.js";
import { historyRouter } from "./routes/history.js";
import { setContributionEventHandler } from "./github/webhookHandler.js";
import { processContributionEvent } from "./services/contributionProcessor.js";
import { mkdirSync } from "fs";

// Ensure data directory exists for JSON registry fallback
mkdirSync("./data", { recursive: true });

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

// Raw body needed for GitHub webhook HMAC verification
app.use(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, _res, next) => {
    if (Buffer.isBuffer(req.body)) {
      req.body = req.body.toString("utf-8");
    }
    next();
  }
);

// JSON parsing for all other routes
app.use(express.json());

// Basic security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use("/webhook", webhookRouter);
app.use("/contributors", registryRouter);
app.use("/contributors", historyRouter);

// Health check — used by deployment platforms and monitoring
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "grantfox-webhook-sync",
    version: "0.1.0",
    network: config.STELLAR_NETWORK,
    storage: config.DATABASE_URL ? "postgres" : "json-file",
    timestamp: new Date().toISOString(),
  });
});

// ── Wire up contribution processing pipeline ──────────────────────────────────

setContributionEventHandler(processContributionEvent);

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // Run database migrations when PostgreSQL is configured
  if (config.DATABASE_URL) {
    console.log("▶ DATABASE_URL detected — running PostgreSQL migrations…");
    const { runMigrations } = await import("./db/migrations.js");
    await runMigrations();
  }

  const server = app.listen(config.PORT, () => {
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║      GrantFox Webhook Sync Service           ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log(`▶ Listening on port ${config.PORT}`);
    console.log(`▶ Network: ${config.STELLAR_NETWORK}`);
    console.log(`▶ Storage: ${config.DATABASE_URL ? "PostgreSQL" : "JSON file"}`);
    console.log(`▶ Reputation contract: ${config.REPUTATION_CONTRACT_ID || "⚠ not set"}`);
    console.log(`▶ GrantFox API: ${config.GRANTFOX_API_URL ?? "not configured"}`);
    console.log("");
    console.log("Endpoints:");
    console.log(`  POST /webhook         — GitHub webhook receiver`);
    console.log(`  GET  /health          — Health check`);
    console.log(`  POST /contributors    — Register contributor Stellar address`);
    console.log(`  GET  /contributors/:u — Look up contributor`);
    console.log(`  GET  /contributors/:u/points         — FoxPoints history`);
    console.log(`  GET  /contributors/:u/points/summary — Points by repo`);
  });

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log("Shutting down gracefully…");
    server.close(async () => {
      if (config.DATABASE_URL) {
        const { closePool } = await import("./db/pool.js");
        await closePool();
      }
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT",  shutdown);
}

bootstrap().catch((err) => {
  console.error("❌ Startup failed:", err);
  process.exit(1);
});

export default app;
