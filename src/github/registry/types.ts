/**
 * IContributorRegistry — the interface every registry adapter must satisfy.
 *
 * Swapping between JSON-file and PostgreSQL is purely a matter of which
 * concrete class is returned by the factory in index.ts.
 */

import { ContributorMapping } from "../../types.js";

export interface IContributorRegistry {
  /**
   * Register (or update) a contributor's Stellar address.
   * Throws on invalid address format.
   */
  register(
    githubUsername: string,
    stellarAddress: string
  ): Promise<ContributorMapping>;

  /**
   * Resolve a GitHub username to a Stellar address.
   * Returns null when the contributor is not registered.
   */
  getStellarAddress(githubUsername: string): Promise<string | null>;

  /**
   * Return every registered contributor.
   */
  getAll(): Promise<ContributorMapping[]>;

  /**
   * Return true when the given username has a registered address.
   */
  isRegistered(githubUsername: string): Promise<boolean>;
}
