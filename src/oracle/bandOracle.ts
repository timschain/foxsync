import { config } from "../config.js";

/**
 * Minimal Band Protocol REST client (lightweight helper).
 * This is intentionally conservative: it expects a simple REST gateway that returns
 * a JSON object with a numeric price field, but tolerates a few common shapes.
 *
 * The repo does not previously include an "admin oracle" module. This helper
 * provides a minimal Band-backed price lookup that can be extended later.
 */
export async function getBandPrice(symbol: string): Promise<number | null> {
  if (!config.BAND_REST_URL) return null;

  const base = config.BAND_REST_URL.replace(/\/$/, "");
  // Best-effort URL: many Band gateways expose different routes; try a few common ones.
  const candidates = [
    `${base}/api/v1/oracle/price/${encodeURIComponent(symbol)}`,
    `${base}/oracle/price/${encodeURIComponent(symbol)}`,
    `${base}/prices/${encodeURIComponent(symbol)}`,
    `${base}/price/${encodeURIComponent(symbol)}`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) continue;
      const j = await res.json();

      // Common shapes: { price: 1.23 } or { result: { price: 1.23 } } or { data: { price: 1.23 } }
      const maybePrice =
        j?.price ?? j?.result?.price ?? j?.data?.price ?? j?.result?.data?.price;
      if (maybePrice != null && !Number.isNaN(Number(maybePrice))) {
        return Number(maybePrice);
      }
    } catch (err) {
      // continue trying other endpoints
      // keep silent; detailed errors are logged by callers if needed
    }
  }

  return null;
}
