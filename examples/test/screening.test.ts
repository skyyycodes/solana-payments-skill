import { describe, it, expect, vi } from 'vitest';
import { screen, screenAndRecord, type ScreenInput } from '../src/screening';

const base: Omit<ScreenInput, 'wallet'> = {
  amountBaseUnits: 10_000_000n,
  denyList: new Set<string>(['BAD111']),
};

describe('screen', () => {
  it('blocks a sanctioned/denied wallet', () => {
    expect(screen({ ...base, wallet: 'BAD111' })).toEqual({
      decision: 'block',
      reasons: ['wallet on sanctions/deny list'],
    });
  });

  it('allows a clean wallet within limits', () => {
    const r = screen({ ...base, wallet: 'GOOD1' });
    expect(r.decision).toBe('allow');
  });

  it('flags for review when velocity limits are exceeded', () => {
    const r = screen({
      ...base,
      wallet: 'GOOD1',
      velocity: { count: 10, totalBaseUnits: 0n },
      limits: { maxCount: 10, maxTotalBaseUnits: 1_000_000_000n },
    });
    expect(r.decision).toBe('review');
    expect(r.reasons.join()).toMatch(/count/);
  });
});

describe('screenAndRecord', () => {
  it('records every decision and only proceeds on allow', async () => {
    const record = vi.fn(async () => {});
    const proceed = vi.fn(async () => {});

    await screenAndRecord({ ...base, wallet: 'BAD111' }, record, proceed);
    expect(record).toHaveBeenCalledTimes(1);
    expect(proceed).not.toHaveBeenCalled();

    await screenAndRecord({ ...base, wallet: 'GOOD1' }, record, proceed);
    expect(record).toHaveBeenCalledTimes(2);
    expect(proceed).toHaveBeenCalledTimes(1);
  });
});
