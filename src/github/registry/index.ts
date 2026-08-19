/**
 * Registry factory
 *
 * Returns the appropriate IContributorRegistry implementation based on
 * whether DATABASE_URL is configured in the environment.
 *
 *   DATABASE_URL set   → PostgresContributorRegistry
 *   DATABASE_URL unset → JsonContributorRegistry
 *
 * The singleton is created once and shared for the lifetime of the process.
 */

import { IContributorRegistry } from "./types.js";
import { JsonContributorRegistry } from "./jsonRegistry.js";
import { PostgresContributorRegistry } from "./postgresRegistry.js";

export type { IContributorRegistry } from "./types.js";

let _instance: IContributorRegistry | null = null;

export function getRegistry(): IContributorRegistry {
  if (_instance) return _instance;

  if (process.env.DATABASE_URL) {
    console.log("▶ Using PostgreSQL contributor registry");
    _instance = new PostgresContributorRegistry();
  } else {
    console.log("▶ Using JSON file contributor registry (set DATABASE_URL to switch to Postgres)");
    _instance = new JsonContributorRegistry();
  }

  return _instance;
}

/** Replace the singleton — used in tests to inject a mock. */
export function _setRegistryForTesting(instance: IContributorRegistry): void {
  _instance = instance;
}
