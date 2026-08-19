/**
 * Contribution Processor
 *
 * The core business logic pipeline:
 * 1. Receive a ContributionEvent
 * 2. Look up the contributor's Stellar address
 * 3. Calculate FoxPoints based on labels
 * 4. Award points on-chain via the Reputation contract
 * 5. Optionally sync to the GrantFox platform API
 * 6. Log the result
 */

import { ContributionEvent, ProcessingResult } from "../types.js";
import { getStellarAddress } from "../github/contributorRegistry.js";
import { calculatePoints, getPointsReason } from "../github/pointsCalculator.js";
import { awardFoxPoints } from "../stellar/reputationClient.js";
import { syncToGrantFox } from "./grantfoxSync.js";
import { config } from "../config.js";

/**
 * Process a single contribution event end-to-end.
 */
export async function processContributionEvent(
  event: ContributionEvent
): Promise<ProcessingResult> {
  console.log(
    `📥 Processing ${event.eventType} #${event.number} by @${event.contributor} in ${event.repo}`
  );

  // Step 1: Look up Stellar address
  const stellarAddress = await getStellarAddress(event.contributor);
  if (!stellarAddress) {
    const msg = `@${event.contributor} has no registered Stellar address — skipping on-chain award`;
    console.warn(`⚠️  ${msg}`);
    return {
      success: false,
      event,
      error: msg,
    };
  }

  // Step 2: Calculate FoxPoints
  const points = calculatePoints(event.labels);
  const reason = getPointsReason(event.labels);
  console.log(`🦊 Awarding ${points} FoxPoints to ${stellarAddress} (${reason})`);

  const result: ProcessingResult = {
    success: false,
    event,
    foxPointsAwarded: points,
  };

  // Step 3: Award points on-chain
  try {
    const txHash = await awardFoxPoints(stellarAddress, points);
    result.stellarTxHash = txHash;
    console.log(`✅ On-chain award tx: ${txHash}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ On-chain award failed: ${msg}`);
    result.error = `On-chain: ${msg}`;
    return result;
  }

  // Step 4: Sync to GrantFox API (optional — fails gracefully)
  if (config.GRANTFOX_API_URL && config.GRANTFOX_API_KEY) {
    try {
      await syncToGrantFox(event, points, result.stellarTxHash ?? "");
      result.grantfoxSynced = true;
      console.log(`🔗 Synced to GrantFox platform`);
    } catch (err) {
      console.warn(
        `⚠️  GrantFox sync failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  result.success = true;
  return result;
}
