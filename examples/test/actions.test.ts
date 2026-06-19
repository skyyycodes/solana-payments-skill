import { describe, it, expect } from 'vitest';
import { getPaymentAction } from '../src/actions-handler';

describe('getPaymentAction — Blink metadata', () => {
  const action = getPaymentAction({
    baseHref: 'https://shop.example/api/actions/pay',
    icon: 'https://shop.example/icon.png',
    title: 'Pay Shop',
    description: 'Pay in USDC',
  });

  it('is a well-formed action response', () => {
    expect(action.type).toBe('action');
    expect(action.icon).toMatch(/^https:/);
    expect(action.title).toBeTruthy();
  });

  it('exposes preset amounts plus a custom-amount parameter', () => {
    const actions = action.links?.actions ?? [];
    expect(actions.length).toBe(3);
    expect(actions.every((a) => a.type === 'transaction')).toBe(true);

    const custom = actions.find((a) => a.parameters && a.parameters.length > 0);
    expect(custom?.href).toContain('{amount}');
    expect(custom?.parameters?.[0]?.name).toBe('amount');
  });
});
