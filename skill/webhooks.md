# Webhooks (Real-Time Settlement)

> Polling every order works, but at scale you want to be **notified** the moment a payment lands. An RPC provider (e.g. Helius) watches your recipient/reference accounts and POSTs your endpoint. The catch: a webhook is a public URL anyone can hit, providers redeliver events, and the event itself is just a hint — so the handler has four jobs it must get right: authenticate, verify on-chain anyway, stay idempotent, and answer fast.

## The four rules

1. **Authenticate the webhook.** It's a public URL. Require a secret (auth header) you configured with the provider, compared in constant time. Reject everything else with `401`.
2. **The webhook is a nudge, not proof.** Still run your own on-chain verification ([verifying-payments.md](verifying-payments.md)) — the chain is the source of truth, the event just tells you *when* to look.
3. **Be idempotent.** Providers retry on non-2xx and may redeliver the same event. Credit on the on-chain **signature** with a uniqueness guard so a duplicate delivery is a no-op.
4. **Return 200 fast.** Do the minimum, return `200`, and the provider stops retrying. Slow or erroring handlers get retried and pile up. Use `500` *deliberately* when you want a retry (transient RPC failure), `400` for malformed events you don't want resent.

Runnable: [examples/src/webhook-handler.ts](../examples/src/webhook-handler.ts).

```typescript
const res = await handlePaymentWebhook(
  { headers: req.headers, rawBody: await readRawBody(req) },
  {
    authToken: process.env.WEBHOOK_SECRET!,
    parse: (raw) => parseHeliusEvents(raw),               // → [{ signature, references }]
    verifyAndCreditByReference: (ref, sig) => verifyAndCredit(/* on-chain + idempotent */),
  },
);
```

## Setting it up with Helius (the actual steps)

1. **Create a webhook** in the Helius dashboard or API: give it your endpoint URL, an **auth header secret**, and the **account addresses to watch** (your recipient ATA, and/or the per-order `reference` accounts).
2. **Pick the type** — an enhanced/transaction webhook that fires when those accounts are involved in a transaction.
3. **Store the secret** as an env var; your handler compares the incoming auth header against it.
4. **Register references dynamically** (optional): if you watch per-order `reference` accounts, add them to the webhook's address list when an order is created, and prune later.

> Provider APIs change — confirm the current webhook fields/types in the provider docs ([resources.md](resources.md)) before wiring.

## Local development

Your machine isn't reachable from the provider. Tunnel it:

```bash
# expose localhost:3000 publicly; use the https URL as the webhook endpoint
ngrok http 3000        # or cloudflared tunnel
```

Then trigger a real devnet payment and watch the event arrive. You can also **replay** a saved event payload with `curl` to test the handler without waiting for a live payment — assert it (a) rejects a bad/missing token, (b) is idempotent on a duplicate POST, and (c) returns 200 quickly.

## Polling vs webhooks

| | Polling | Webhooks |
|---|---------|----------|
| Setup | None (just call `findReference`) | Provider config + public endpoint |
| Latency | Interval-bound | Near-instant |
| Scale | Wasteful at volume | Efficient |
| Reliability backstop | Itself | Still keep polling/reconcile for missed events |

Use webhooks for speed, but **keep [/reconcile](../commands/reconcile.md)** as a backstop — webhooks can be missed, and the verification + idempotent credit logic is identical either way.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| No auth on the endpoint | Anyone forges "paid" events | Constant-time secret check, 401 otherwise |
| Trusting the event payload | Credited a fake/edited event | Re-verify on-chain |
| Non-idempotent handler | Double fulfillment on redelivery | Dedup on signature |
| Slow/throwing handler | Retry storms, backlog | Fast 200; 500 only to request a retry |
| No reconciliation backstop | Missed events = lost orders | Periodic [/reconcile](../commands/reconcile.md) |

## How this fits

Webhooks are the real-time front-end to the same gate in [verifying-payments.md](verifying-payments.md) — they decide *when* you verify, not *whether*. They feed the [ledger](receipts-ledger.md), back up with [/reconcile](../commands/reconcile.md), and pair with the [drop-in checkout](react-checkout.md) (which can also just poll your server). Provider details live in [resources.md](resources.md).
