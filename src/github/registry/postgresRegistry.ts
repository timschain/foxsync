/**
 * PostgreSQL Registry Adapter
 *
 * Stores contributor mappings in the `contributors` table created by
 * src/db/migrations.ts.  Used when DATABASE_URL is set.
 */

import { ContributorMapping } from "../../types.js";
import { IContributorRegistry } from "./types.js";
import { getPool } from "../../db/pool.js";

function validateAddress(address: string): void {
  if (!address.startsWith("G") || address.length !== 56) {
    throw new Error("Invalid Stellar address format");
  }
}

export class PostgresContributorRegistry implements IContributorRegistry {
  async register(
    githubUsername: string,
    stellarAddress: string
  ): Promise<ContributorMapping> {
    validateAddress(stellarAddress);

    const normalised = githubUsername.toLowerCase();
    const now = new Date().toISOString();

    await getPool().query(
      `INSERT INTO contributors (github_username, stellar_address, registered_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (github_username)
       DO UPDATE SET stellar_address = EXCLUDED.stellar_address,
                     registered_at   = EXCLUDED.registered_at`,
      [normalised, stellarAddress, now]
    );

    return { githubUsername: normalised, stellarAddress, registeredAt: now };
  }

  async getStellarAddress(githubUsername: string): Promise<string | null> {
    const result = await getPool().query<{ stellar_address: string }>(
      `SELECT stellar_address FROM contributors WHERE github_username = $1`,
      [githubUsername.toLowerCase()]
    );
    return result.rows[0]?.stellar_address ?? null;
  }

  async getAll(): Promise<ContributorMapping[]> {
    const result = await getPool().query<{
      github_username: string;
      stellar_address: string;
      registered_at: string;
    }>(
      `SELECT github_username, stellar_address, registered_at
       FROM contributors
       ORDER BY registered_at DESC`
    );

    return result.rows.map((row) => ({
      githubUsername: row.github_username,
      stellarAddress: row.stellar_address,
      registeredAt: new Date(row.registered_at).toISOString(),
    }));
  }

  async isRegistered(githubUsername: string): Promise<boolean> {
    const result = await getPool().query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM contributors WHERE github_username = $1
       ) AS exists`,
      [githubUsername.toLowerCase()]
    );
    return result.rows[0]?.exists ?? false;
  }
}
