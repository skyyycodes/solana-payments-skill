/**
 * The verification gate — the most important code in any payment system.
 *
 * Demonstrates the SETTLE layer of solana-payments-skill:
 *  1. find the payment on-chain by its reference
 *  2. validate it matches EXACTLY (recipient + amount + mint + reference)
 *  3. credit the order IDEMPOTENTLY (never double-credit)
 *  4. gate irreversible actions on the right finality
 *
 * Never credit an order from a client-side "success" callback.
 */
import { findReference, validateTransfer, FindReferenceError } from '@solana/pay';
import { Connection, PublicKey, type Finality } from '@solana/web3.js';
import BigNumber from 'bignumber.js';

/** Minimal idempotent store. `insertIfAbsent` returns false if the signature was already recorded. */
export interface PaymentStore {
  insertIfAbsent(record: { signature: string; orderId: string; amount: string }): Promise<boolean>;
  markPaid(orderId: string, signature: string): Promise<void>;
}

export interface ExpectedPayment {
  orderId: string;
  recipient: PublicKey;
  amountHuman: string;
  mint: PublicKey;
  reference: PublicKey;
}

export type VerifyResult =
  | { status: 'credited'; signature: string }
  | { status: 'already-processed'; signature: string }
  | { status: 'pending' };

/**
 * Find → validate → credit (idempotent). Returns 'pending' if the payment hasn't landed yet.
 * `finality` should be 'finalized' before releasing anything irreversible.
 */
export async function verifyAndCredit(
  connection: Connection,
  store: PaymentStore,
  expected: ExpectedPayment,
  finality: Finality = 'confirmed',
): Promise<VerifyResult> {
  // 1. Find the payment by reference.
  let signature: string;
  try {
    const info = await findReference(connection, expected.reference, { finality });
    signature = info.signature;
  } catch (e) {
    if (e instanceof FindReferenceError) return { status: 'pending' };
    throw e;
  }

  // 2. Validate it matches EXACTLY (throws on any mismatch).
  await validateTransfer(
    connection,
    signature,
    {
      recipient: expected.recipient,
      amount: new BigNumber(expected.amountHuman),
      splToken: expected.mint,
      reference: expected.reference,
    },
    { commitment: finality },
  );

  // 3. Credit idempotently — the unique signature guards against double-credit.
  const inserted = await store.insertIfAbsent({
    signature,
    orderId: expected.orderId,
    amount: expected.amountHuman,
  });
  if (!inserted) return { status: 'already-processed', signature };

  await store.markPaid(expected.orderId, signature);
  return { status: 'credited', signature };
}

/** Poll until the payment is verified, or the timeout elapses. */
export async function waitForPayment(
  connection: Connection,
  store: PaymentStore,
  expected: ExpectedPayment,
  opts: { finality?: Finality; timeoutMs?: number; intervalMs?: number } = {},
): Promise<VerifyResult> {
  const finality = opts.finality ?? 'confirmed';
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  const interval = opts.intervalMs ?? 1500;

  while (Date.now() < deadline) {
    const result = await verifyAndCredit(connection, store, expected, finality);
    if (result.status !== 'pending') return result;
    await new Promise((r) => setTimeout(r, interval));
  }
  return { status: 'pending' };
}
