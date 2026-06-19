import { describe, it, expect } from 'vitest';
import { toBaseUnits } from '../src/checkout';
import { computeSplit } from '../src/marketplace';

describe('toBaseUnits — integer money math (no floats)', () => {
  it('converts whole and fractional amounts', () => {
    expect(toBaseUnits('25.00', 6)).toBe(25_000_000n);
    expect(toBaseUnits('1', 6)).toBe(1_000_000n);
    expect(toBaseUnits('0.000001', 6)).toBe(1n);
    expect(toBaseUnits('0', 6)).toBe(0n);
  });

  it('truncates beyond the mint decimals (does not round up silently)', () => {
    expect(toBaseUnits('1.2345678', 6)).toBe(1_234_567n);
  });

  it('handles large amounts without precision loss', () => {
    expect(toBaseUnits('1000000.50', 6)).toBe(1_000_000_500_000n);
  });
});

describe('computeSplit — fee math, remainder to seller', () => {
  it('splits a fee in basis points', () => {
    expect(computeSplit(100_000_000n, 250)).toEqual({ fee: 2_500_000n, sellerAmount: 97_500_000n });
  });

  it('gives the rounding remainder to the seller (no value lost)', () => {
    const { fee, sellerAmount } = computeSplit(1_001n, 250); // 2.5% of 1001 = 25.025 → floor 25
    expect(fee).toBe(25n);
    expect(sellerAmount).toBe(976n);
    expect(fee + sellerAmount).toBe(1_001n);
  });

  it('zero fee gives everything to the seller', () => {
    expect(computeSplit(500n, 0)).toEqual({ fee: 0n, sellerAmount: 500n });
  });

  it('rejects out-of-range bps', () => {
    expect(() => computeSplit(1n, 10_001)).toThrow();
    expect(() => computeSplit(1n, -1)).toThrow();
  });
});
