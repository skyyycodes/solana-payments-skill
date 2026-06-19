import { describe, it, expect } from 'vitest';
import { transferFeeFor, netAfterFee, grossUpForNet, type TransferFee } from '../src/token2022';

const fee = (bps: number, max: bigint): TransferFee => ({ feeBasisPoints: bps, maximumFee: max });

describe('Token-2022 transfer-fee accounting', () => {
  it('charges bps below the cap', () => {
    expect(transferFeeFor(100_000_000n, fee(50, 1_000_000_000n))).toBe(500_000n); // 0.5%
  });

  it('clamps the fee at the maximum', () => {
    expect(transferFeeFor(100_000_000n, fee(50, 100_000n))).toBe(100_000n);
  });

  it('recipient nets amount minus fee', () => {
    expect(netAfterFee(100_000_000n, fee(50, 1_000_000_000n))).toBe(99_500_000n);
  });

  it('grosses up so the recipient nets at least the target (uncapped)', () => {
    const f = fee(50, 1_000_000_000n);
    const gross = grossUpForNet(100_000_000n, f);
    expect(netAfterFee(gross, f)).toBeGreaterThanOrEqual(100_000_000n);
  });

  it('grosses up correctly when the fee is capped', () => {
    const f = fee(50, 100_000n);
    const gross = grossUpForNet(100_000_000n, f);
    expect(netAfterFee(gross, f)).toBeGreaterThanOrEqual(100_000_000n);
    expect(gross).toBe(100_100_000n); // target + capped fee
  });

  it('no gross-up needed for a zero-fee mint', () => {
    expect(grossUpForNet(42n, fee(0, 0n))).toBe(42n);
  });
});
