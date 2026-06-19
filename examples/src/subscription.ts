/**
 * Delegate-based recurring subscriptions.
 *
 * Demonstrates the RECUR layer of solana-payments-skill:
 *  - the customer approves a BOUNDED delegate once (`approveChecked`, capped)
 *  - a relayer (or, better, an on-chain program) pulls one period's charge
 *  - each charge is idempotent per (subscription, period)
 *  - `revoke` cancels the authorization
 *
 * Safety: never approve an unlimited amount. For production, enforce cadence on-chain
 * (see examples/subscription-program). A bare SPL delegate has no concept of time.
 */
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createApproveCheckedInstruction,
  createTransferCheckedInstruction,
  createRevokeInstruction,
} from '@solana/spl-token';

export const USDC_DECIMALS = 6;

/**
 * Cadence check (pure). True if a period has elapsed since the last charge.
 * `lastChargedUnix === 0` means "never charged" → first charge allowed.
 * Mirrors the on-chain program's rule so off-chain and on-chain agree.
 */
export function canChargeNow(lastChargedUnix: number, periodSecs: number, nowUnix: number): boolean {
  if (periodSecs <= 0) throw new Error('periodSecs must be > 0');
  if (lastChargedUnix === 0) return true;
  return nowUnix >= lastChargedUnix + periodSecs;
}

/** Cap check (pure). True if charging `amount` keeps cumulative pulls within the approved cap. */
export function withinCap(chargedSoFar: bigint, amount: bigint, cap: bigint): boolean {
  return chargedSoFar + amount <= cap;
}

/** Step 1: customer approves the delegate for a CAPPED amount (signs once). */
export async function buildApproveIx(opts: {
  customer: PublicKey; // token owner + signer
  delegate: PublicKey; // relayer key OR program PDA
  mint: PublicKey;
  cap: bigint; // e.g. 3 cycles of 25 USDC = 75_000_000n — NEVER unlimited
  decimals?: number;
}): Promise<TransactionInstruction> {
  const customerAta = await getAssociatedTokenAddress(opts.mint, opts.customer);
  return createApproveCheckedInstruction(
    customerAta,
    opts.mint,
    opts.delegate,
    opts.customer,
    opts.cap,
    opts.decimals ?? USDC_DECIMALS,
  );
}

/** Step 2: pull one period's charge. The delegate signs; SPL decrements the remaining allowance. */
export async function buildRecurringChargeIx(opts: {
  customer: PublicKey;
  merchant: PublicKey;
  delegate: PublicKey; // the approved delegate (also the signer)
  mint: PublicKey;
  amount: bigint; // one period; cumulative pulls must stay <= cap
  decimals?: number;
}): Promise<TransactionInstruction> {
  const source = await getAssociatedTokenAddress(opts.mint, opts.customer);
  const dest = await getAssociatedTokenAddress(opts.mint, opts.merchant);
  return createTransferCheckedInstruction(
    source,
    opts.mint,
    dest,
    opts.delegate,
    opts.amount,
    opts.decimals ?? USDC_DECIMALS,
  );
}

/** Cancellation: revoke the delegate so no further pulls are possible. */
export async function buildRevokeIx(
  customer: PublicKey,
  mint: PublicKey,
): Promise<TransactionInstruction> {
  const ata = await getAssociatedTokenAddress(mint, customer);
  return createRevokeInstruction(ata, customer);
}

/** Idempotent scheduler skeleton — never charge a (subscription, period) twice. */
export interface ChargeStore {
  alreadyCharged(subscriptionId: string, period: string): Promise<boolean>;
  recordCharge(subscriptionId: string, period: string, signature: string): Promise<void>;
}

export interface Subscription {
  id: string;
  customer: PublicKey;
  merchant: PublicKey;
  delegate: PublicKey;
  mint: PublicKey;
  amount: bigint;
}

export async function runBillingCycle(
  store: ChargeStore,
  subs: Subscription[],
  period: string,
  chargeOnce: (sub: Subscription, period: string) => Promise<string>,
): Promise<void> {
  for (const sub of subs) {
    if (await store.alreadyCharged(sub.id, period)) continue; // idempotent per period
    const signature = await chargeOnce(sub, period); // build → land (solana-tx-skill) → verify
    await store.recordCharge(sub.id, period, signature);
  }
}
