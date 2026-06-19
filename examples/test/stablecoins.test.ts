import { describe, it, expect } from 'vitest';
import { getStablecoin, getMintAddress, STABLECOINS } from '../src/stablecoins';

describe('stablecoin registry', () => {
  it('resolves verified USDC mints per cluster', () => {
    expect(getMintAddress('USDC', 'mainnet')).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(getMintAddress('usdc', 'devnet')).toBe('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  });

  it('flags non-USDC coins as needing issuer verification', () => {
    expect(getStablecoin('PYUSD').selfVerifyRequired).toBe(true);
    expect(getStablecoin('USDC').selfVerifyRequired).toBe(false);
  });

  it('knows PYUSD is a Token-2022 mint', () => {
    expect(getStablecoin('PYUSD').program).toBe('token-2022');
  });

  it('refuses to guess a mint that is not pinned (safe failure)', () => {
    expect(() => getMintAddress('USDe', 'mainnet')).toThrow(/Confirm it from the issuer/);
    expect(() => getMintAddress('USDC', 'mainnet' as never)).not.toThrow();
  });

  it('rejects unknown symbols', () => {
    expect(() => getStablecoin('NOPE')).toThrow(/Unknown stablecoin/);
    expect(Object.keys(STABLECOINS)).toContain('EURC');
  });
});
