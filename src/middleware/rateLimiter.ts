/**
 * Per-IP rate limiter for the POST /webhook endpoint.
 *
 * Uses express-rate-limit with an in-memory store (suitable for single-instance
 * deployments). For multi-instance deployments behind a load balancer, swap the
 * store for a shared backend (e.g. rate-limit-redis-store) and set TRUST_PROXY=1.
 *
 * Configuration (via env / config.ts):
 *   RATE_LIMIT_WINDOW_MS  — sliding window in ms          (default: 60 000 = 1 min)
 *   RATE_LIMIT_MAX        — max requests per IP per window (default: 30)
 *   TRUST_PROXY           — trust X-Forwarded-For header   (default: false)
 */

import rateLimit from "express-rate-limit";
import { config } from "../config.js";

export const webhookRateLimiter = rateLimit({
  // Sliding window duration
  windowMs: config.RATE_LIMIT_WINDOW_MS,

  // Hard cap per IP per window
  max: config.RATE_LIMIT_MAX,

  // Return a 429 with a JSON body (consistent with the rest of the API)
  standardHeaders: "draft-7", // Sends combined "ratelimit: limit=N, remaining=N, reset=N" header + ratelimit-policy
  legacyHeaders: false,

  message: {
    error: "Too many requests from this IP, please try again later.",
  },

  // Only count failed requests from GitHub is not practical here because we
  // must verify the signature first. Count all POST /webhook requests instead.
  skipSuccessfulRequests: false,

  // Key function: use the real IP. When TRUST_PROXY=true the app.set call in
  // index.ts will have already rewritten req.ip to the leftmost X-Forwarded-For
  // address, so keyGenerator can simply read req.ip.
  keyGenerator: (req) => req.ip ?? req.socket.remoteAddress ?? "unknown",
});
