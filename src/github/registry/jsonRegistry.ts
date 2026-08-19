/**
 * JSON File Registry Adapter
 *
 * The original reference implementation — reads/writes a JSON file on disk.
 * Used as the default when DATABASE_URL is not configured (development /
 * single-instance deployments).
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { ContributorMapping } from "../../types.js";
import { IContributorRegistry } from "./types.js";

const REGISTRY_PATH = "./data/contributors.json";

function validateAddress(address: string): void {
  if (!address.startsWith("G") || address.length !== 56) {
    throw new Error("Invalid Stellar address format");
  }
}

function loadFromDisk(): Map<string, ContributorMapping> {
  if (!existsSync(REGISTRY_PATH)) return new Map();
  try {
    const raw = readFileSync(REGISTRY_PATH, "utf-8");
    const arr: ContributorMapping[] = JSON.parse(raw);
    return new Map(arr.map((c) => [c.githubUsername.toLowerCase(), c]));
  } catch {
    return new Map();
  }
}

function saveToDisk(map: Map<string, ContributorMapping>): void {
  try {
    writeFileSync(REGISTRY_PATH, JSON.stringify(Array.from(map.values()), null, 2));
  } catch (err) {
    console.error("Failed to persist contributor registry:", err);
  }
}

export class JsonContributorRegistry implements IContributorRegistry {
  private readonly store: Map<string, ContributorMapping>;

  constructor() {
    this.store = loadFromDisk();
  }

  async register(
    githubUsername: string,
    stellarAddress: string
  ): Promise<ContributorMapping> {
    validateAddress(stellarAddress);

    const mapping: ContributorMapping = {
      githubUsername: githubUsername.toLowerCase(),
      stellarAddress,
      registeredAt: new Date().toISOString(),
    };

    this.store.set(githubUsername.toLowerCase(), mapping);
    saveToDisk(this.store);
    return mapping;
  }

  async getStellarAddress(githubUsername: string): Promise<string | null> {
    return this.store.get(githubUsername.toLowerCase())?.stellarAddress ?? null;
  }

  async getAll(): Promise<ContributorMapping[]> {
    return Array.from(this.store.values());
  }

  async isRegistered(githubUsername: string): Promise<boolean> {
    return this.store.has(githubUsername.toLowerCase());
  }
}
