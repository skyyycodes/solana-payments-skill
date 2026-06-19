/**
 * One-time receiving addresses — recipient unlinkability.
 *
 * Solana is a public ledger: if every customer pays the same merchant wallet, anyone can
 * see your full revenue and link all your customers. Giving each order a FRESH receiving
 * address means an outside observer can't trivially tie payments together or to a known
 * merchant identity. You later sweep the funds to your treasury.
 *
 * Honest limits (read private-send.md): the sweep itself eventually links the one-time
 * addresses to your treasury on-chain, and amounts/timing stay public. For amount privacy
 * use Token-2022 Confidential Transfers. This gives unlinkability at rest, not anonymity.
 *
 * Pairs with gasless-relayer.ts: the one-time address holds no SOL, so the sweep's fee is
 * paid by your relayer (fee payer), and the one-time address only signs moving its own USDC.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  TokenAccountNotFoundError,
} from '@solana/spl-token';
import { USDC_DECIMALS } from './checkout';

/** A fresh receiving identity for a single order. Persist the secret securely (KMS), keyed by orderId. */
export function newReceivingAddress(): Keypair {
  return Keypair.generate();
}

/** The token account that receives this order's USDC (the address the customer pays). */
export function receivingAtaFor(address: PublicKey, mint: PublicKey): Promise<PublicKey> {
  return getAssociatedTokenAddress(mint, address);
}

/**
 * Sweep a one-time address's full received amount to the treasury.
 * `feePayer` (your relayer) pays fees + any treasury-ATA rent; the one-time address signs
 * only the transfer of its own tokens.
 */
export async function buildSweepToTreasury(
  connection: Connection,
  oneTime: PublicKey,
  treasury: PublicKey,
  mint: PublicKey,
  amount: bigint,
  feePayer: PublicKey,
  decimals: number = USDC_DECIMALS,
): Promise<TransactionInstruction[]> {
  const source = await getAssociatedTokenAddress(mint, oneTime);
  const dest = await getAssociatedTokenAddress(mint, treasury);
  const ixs: TransactionInstruction[] = [];

  try {
    await getAccount(connection, dest);
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) {
      ixs.push(createAssociatedTokenAccountInstruction(feePayer, dest, treasury, mint));
    } else {
      throw e;
    }
  }

  // authority = the one-time address (it must co-sign); feePayer covers the lamports.
  ixs.push(createTransferCheckedInstruction(source, mint, dest, oneTime, amount, decimals));
  return ixs;
}

/** Idempotent sweep tracking — never sweep the same order's address twice. */
export interface SweepStore {
  alreadySwept(orderId: string): Promise<boolean>;
  recordSweep(orderId: string, signature: string): Promise<void>;
}

export async function sweepOrderOnce(
  store: SweepStore,
  orderId: string,
  doSweep: () => Promise<string>,
): Promise<string | null> {
  if (await store.alreadySwept(orderId)) return null;
  const signature = await doSweep(); // build (above) → co-sign (gasless) → land (delivery layer)
  await store.recordSweep(orderId, signature);
  return signature;
}
