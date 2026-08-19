/**
 * Contributor registry API routes.
 *
 * Allows contributors to register their Stellar address
 * and for the GrantFox platform to query registrations.
 *
 * In production, these endpoints would require authentication
 * (e.g. JWT from the GrantFox platform or GitHub OAuth).
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  registerContributor,
  getStellarAddress,
  getAllContributors,
} from "../github/contributorRegistry.js";

export const registryRouter = Router();

const RegisterSchema = z.object({
  github_username: z.string().min(1).max(39),
  stellar_address: z
    .string()
    .length(56)
    .refine((s) => s.startsWith("G"), "Must start with G"),
});

/** Register a contributor's Stellar address. */
registryRouter.post(
  "/",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const mapping = await registerContributor(
        parsed.data.github_username,
        parsed.data.stellar_address
      );
      res.status(201).json({ ok: true, mapping });
    } catch (err) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : "Registration failed" });
    }
  }
);

/** Look up a contributor's Stellar address. */
registryRouter.get(
  "/:username",
  async (req: Request, res: Response): Promise<void> => {
    const { username } = req.params;
    const address = await getStellarAddress(username);

    if (!address) {
      res.status(404).json({ error: "Contributor not registered" });
      return;
    }

    res.json({ github_username: username, stellar_address: address });
  }
);

/** List all registered contributors. */
registryRouter.get(
  "/",
  async (_req: Request, res: Response): Promise<void> => {
    const contributors = await getAllContributors();
    res.json({ contributors });
  }
);
