/**
 * Webhook handler — react to payments in real time instead of hammering polling.
 *
 * A provider (e.g. Helius) calls your endpoint when a watched account/reference is touched.
 * The fiddly parts everyone gets wrong:
 *   1. AUTHENTICATE the webhook (it's a public URL — anyone can POST to it).
 *   2. The webhook is only a NUDGE — still verify on-chain yourself (it's the source of truth).
 *   3. Be IDEMPOTENT — providers retry and redeliver; never fulfill twice.
 *   4. Return 200 FAST — slow/erroring handlers get retried and pile up.
 *
 * This is framework-agnostic: adapt `headers`/`body` to Express/Next/Hono/etc.
 */

export interface WebhookRequest {
  headers: Record<string, string | undefined>;
  rawBody: string;
}

export interface WebhookResponse {
  status: number;
  body: string;
}

/** Extract the reference(s)/signature a provider event refers to. Shape varies per provider. */
export interface ParsedEvent {
  signature: string;
  references: string[];
}

export interface WebhookDeps {
  /** Shared secret you configured with the provider (compared in constant time). */
  authToken: string;
  parse: (rawBody: string) => ParsedEvent[];
  /** The SAME on-chain verification + idempotent credit you use everywhere (verify-and-credit.ts). */
  verifyAndCreditByReference: (reference: string, signature: string) => Promise<void>;
}

/** Constant-time string compare to avoid leaking the token via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handlePaymentWebhook(
  req: WebhookRequest,
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  // 1. Authenticate — reject anything not carrying your configured secret.
  const provided = req.headers['authorization'] ?? req.headers['x-webhook-token'] ?? '';
  if (!safeEqual(provided, deps.authToken)) {
    return { status: 401, body: 'unauthorized' };
  }

  // 2. Parse. Bad JSON → 400 (do not retry); the provider shouldn't resend malformed events.
  let events: ParsedEvent[];
  try {
    events = deps.parse(req.rawBody);
  } catch {
    return { status: 400, body: 'bad request' };
  }

  // 3. Verify on-chain + credit idempotently. The webhook is a hint; the chain is the truth.
  try {
    for (const ev of events) {
      for (const reference of ev.references) {
        await deps.verifyAndCreditByReference(reference, ev.signature);
      }
    }
  } catch (e) {
    // Transient failure (RPC down, etc.): return 500 so the provider RETRIES later.
    // Idempotency makes the retry safe.
    return { status: 500, body: `retry: ${e instanceof Error ? e.message : 'error'}` };
  }

  // 4. Fast 200 — acknowledge so the provider stops retrying.
  return { status: 200, body: 'ok' };
}
