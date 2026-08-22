/**
 * Validated configuration loaded from environment variables.
 * Using Zod for runtime validation so misconfiguration fails fast at startup.
 */

import { z } from "zod";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const configSchema = z.object({
  // GitHub
  GITHUB_WEBHOOK_SECRET: z.string().min(1, "GitHub webhook secret is required"),
  GITHUB_TOKEN: z.string().min(1, "GitHub token is required"),

  // Stellar
  STELLAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  STELLAR_RPC_URL: z
    .string()
    .url()
    .default("https://soroban-testnet.stellar.org"),
  STELLAR_NETWORK_PASSPHRASE: z
    .string()
    .default("Test SDF Network ; September 2015"),
  STELLAR_OPERATOR_SECRET: z
    .string()
    .min(1, "Operator secret key is required")
    .refine((s) => s.startsWith("S"), "Must be a Stellar secret key (starts with S)"),

  // Contract IDs
  REPUTATION_CONTRACT_ID: z.string().default(""),
  ESCROW_CONTRACT_ID: z.string().default(""),

  // Database (optional — enables PostgreSQL adapter when set)
  DATABASE_URL: z.string().url().optional(),

  // GrantFox platform API (optional)
  GRANTFOX_API_URL: z.string().url().optional(),
  GRANTFOX_API_KEY: z.string().optional(),

  // Optional webhook to notify when FoxPoints are awarded on-chain
  FOXPOINTS_AWARD_WEBHOOK_URL: z.string().url().optional(),

  // Band Protocol oracle (optional) — used to enrich webhook payloads with price data
  BAND_REST_URL: z.string().url().optional(),
  BAND_PRICE_SYMBOL: z.string().default("XLM"),

  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Rate limiting — POST /webhook
  // RATE_LIMIT_WINDOW_MS: sliding window duration in milliseconds (default 1 minute)
  // RATE_LIMIT_MAX:       max requests per IP per window (default 30)
  // TRUST_PROXY:          set to "1" when running behind a reverse proxy / load balancer
  //                       so that X-Forwarded-For is used as the real IP
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
