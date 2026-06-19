# Payments Threat Model

> Every payment system is a target, because the payoff is money. This is the attacker's-eye view of a Solana payment flow: the concrete ways people try to get goods for free, get paid twice, or drain an approval — and the specific control that stops each one. If you only read one safety page, read this one alongside [verifying-payments.md](verifying-payments.md).

## Attacker goals & defenses

| # | Attack | How it works | Defense |
|---|--------|--------------|---------|
| 1 | **Fake success** | Spoof the client "payment complete" callback; never actually pay | Verify **on-chain, server-side**; never trust the client ([verifying-payments.md](verifying-payments.md)) |
| 2 | **Wrong mint** | Pay with a worthless look-alike token | Assert `splToken` / mint on every verification |
| 3 | **Underpayment** | Pay 1 unit, claim the order | Check the **exact** base-unit amount |
| 4 | **Reused payment** | Reuse one real payment for many orders | Bind a **unique reference** per order; verify it's present |
| 5 | **Replay / double-credit** | Submit the same signature/webhook twice | Idempotent credit keyed on **signature** |
| 6 | **Reorg clawback** | Act on a `confirmed`/`processed` tx that gets rolled back | Gate irreversible actions on **`finalized`** |
| 7 | **Delegate drain** | A relayer holding a delegate pulls the whole cap at once | **Bounded** approval + on-chain cadence ([subscriptions.md](subscriptions.md)) |
| 8 | **Double refund** | Trigger a refund twice, or refund an unpaid order | Confirm original + idempotent refund key ([refunds.md](refunds.md)) |
| 9 | **Refund redirect** | Get the refund sent to an attacker wallet | Refund only to the **on-chain payer** |
| 10 | **Race condition** | Two concurrent verifications credit the same order twice | Atomic DB transaction + unique constraint |
| 11 | **Stale price** | Exploit a moving/oracle-glitched price | Reject stale/low-confidence prices; lock quote ([pricing-oracles.md](pricing-oracles.md)) |
| 12 | **Webhook forgery** | POST a fake "paid" event to your endpoint | Verify on-chain anyway; verify webhook signature/secret |

## The non-negotiable controls

These few controls neutralize most of the table above:

1. **Server-side on-chain verification** — closes #1, #2, #3, #12.
2. **Unique reference per order** — closes #4.
3. **Idempotency keyed on signature, inside an atomic DB transaction** — closes #5, #10.
4. **Finality matched to irreversibility** — closes #6.
5. **Bounded approvals + on-chain cadence** — closes #7.
6. **Idempotent refunds to the on-chain payer only** — closes #8, #9.

## Trust boundaries

- **The client is untrusted.** Anything the browser/wallet says is a *hint*, never a fact. Facts come from the chain.
- **The webhook sender is semi-trusted.** Verify its signature, but still re-verify on-chain — the chain is the source of truth, the webhook is just a nudge.
- **The relayer (subscriptions) is constrained, not trusted.** It can only do what the bounded delegate + on-chain program allow. Design so a compromised relayer can't exceed the cap or cadence.
- **Keys are the crown jewels.** Merchant/relayer signing keys should live in an HSM/KMS or hardware, never in source or env files in plaintext. A leaked key is game over.

## Operational safety

- **Least privilege** for hot wallets; sweep to cold storage; separate the fee/relayer key from the treasury.
- **Monitoring & alerts** on anomalies: unexpected refund volume, charges near the cap, verification failures spiking.
- **Reconciliation** as a backstop — diff ledger vs chain regularly ([/reconcile](../commands/reconcile.md)) so anything that slipped past live checks is caught.
- **Audit on-chain programs** before mainnet ([examples/subscription-program](../examples/subscription-program) is a reference, not audited).

## How this fits

This page is the adversarial lens over the whole skill — each defense links to the guide that implements it: [verifying-payments.md](verifying-payments.md), [subscriptions.md](subscriptions.md), [refunds.md](refunds.md), [pricing-oracles.md](pricing-oracles.md). Run [/payments-audit](../commands/payments-audit.md) to score real code against these controls.
