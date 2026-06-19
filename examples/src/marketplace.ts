/**
 * Marketplace fee splits — atomic multi-party payout math + instructions.
 *
 * The money rule: compute the fee in integer base units, then give the REMAINDER to the
 * seller so nothing is lost to rounding. Both transfers go in ONE transaction so they
 * settle together (no "platform paid but seller didn't").
 */
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import { USDC_DECIMALS } from './checkout';

export interface Split {
  fee: bigint;
  sellerAmount: bigint;
}

/** Pure fee math. feeBps = basis points (250 = 2.5%). Remainder always goes to the seller. */
export function computeSplit(total: bigint, feeBps: number): Split {
  if (total < 0n) throw new Error('total must be >= 0');
  if (feeBps < 0 || feeBps > 10_000) throw new Error('feeBps must be 0..10000');
  const fee = (total * BigInt(feeBps)) / 10_000n; // integer math, floor
  return { fee, sellerAmount: total - fee };
}

/** Build the two transfers (seller payout + platform fee) for one atomic transaction. */
export async function buildSplitTransferIxs(opts: {
  buyer: PublicKey;
  seller: PublicKey;
  platform: PublicKey;
  mint: PublicKey;
  total: bigint;
  feeBps: number;
  decimals?: number;
}): Promise<TransactionInstruction[]> {
  const decimals = opts.decimals ?? USDC_DECIMALS;
  const { fee, sellerAmount } = computeSplit(opts.total, opts.feeBps);

  const buyerAta = await getAssociatedTokenAddress(opts.mint, opts.buyer);
  const sellerAta = await getAssociatedTokenAddress(opts.mint, opts.seller);
  const platformAta = await getAssociatedTokenAddress(opts.mint, opts.platform);

  const ixs: TransactionInstruction[] = [
    createTransferCheckedInstruction(buyerAta, opts.mint, sellerAta, opts.buyer, sellerAmount, decimals),
  ];
  if (fee > 0n) {
    ixs.push(
      createTransferCheckedInstruction(buyerAta, opts.mint, platformAta, opts.buyer, fee, decimals),
    );
  }
  return ixs;
}
