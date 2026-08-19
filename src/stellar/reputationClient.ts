/**
 * Stellar Reputation Contract Client
 *
 * Calls the on-chain reputation contract to award FoxPoints
 * whenever a contribution is confirmed by a GitHub webhook event.
 */

import {
  Keypair,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  nativeToScVal,
  Address,
  Networks,
  xdr,
} from "@stellar/stellar-sdk";
import { config } from "../config.js";
import { getBandPrice } from "../oracle/bandOracle.js";

const server = new SorobanRpc.Server(config.STELLAR_RPC_URL, {
  allowHttp: false,
});

const networkPassphrase =
  config.STELLAR_NETWORK === "mainnet"
    ? Networks.PUBLIC
    : Networks.TESTNET;

/**
 * Award FoxPoints to a contributor on-chain.
 *
 * @param stellarAddress - The contributor's Stellar public key
 * @param points - Number of FoxPoints to award
 * @returns Transaction hash of the submitted transaction
 */
export async function awardFoxPoints(
  stellarAddress: string,
  points: number
): Promise<string> {
  if (!config.REPUTATION_CONTRACT_ID) {
    console.warn("REPUTATION_CONTRACT_ID not set — skipping on-chain points award");
    return "skipped";
  }

  const operatorKeypair = Keypair.fromSecret(config.STELLAR_OPERATOR_SECRET);
  const operatorAddress = operatorKeypair.publicKey();

  const account = await server.getAccount(operatorAddress);
  const contract = new Contract(config.REPUTATION_CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        "award_points",
        new Address(operatorAddress).toScVal(),          // operator
        new Address(stellarAddress).toScVal(),           // contributor
        nativeToScVal(BigInt(points), { type: "u64" })   // points
      )
    )
    .setTimeout(30)
    .build();

  // Simulate to get footprint + fee
  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simResult).build();
  prepared.sign(operatorKeypair);

  const sendResult = await server.sendTransaction(prepared);
  if (sendResult.status === "ERROR") {
    throw new Error(`Transaction error: ${JSON.stringify(sendResult.errorResult)}`);
  }

  // Poll for confirmation
  let getResult = await server.getTransaction(sendResult.hash);
  let attempts = 0;
  while (
    getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
    attempts < 20
  ) {
    await new Promise((r) => setTimeout(r, 1500));
    getResult = await server.getTransaction(sendResult.hash);
    attempts++;
  }

  if (getResult.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction did not succeed: ${getResult.status}`);
  }

  // Notify configured webhook about the successful award (non-blocking, errors logged)
  if (config.FOXPOINTS_AWARD_WEBHOOK_URL) {
    try {
      // Enrich payload with a Band Protocol price (best-effort)
      let price: number | null = null;
      try {
        price = await getBandPrice(config.BAND_PRICE_SYMBOL);
      } catch (err) {
        // don't fail the award if price lookup fails
        console.warn("Band price lookup failed:", err);
      }

      const payload: Record<string, unknown> = {
        txHash: sendResult.hash,
        stellarAddress,
        points,
      };
      if (price != null) {
        payload["price"] = price;
        payload["priceSymbol"] = config.BAND_PRICE_SYMBOL;
      }

      await fetch(config.FOXPOINTS_AWARD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("📣 FoxPoints award webhook sent");
    } catch (err) {
      console.error("Failed to send FoxPoints award webhook:", err);
    }
  }

  return sendResult.hash;
}

/**
 * Record a rejection on-chain (quality signal, no points deducted).
 */
export async function recordRejection(stellarAddress: string): Promise<string> {
  if (!config.REPUTATION_CONTRACT_ID) return "skipped";

  const operatorKeypair = Keypair.fromSecret(config.STELLAR_OPERATOR_SECRET);
  const account = await server.getAccount(operatorKeypair.publicKey());
  const contract = new Contract(config.REPUTATION_CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        "record_rejection",
        new Address(operatorKeypair.publicKey()).toScVal(),
        new Address(stellarAddress).toScVal()
      )
    )
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simResult).build();
  prepared.sign(operatorKeypair);

  const sendResult = await server.sendTransaction(prepared);
  return sendResult.hash;
}
