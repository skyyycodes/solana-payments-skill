# Coming from Stripe → Solana

> If you've built on Stripe, you already know the mental model: charge a customer, verify it server-side via webhook, fulfill once, support refunds and subscriptions. Solana gives you the same building blocks — but **you** own the parts Stripe hid (the ledger, idempotency, finality, the "subscription" engine). This page maps each Stripe concept to its Solana equivalent so you can port your thinking, not start over.

## Concept map

| Stripe | Solana equivalent | Where in this skill |
|--------|-------------------|---------------------|
| `PaymentIntent` | A Solana Pay request + a USDC `transferChecked` transaction | [solana-pay.md](solana-pay.md), [usdc-payments.md](usdc-payments.md) |
| `client_secret` / confirm on client | The wallet signs + submits the transaction | [solana-pay.md](solana-pay.md) |
| `payment_intent.succeeded` webhook | `findReference` / RPC webhook → `validateTransfer` on-chain | [verifying-payments.md](verifying-payments.md) |
| Idempotency-Key header | Your unique on-chain **signature** (+ order id) as the dedup key | [verifying-payments.md](verifying-payments.md) |
| `Customer` | The customer's **wallet** (pubkey) | — |
| `PaymentMethod` (saved card) | A bounded token **delegate** (`approveChecked`) | [subscriptions.md](subscriptions.md) |
| `Subscription` + Stripe's billing cron | A delegate + **your** scheduler, or an on-chain program enforcing cadence | [subscriptions.md](subscriptions.md), [examples/subscription-program](../examples/subscription-program) |
| `Refund` | An outbound `transferChecked` back to the payer, idempotent | [refunds.md](refunds.md) |
| Disputes / chargebacks | **None** — no involuntary reversal; refunds are policy-driven | [refunds.md](refunds.md) |
| Payment Links / Checkout | Solana Pay URL + hosted checkout page | [payment-links.md](payment-links.md) |
| Payouts to bank | Fiat **off-ramp** provider | [offramp-fiat.md](offramp-fiat.md) |
| Stripe Radar / fraud | On-chain verification + your own rules | [verifying-payments.md](verifying-payments.md) |
| Balance / Reporting | **Your** ledger, keyed by signature | [receipts-ledger.md](receipts-ledger.md) |
| Test mode | **Devnet** + devnet USDC | [testing.md](testing.md) |

## The biggest mindset shifts

1. **There is no chargeback.** Settlement is final. This removes fraud-reversal risk but means refunds are entirely your call and your code ([refunds.md](refunds.md)).
2. **You own the ledger.** Stripe was your source of truth; now the **chain** is, and you keep a local ledger keyed by signature for idempotency and reporting.
3. **Finality replaces "succeeded".** Stripe's `succeeded` ≈ Solana `confirmed`. For anything irreversible (shipping, off-ramp), wait for `finalized` ([verifying-payments.md](verifying-payments.md)).
4. **Subscriptions aren't built in.** There's no hosted billing engine. You get a *delegate* primitive and run the cadence yourself (or on-chain). This is the most code you'll write that Stripe gave you free ([subscriptions.md](subscriptions.md)).
5. **No `amount_received` in cents from the API — you read it from the chain.** Always integer **base units**, asserting the **mint** ([usdc-payments.md](usdc-payments.md)).

## Porting a typical Stripe checkout

```
Stripe                                  Solana (this skill)
──────                                  ───────────────────
create PaymentIntent(amount, cust)  →   createCheckout({ recipient, mint, amount }) → { url, reference }
render Stripe Elements / redirect   →   render Solana Pay URL or QR
listen for succeeded webhook        →   findReference(reference) → validateTransfer(...)
check idempotency key                →   dedup on on-chain signature
fulfill order                        →   credit order once, atomically
issue Refund if needed              →   transferChecked back to payer, idempotent
```

The runnable versions of these steps are in [examples/](../examples) (`checkout.ts`, `verify-and-credit.ts`).

## What you still don't have to build

Reliable transaction landing (fees, compute budget, confirmation, retries) is **not** your job here — it's delegated to [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill), the same way Stripe handled the card network for you.

## How this fits

This page is a translation layer, not new functionality — every row points to the guide that implements it. Start at [solana-pay.md](solana-pay.md) and [verifying-payments.md](verifying-payments.md); they cover ~80% of what a Stripe migrant needs first.
