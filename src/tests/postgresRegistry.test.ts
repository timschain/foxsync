/**
 * Tests for the PostgreSQL contributor registry adapter.
 *
 * pg is mocked so no real database connection is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ContributorMapping } from "../types.js";

// ── Mock pg pool ──────────────────────────────────────────────────────────────

const mockQuery = vi.fn();

vi.mock("../db/pool.js", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// ── Import adapter under test (after mock is set up) ─────────────────────────

const { PostgresContributorRegistry } = await import(
  "../github/registry/postgresRegistry.js"
);

// ── Test addresses (valid Stellar G-addresses, exactly 56 chars) ──────────────

const VALID_ADDRESS = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSR0KLQ3RCA3B7HDKDZ2GZ";
const ALT_ADDRESS   = "GBSJ7KFU2NXACVHVN2VWIMQS4IKLNTSG7BUMAAZM8GCWFHOPX42ZMTCY";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PostgresContributorRegistry", () => {
  let registry: InstanceType<typeof PostgresContributorRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new PostgresContributorRegistry();
  });

  // ── register ─────────────────────────────────────────────────────────────

  describe("register()", () => {
    it("inserts/upserts a contributor and returns the mapping", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await registry.register("Alice", VALID_ADDRESS);

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/INSERT INTO contributors/i);
      expect(params[0]).toBe("alice"); // normalised to lowercase
      expect(params[1]).toBe(VALID_ADDRESS);

      expect(result).toMatchObject<ContributorMapping>({
        githubUsername: "alice",
        stellarAddress: VALID_ADDRESS,
      });
      expect(result.registeredAt).toBeTruthy();
    });

    it("throws on an invalid Stellar address (wrong prefix)", async () => {
      await expect(
        registry.register("bob", "X" + "A".repeat(55))
      ).rejects.toThrow("Invalid Stellar address format");
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("throws on an invalid Stellar address (wrong length)", async () => {
      await expect(
        registry.register("bob", "GSHORT")
      ).rejects.toThrow("Invalid Stellar address format");
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("normalises the username to lowercase", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await registry.register("UPPERCASE_USER", VALID_ADDRESS);

      expect(result.githubUsername).toBe("uppercase_user");
    });
  });

  // ── getStellarAddress ─────────────────────────────────────────────────────

  describe("getStellarAddress()", () => {
    it("returns the address when the contributor exists", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ stellar_address: VALID_ADDRESS }],
      });

      const addr = await registry.getStellarAddress("alice");

      expect(addr).toBe(VALID_ADDRESS);
      const [, params] = mockQuery.mock.calls[0] as [string, string[]];
      expect(params[0]).toBe("alice");
    });

    it("returns null when contributor is not registered", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const addr = await registry.getStellarAddress("unknown");

      expect(addr).toBeNull();
    });

    it("is case-insensitive (normalises username before querying)", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ stellar_address: VALID_ADDRESS }],
      });

      await registry.getStellarAddress("ALICE");

      const [, params] = mockQuery.mock.calls[0] as [string, string[]];
      expect(params[0]).toBe("alice");
    });
  });

  // ── getAll ────────────────────────────────────────────────────────────────

  describe("getAll()", () => {
    it("returns all contributors mapped to ContributorMapping", async () => {
      const now = new Date().toISOString();
      mockQuery.mockResolvedValueOnce({
        rows: [
          { github_username: "alice", stellar_address: VALID_ADDRESS, registered_at: now },
          { github_username: "bob",   stellar_address: ALT_ADDRESS,   registered_at: now },
        ],
      });

      const all = await registry.getAll();

      expect(all).toHaveLength(2);
      expect(all[0]).toMatchObject({ githubUsername: "alice", stellarAddress: VALID_ADDRESS });
      expect(all[1]).toMatchObject({ githubUsername: "bob",   stellarAddress: ALT_ADDRESS });
    });

    it("returns an empty array when no contributors are registered", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const all = await registry.getAll();

      expect(all).toEqual([]);
    });
  });

  // ── isRegistered ─────────────────────────────────────────────────────────

  describe("isRegistered()", () => {
    it("returns true when the contributor exists", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] });

      expect(await registry.isRegistered("alice")).toBe(true);
    });

    it("returns false when the contributor does not exist", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: false }] });

      expect(await registry.isRegistered("nobody")).toBe(false);
    });

    it("normalises the username before querying", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] });

      await registry.isRegistered("BOB");

      const [, params] = mockQuery.mock.calls[0] as [string, string[]];
      expect(params[0]).toBe("bob");
    });
  });
});
