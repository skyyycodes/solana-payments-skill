/**
 * Gasless USDC payments — the customer pays in USDC with NO SOL of their own.
 *
 * The hard problem: every Solana transaction needs a fee payer with SOL. A customer
 * who only holds USDC literally cannot submit a payment. The fix is fee abstraction:
 * YOUR relayer is the fee payer and co-signs; the customer only signs the USDC transfer.
 *
 * Security model (read this):
 *  - The relayer is the FEE PAYER only. It never gains authority over the customer's funds.
 *  - The customer signs a transaction that moves THEIR USDC to YOUR recipient — nothing else.
 *  - The relayer MUST inspect the transaction before co-signing (see assertSafeToSponsor)
 *    so it can't be tricked into paying fees for arbitrary/abusive instructions.
 *
 * Flow:
 *   server: build (fee payer = relayer) → relayer signs → send message to client
 *   client: customer signs the same message → return
 *   server: assert it's still the intended transfer → send via the reliable delivery layer
 */
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { buildUsdcTransferIxs, USDC_DECIMALS } from './checkout';

export interface SponsorRequest {
  customer: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  amount: bigint;
  reference: PublicKey;
}

/** Server step 1: build the transfer with the RELAYER as fee payer, and relayer-sign it. */
export async function buildSponsoredTransfer(
  connection: Connection,
  relayer: Keypair,
  req: SponsorRequest,
): Promise<{ partiallySigned: string }> {
  // ATA creation (if needed) is paid by the relayer too — that's part of sponsoring.
  const ixs = await buildUsdcTransferIxs(
    connection,
    relayer.publicKey, // payer for any ATA rent
    req.customer, // the token owner / sender
    req.recipient,
    req.mint,
    req.amount,
    USDC_DECIMALS,
  );
  ixs[ixs.length - 1].keys.push({ pubkey: req.reference, isSigner: false, isWritable: false });

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: relayer.publicKey, // RELAYER pays the fee
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([relayer]); // relayer fills its (fee-payer) signature slot; customer slot stays empty
  return { partiallySigned: Buffer.from(tx.serialize()).toString('base64') };
}

/** Client step: the customer signs the SAME transaction (only their USDC transfer authority). */
export function customerSign(partiallySigned: string, customer: Keypair): string {
  const tx = VersionedTransaction.deserialize(Buffer.from(partiallySigned, 'base64'));
  tx.sign([customer]); // fills the customer's signature slot
  return Buffer.from(tx.serialize()).toString('base64');
}

/**
 * Server step 2: re-derive what we EXPECT and assert the returned tx still matches before
 * sending. Never blindly co-sign/relay a transaction a client handed back.
 */
export function assertSafeToSponsor(
  fullySigned: string,
  expect: { relayer: PublicKey; instructionCount: number },
): VersionedTransaction {
  const tx = VersionedTransaction.deserialize(Buffer.from(fullySigned, 'base64'));
  const keys = tx.message.staticAccountKeys;

  // Fee payer must still be our relayer (index 0), not swapped out.
  if (!keys[0]?.equals(expect.relayer)) {
    throw new Error('Fee payer is not the relayer — refusing to sponsor');
  }
  // Instruction set must match what we built (no extra instructions injected).
  if (tx.message.compiledInstructions.length !== expect.instructionCount) {
    throw new Error('Instruction count changed — refusing to sponsor');
  }
  // Both signatures must be present (relayer + customer), none zeroed.
  const unsigned = tx.signatures.some((s) => s.every((b) => b === 0));
  if (unsigned) throw new Error('Transaction is not fully signed');
  return tx;
}

/**
 * Send the fully-signed transaction. Delegate the actual landing (priority fee, CU,
 * rebroadcast/confirm loop) to the bundled delivery layer — see skill/send-and-confirm.md
 * and examples/src/reliable-web3js.ts.
 */
export async function sendSponsored(
  connection: Connection,
  fullySigned: string,
  expect: { relayer: PublicKey; instructionCount: number },
): Promise<string> {
  const tx = assertSafeToSponsor(fullySigned, expect);
  // Replace with the reliable sender from the delivery layer for production:
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  return sig;
}
