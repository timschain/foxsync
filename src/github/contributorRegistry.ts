/**
 * Contributor Registry — public API
 *
 * Thin delegation layer over the registry adapter selected by the factory in
 * src/github/registry/index.ts.  All callers (routes, processor, tests) import
 * from this module so they are not coupled to the concrete adapter.
 *
 * Adapter selection:
 *   DATABASE_URL set   → PostgreSQL (persistent, scalable)
 *   DATABASE_URL unset → JSON file  (zero-config, development-friendly)
 */

import { ContributorMapping } from "../types.js";
import { getRegistry } from "./registry/index.js";

/**
 * Register or update a contributor's Stellar address.
 * Throws if the address format is invalid.
 */
export async function registerContributor(
  githubUsername: string,
  stellarAddress: string
): Promise<ContributorMapping> {
  return getRegistry().register(githubUsername, stellarAddress);
}

/**
 * Resolve a GitHub username to a Stellar address.
 * Returns null when the contributor is not registered.
 */
export async function getStellarAddress(
  githubUsername: string
): Promise<string | null> {
  return getRegistry().getStellarAddress(githubUsername);
}

/**
 * Return all registered contributors.
 */
export async function getAllContributors(): Promise<ContributorMapping[]> {
  return getRegistry().getAll();
}

/**
 * Return true when the given GitHub username has a registered Stellar address.
 */
export async function isRegistered(githubUsername: string): Promise<boolean> {
  return getRegistry().isRegistered(githubUsername);
}
