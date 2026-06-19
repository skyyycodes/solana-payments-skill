import { describe, it, expect, vi } from 'vitest';
import { handlePaymentWebhook, type WebhookDeps } from '../src/webhook-handler';

function deps(over: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    authToken: 'secret-token',
    parse: () => [{ signature: 'sig1', references: ['refA'] }],
    verifyAndCreditByReference: vi.fn(async () => {}),
    ...over,
  };
}

describe('handlePaymentWebhook', () => {
  it('rejects a missing/incorrect auth token with 401', async () => {
    const res = await handlePaymentWebhook({ headers: { authorization: 'wrong' }, rawBody: '{}' }, deps());
    expect(res.status).toBe(401);
  });

  it('rejects malformed bodies with 400 (do not retry)', async () => {
    const d = deps({ parse: () => { throw new Error('bad json'); } });
    const res = await handlePaymentWebhook({ headers: { authorization: 'secret-token' }, rawBody: 'oops' }, d);
    expect(res.status).toBe(400);
  });

  it('verifies on-chain per reference and returns a fast 200', async () => {
    const d = deps();
    const res = await handlePaymentWebhook({ headers: { 'x-webhook-token': 'secret-token' }, rawBody: '{}' }, d);
    expect(res.status).toBe(200);
    expect(d.verifyAndCreditByReference).toHaveBeenCalledWith('refA', 'sig1');
  });

  it('returns 500 so the provider retries when verification throws transiently', async () => {
    const d = deps({ verifyAndCreditByReference: vi.fn(async () => { throw new Error('rpc down'); }) });
    const res = await handlePaymentWebhook({ headers: { authorization: 'secret-token' }, rawBody: '{}' }, d);
    expect(res.status).toBe(500);
  });

  it('is safe under duplicate delivery (idempotent credit is called both times)', async () => {
    const d = deps();
    const req = { headers: { authorization: 'secret-token' }, rawBody: '{}' };
    const a = await handlePaymentWebhook(req, d);
    const b = await handlePaymentWebhook(req, d);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(d.verifyAndCreditByReference).toHaveBeenCalledTimes(2); // dedup happens inside credit
  });
});
