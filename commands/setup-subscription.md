---
description: "Scaffold delegate-based recurring billing safely - bounded approveChecked, idempotent per-period charges, revoke, and optional on-chain cadence enforcement"
---

You are setting up recurring billing. There is no native subscription engine on Solana, so you build it on the SPL token **delegate** primitive — safely. Follow [subscriptions.md](../skill/subscriptions.md) and reuse [examples/src/subscription.ts](../examples/src/subscription.ts) and the reference program in [examples/subscription-program](../examples/subscription-program).

## Inputs to collect

- **Plan**: amount per period + period length (e.g. 25 USDC / 30 days).
- **Mint** + cluster (devnet first — [testing.md](../skill/testing.md)).
- **Cap**: how many periods to approve up front (e.g. 3–12). NEVER unlimited.
- **Enforcement model**: relayer-only (off-chain, trust-based) **or** on-chain program (recommended; cadence + cap enforced in code).
- **Datastore** for the per-period idempotency ledger.

## What to generate

1. **Approve** — a one-time `approveChecked` for a **bounded cap** (delegate = relayer key or program PDA). Surface the cap to the customer explicitly.
2. **Charge** — a per-period pull (`transferChecked` by the delegate), idempotent per `(subscription, period)`, landed via [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill) and verified like any payment ([verifying-payments.md](../skill/verifying-payments.md)).
3. **Scheduler** — the billing loop that skips already-charged periods and records each charge.
4. **Cancel** — deactivate + `revoke` the delegate so no further pulls are possible.
5. **Re-approval** — prompt the customer to re-approve before the cap is exhausted.

## Decision: relayer vs on-chain

| | Relayer-only | On-chain program (recommended) |
|---|---|---|
| Cadence | Enforced by your code (trusted) | Enforced on-chain (`now >= last + period`) |
| Cap | SPL approval cap | SPL approval cap **+** program checks |
| If relayer is compromised | Could pull up to the cap early | Bounded by cadence + amount in code |

If integrity matters, generate/adapt the reference Anchor program ([examples/subscription-program](../examples/subscription-program)) and **recommend an audit before mainnet**.

## Standards (enforce, don't ask)

- Bounded approval only — never unlimited. Base units, assert mint.
- Idempotent per period (dedup key = `subscription:period`).
- Verify each charge on-chain; `finalized` before granting paid-only value if irreversible.
- Provide a working cancel/revoke path.

## Offer follow-up

Offer to wire dunning (retry failed charges, then suspend), receipts per period ([receipts-ledger.md](../skill/receipts-ledger.md)), and an audit checklist via [/payments-audit](payments-audit.md). For implementation depth, hand off to **payments-engineer**.
