import { describe, it, expect, vi } from 'vitest';
import {
  canChargeNow,
  withinCap,
  runBillingCycle,
  type ChargeStore,
  type Subscription,
} from '../src/subscription';
import { PublicKey } from '@solana/web3.js';

describe('canChargeNow — cadence', () => {
  const DAY = 86_400;
  it('allows the first charge (lastCharged = 0)', () => {
    expect(canChargeNow(0, 30 * DAY, 1_000)).toBe(true);
  });
  it('blocks a second charge within the same period', () => {
    const now = 1_000_000;
    expect(canChargeNow(now, 30 * DAY, now + DAY)).toBe(false);
  });
  it('allows the next charge once the period has elapsed', () => {
    const last = 1_000_000;
    expect(canChargeNow(last, 30 * DAY, last + 30 * DAY)).toBe(true);
  });
  it('rejects a non-positive period', () => {
    expect(() => canChargeNow(0, 0, 1)).toThrow();
  });
});

describe('withinCap — bounded approval', () => {
  it('permits charges up to the cap and rejects beyond it', () => {
    expect(withinCap(50_000_000n, 25_000_000n, 75_000_000n)).toBe(true); // exactly cap
    expect(withinCap(75_000_000n, 1n, 75_000_000n)).toBe(false); // over cap
  });
});

describe('runBillingCycle — idempotent per (subscription, period)', () => {
  function memoryStore() {
    const charged = new Set<string>();
    const store: ChargeStore = {
      alreadyCharged: async (id, period) => charged.has(`${id}:${period}`),
      recordCharge: async (id, period) => { charged.add(`${id}:${period}`); },
    };
    return store;
  }

  const sub: Subscription = {
    id: 'sub_1',
    customer: PublicKey.default,
    merchant: PublicKey.default,
    delegate: PublicKey.default,
    mint: PublicKey.default,
    amount: 25_000_000n,
  };

  it('charges once per period even if the cycle runs twice', async () => {
    const store = memoryStore();
    const chargeOnce = vi.fn(async () => 'sig');

    await runBillingCycle(store, [sub], '2026-06', chargeOnce);
    await runBillingCycle(store, [sub], '2026-06', chargeOnce); // duplicate run

    expect(chargeOnce).toHaveBeenCalledTimes(1);
  });

  it('charges again in a new period', async () => {
    const store = memoryStore();
    const chargeOnce = vi.fn(async () => 'sig');

    await runBillingCycle(store, [sub], '2026-06', chargeOnce);
    await runBillingCycle(store, [sub], '2026-07', chargeOnce);

    expect(chargeOnce).toHaveBeenCalledTimes(2);
  });
});
