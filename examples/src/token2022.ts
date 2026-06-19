/**
 * Token-2022 transfer-fee accounting (pure math).
 *
 * Some Token-2022 mints charge a transfer fee, so the RECIPIENT receives LESS than the
 * sender sent. If you quote "pay 10 USDC*" and the mint skims a fee, your on-chain
 * verification of "did I receive 10?" fails — or worse, silently under-credits.
 *
 * Read the live fee from the mint with `getTransferFeeConfig(getMint(conn, mint, ..., TOKEN_2022_PROGRAM_ID))`,
 * then use these helpers to quote correctly. fee = min(amount * bps / 10000, maximumFee).
 */
export interface TransferFee {
  feeBasisPoints: number; // e.g. 50 = 0.5%
  maximumFee: bigint; // absolute cap, in base units
}

/** Fee charged on a transfer of `amount` base units. */
export function transferFeeFor(amount: bigint, fee: TransferFee): bigint {
  if (amount < 0n) throw new Error('amount must be >= 0');
  if (fee.feeBasisPoints < 0 || fee.feeBasisPoints > 10_000) throw new Error('bps out of range');
  const raw = (amount * BigInt(fee.feeBasisPoints)) / 10_000n;
  return raw < fee.maximumFee ? raw : fee.maximumFee;
}

/** What the recipient actually receives when the sender sends `amount`. */
export function netAfterFee(amount: bigint, fee: TransferFee): bigint {
  return amount - transferFeeFor(amount, fee);
}

/**
 * Smallest gross amount the sender must send so the recipient nets at least `target`.
 * Use this to gross-up an invoice on a fee-bearing mint. Verified against `netAfterFee`.
 */
export function grossUpForNet(target: bigint, fee: TransferFee): bigint {
  if (target < 0n) throw new Error('target must be >= 0');
  if (fee.feeBasisPoints === 0) return target;

  const denom = 10_000n - BigInt(fee.feeBasisPoints);
  // ceil(target * 10000 / (10000 - bps)) — uncapped estimate
  let gross = (target * 10_000n + denom - 1n) / denom;

  // If the uncapped fee would exceed the cap, the real fee is just `maximumFee`.
  if (transferFeeFor(gross, fee) >= fee.maximumFee) {
    gross = target + fee.maximumFee;
  }
  // Guard against off-by-one from integer division.
  while (netAfterFee(gross, fee) < target) gross += 1n;
  return gross;
}
