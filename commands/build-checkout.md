---
description: "Scaffold a complete Solana checkout - Solana Pay request, USDC transfer transaction, and the server-side verification gate - wired to land via solana-tx-skill"
---

You are scaffolding a working checkout flow. Goal: a customer can pay, and the server credits the order exactly once, safely. Follow [solana-pay.md](../skill/solana-pay.md), [usdc-payments.md](../skill/usdc-payments.md), and [verifying-payments.md](../skill/verifying-payments.md), reusing the patterns in [examples/](../examples).

## Inputs to collect

- **Settlement asset**: USDC (default) / other SPL / native SOL — confirm the mint per cluster ([resources.md](../skill/resources.md)).
- **Cluster**: mainnet-beta (default) / devnet (recommend devnet first — see [testing.md](../skill/testing.md)).
- **Merchant recipient** wallet/owner.
- **Pricing**: fixed price, or fiat-priced (then pull in [pricing-oracles.md](../skill/pricing-oracles.md)).
- **Surface**: QR / payment link / in-app transaction; single-item or cart.
- **Stack**: server framework + datastore (for the ledger).

## What to generate

1. **Request layer** — `createCheckout({ recipient, mint, amount })` returning a Solana Pay `url` + a **unique reference** persisted with the order. Render as a link/QR ([payment-links.md](../skill/payment-links.md)).
2. **Asset layer** — build the USDC `transferChecked` transaction with base-unit amounts and ATA creation, tagged with the reference. Mark where dynamic fee + compute budget + send/confirm plug in via [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill).
3. **Settle layer** — the verification gate: `findReference` → `validateTransfer` (exact recipient/amount/mint/reference) → idempotent credit keyed on signature, in an atomic DB transaction → finality fit.
4. **Ledger** — persist each payment ([receipts-ledger.md](../skill/receipts-ledger.md)) so crediting is idempotent and reportable.

## Standards (enforce, don't ask)

- Base units (`bigint`), never floats. Assert the mint. Verify server-side, never trust client success.
- One reference per order; dedup on the on-chain signature.
- `confirmed` for UX, `finalized` before anything irreversible.
- Delegate transaction landing to solana-tx-skill — do not hand-roll send/confirm.

## Output

- The checkout creation function, the transaction builder, and the verification endpoint, matching the user's stack.
- A short README of the flow + how to test it on devnet.
- Call out every place a secret/key is used and how it should be stored.

## Offer follow-up

Offer to add: a hosted checkout page ([payment-links.md](../skill/payment-links.md)), recurring billing ([/setup-subscription](setup-subscription.md)), or a reconciliation job ([/reconcile](reconcile.md)). For deeper implementation, hand off to **payments-engineer**.
