/**
 * Reference implementation of the solana-tx-skill "golden path" using @solana/web3.js (classic).
 *
 * This file is type-checked in CI (`npm run typecheck`) against the real @solana/web3.js,
 * so the patterns in skill/priority-fees.md, skill/compute-budget.md and
 * skill/send-and-confirm.md are proven to compile, not just described.
 *
 * Layers:
 *   1. priority fee   -> estimateCuPrice()
 *   2. compute budget -> buildWithBudget()
 *   3. send/confirm   -> sendAndConfirm() + sendWithRetries()
 */
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Signer,
  TransactionConfirmationStatus,
  TransactionInstruction,
  TransactionMessage,
  TransactionSignature,
  VersionedTransaction,
} from '@solana/web3.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const COMMITMENT_RANK = { processed: 1, confirmed: 2, finalized: 3 } as const;

/** True once the observed confirmation status is at least as strong as the target commitment. */
function meetsCommitment(
  cs: TransactionConfirmationStatus | null | undefined,
  target: 'processed' | 'confirmed' | 'finalized',
): boolean {
  if (!cs) return false;
  return COMMITMENT_RANK[cs] >= COMMITMENT_RANK[target];
}

/** Raised when a transaction's blockhash expires before it confirms. Caller should rebuild + retry. */
export class BlockhashExpiredError extends Error {
  constructor(public signature: string) {
    super(`Blockhash expired before confirmation (sig ${signature})`);
    this.name = 'BlockhashExpiredError';
  }
}

const FEE_FLOOR = 10_000; // micro-lamports / CU
const FEE_CEILING = 2_000_000;

/**
 * Layer 1 - estimate a dynamic, account-aware CU price from recent network data.
 * Always clamped to [floor, ceiling] with a fallback.
 */
export async function estimateCuPrice(
  connection: Connection,
  writableAccounts: PublicKey[],
  percentile = 0.75,
): Promise<number> {
  const recent = await connection.getRecentPrioritizationFees({
    lockedWritableAccounts: writableAccounts,
  });

  const fees = recent
    .map((r) => r.prioritizationFee)
    .filter((f) => f > 0)
    .sort((a, b) => a - b);

  if (fees.length === 0) return FEE_FLOOR;

  const idx = Math.min(fees.length - 1, Math.floor(fees.length * percentile));
  return Math.min(Math.max(fees[idx], FEE_FLOOR), FEE_CEILING);
}

/**
 * Layer 2 - simulate to measure compute units, then build a v0 transaction with a tight
 * CU limit (+10% margin) and the given CU price. Budget instructions are placed first.
 */
export async function buildWithBudget(
  connection: Connection,
  payer: PublicKey,
  instructions: TransactionInstruction[],
  microLamports: number,
): Promise<{ tx: VersionedTransaction; lastValidBlockHeight: number }> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');

  // Simulate with a max limit + the price ix to read real consumption.
  const simIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
    ...instructions,
  ];
  const simMsg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: simIxs,
  }).compileToV0Message();

  const sim = await connection.simulateTransaction(new VersionedTransaction(simMsg), {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });

  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).join('\n');
    throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}\n${logs}`);
  }

  const consumed = sim.value.unitsConsumed ?? 200_000;
  const units = Math.min(Math.ceil(consumed * 1.1), 1_400_000);

  const finalIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
    ...instructions,
  ];
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: finalIxs,
  }).compileToV0Message();

  return { tx: new VersionedTransaction(msg), lastValidBlockHeight };
}

export interface SendOptions {
  commitment?: 'processed' | 'confirmed' | 'finalized';
  rebroadcastIntervalMs?: number;
}

/**
 * Layer 3 - send a signed tx and rebroadcast on an interval until confirmed or expired.
 * Bounded by lastValidBlockHeight (never loops forever). Resending identical bytes is idempotent.
 */
export async function sendAndConfirm(
  connection: Connection,
  signedTx: VersionedTransaction,
  lastValidBlockHeight: number,
  opts: SendOptions = {},
): Promise<TransactionSignature> {
  const commitment = opts.commitment ?? 'confirmed';
  const interval = opts.rebroadcastIntervalMs ?? 2000;
  const raw = signedTx.serialize();

  const signature = await connection.sendRawTransaction(raw, {
    skipPreflight: true,
    maxRetries: 0,
  });

  const controller = new AbortController();

  // Rebroadcast loop - cancelled once the poller resolves.
  const rebroadcast = (async () => {
    while (!controller.signal.aborted) {
      await sleep(interval);
      if (controller.signal.aborted) break;
      try {
        await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
      } catch {
        /* transient send errors are fine; the poller decides success/failure */
      }
    }
  })();

  try {
    while (true) {
      const { value } = await connection.getSignatureStatuses([signature]);
      const status = value[0];
      if (status) {
        if (status.err) {
          throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
        }
        if (meetsCommitment(status.confirmationStatus, commitment)) {
          return signature;
        }
      }

      await sleep(interval);

      const height = await connection.getBlockHeight(commitment);
      if (height > lastValidBlockHeight) {
        throw new BlockhashExpiredError(signature);
      }
    }
  } finally {
    controller.abort();
    await rebroadcast.catch(() => undefined);
  }
}

/**
 * Full golden path with idempotent retries: rebuild with a fresh blockhash and an
 * escalated fee on expiry; never retry an on-chain failure.
 */
export async function sendWithRetries(
  connection: Connection,
  payer: PublicKey,
  signers: Signer[],
  instructions: TransactionInstruction[],
  writableAccounts: PublicKey[],
  maxAttempts = 4,
): Promise<TransactionSignature> {
  const base = await estimateCuPrice(connection, writableAccounts);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const microLamports = Math.min(Math.ceil(base * (1 + 0.25 * attempt)), FEE_CEILING);
    const { tx, lastValidBlockHeight } = await buildWithBudget(
      connection,
      payer,
      instructions,
      microLamports,
    );
    tx.sign(signers);

    try {
      return await sendAndConfirm(connection, tx, lastValidBlockHeight, {
        commitment: 'confirmed',
      });
    } catch (e) {
      if (e instanceof BlockhashExpiredError && attempt < maxAttempts - 1) {
        continue; // delivery problem -> rebuild with new blockhash + higher fee
      }
      throw e; // on-chain error or out of attempts -> surface it
    }
  }
  throw new Error('Exhausted retries without confirmation');
}
