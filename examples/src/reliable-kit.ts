/**
 * Reference implementation of the solana-tx-skill "golden path" using @solana/kit (modern).
 *
 * Type-checked in CI against the real @solana/kit + @solana-program/compute-budget, proving
 * the patterns in skill/kit-vs-web3js.md and skill/compute-budget.md compile on the modern stack.
 */
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  estimateComputeUnitLimitFactory,
  getSignatureFromTransaction,
  pipe,
  prependTransactionMessageInstructions,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
} from '@solana/kit';
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';

const FEE_FLOOR = 10_000n;
const FEE_CEILING = 2_000_000n;

/** Layer 1 - dynamic, account-aware CU price (micro-lamports/CU), clamped with fallback. */
export async function estimateCuPrice(
  rpc: Rpc<SolanaRpcApi>,
  writableAccounts: Address[],
  percentile = 0.75,
): Promise<bigint> {
  const recent = await rpc.getRecentPrioritizationFees(writableAccounts).send();

  const fees = recent
    .map((r) => r.prioritizationFee)
    .filter((f) => f > 0n)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  if (fees.length === 0) return FEE_FLOOR;

  const idx = Math.min(fees.length - 1, Math.floor(fees.length * percentile));
  const estimate = fees[idx];
  return estimate < FEE_FLOOR ? FEE_FLOOR : estimate > FEE_CEILING ? FEE_CEILING : estimate;
}

/**
 * Layers 1-3 - build (with dynamic fee + simulated CU limit), sign, send and confirm.
 * Kit's sendAndConfirmTransactionFactory handles the confirmation/expiry strategy.
 */
export async function sendReliably(
  rpcUrl: string,
  rpcWsUrl: string,
  feePayer: TransactionSigner,
  instructions: Instruction[],
  writableAccounts: Address[],
): Promise<string> {
  const rpc = createSolanaRpc(rpcUrl);
  const rpcSubscriptions = createSolanaRpcSubscriptions(rpcWsUrl);

  const microLamports = await estimateCuPrice(rpc, writableAccounts);
  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash({ commitment: 'confirmed' })
    .send();

  // Base message (no budget ixs yet) - used to estimate compute units.
  const base = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );

  // Layer 2 - simulate to size the CU limit.
  const estimateComputeUnitLimit = estimateComputeUnitLimitFactory({ rpc });
  const consumed = await estimateComputeUnitLimit(base);
  const units = Math.min(Math.ceil(consumed * 1.1), 1_400_000);

  // Prepend budget instructions.
  const withBudget = prependTransactionMessageInstructions(
    [
      getSetComputeUnitLimitInstruction({ units }),
      getSetComputeUnitPriceInstruction({ microLamports }),
    ],
    base,
  );

  const signedTx = await signTransactionMessageWithSigners(withBudget);
  const signature = getSignatureFromTransaction(signedTx);

  // Narrow the lifetime to a blockhash (with lastValidBlockHeight) so the confirmer can
  // bound its wait by blockhash expiry.
  assertIsTransactionWithBlockhashLifetime(signedTx);

  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  await sendAndConfirm(signedTx, { commitment: 'confirmed', skipPreflight: true });

  return signature;
}
