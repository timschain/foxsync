/**
 * Tests for the contributor registry (JSON file adapter).
 */

import { describe, it, expect, vi } from "vitest";

// Mock fs to avoid disk I/O in tests
vi.mock("fs", () => ({
  readFileSync: vi.fn(() => "[]"),
  writeFileSync: vi.fn(),
  existsSync:   vi.fn(() => false),
}));

// Re-import after mocking
const { registerContributor, getStellarAddress, isRegistered } = await import(
  "../github/contributorRegistry.js"
);

describe("contributorRegistry", () => {
  const validAddress  = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSR0KLQ3RCA3B7HDKDZ2GZ";
  const validAddress2 = "GBSJ7KFU2NXACVHVN2VWIMQS4IKLNTSG7BUMAAZM8GCWFHOPX42ZMTCY";

  it("registers a contributor and retrieves their address", async () => {
    await registerContributor("alice", validAddress);
    expect(await getStellarAddress("alice")).toBe(validAddress);
  });

  it("is case-insensitive for usernames", async () => {
    await registerContributor("Bob", validAddress);
    expect(await getStellarAddress("bob")).toBe(validAddress);
    expect(await getStellarAddress("BOB")).toBe(validAddress);
  });

  it("returns null for unregistered contributors", async () => {
    expect(await getStellarAddress("unknown-user-xyz")).toBeNull();
  });

  it("correctly reports registration status", async () => {
    await registerContributor("charlie", validAddress);
    expect(await isRegistered("charlie")).toBe(true);
    expect(await isRegistered("dave")).toBe(false);
  });

  it("rejects invalid Stellar addresses", async () => {
    await expect(registerContributor("eve", "invalid")).rejects.toThrow();
    await expect(registerContributor("eve", "SINVALID")).rejects.toThrow();
  });

  it("allows updating a contributor's address", async () => {
    await registerContributor("frank", validAddress);
    await registerContributor("frank", validAddress2);
    expect(await getStellarAddress("frank")).toBe(validAddress2);
  });
});
