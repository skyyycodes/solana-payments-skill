---
description: "Audit a codebase's payment, checkout, and subscription code for payment-safety gaps - trusting the client, double-credit, unbounded approvals, wrong finality - and report prioritized fixes"
---

You are auditing how a codebase **accepts and verifies money** on Solana. Goal: find the gaps that cause lost funds, double-charges, or fraud, and report them with concrete, prioritized fixes mapped to the skill files. Money bugs are critical by default.

## Step 1: Locate the payment code

Search the project for the commerce surface. Look for:

- **Requests/links:** `encodeURL`, `createQR`, `@solana/pay`, `findReference`, `validateTransfer`, transaction-request endpoints
- **Token ops:** `transferChecked`, `transfer`, `approveChecked`, `approve`, `revoke`, `getAssociatedTokenAddress`, `createAssociatedTokenAccountInstruction`
- **Verification:** where the app decides an order is "paid" — webhook handlers, `/status` endpoints, client `onSuccess` callbacks
- **Crediting/fulfillment:** DB writes that mark paid / grant access / ship; check for dedup constraints
- **Subscriptions:** delegate approvals, cron/scheduler, per-period charge logic
- **SDK & mint:** `@solana/web3.js` vs `@solana/kit`; hardcoded mint addresses

Use Grep/Glob; identify each distinct payment path (one-time checkout, link, subscription charge, off-ramp).

## Step 2: Score each path against the payment-safety checklist

| # | Check | Pass criteria |
|---|-------|---------------|
| 1 | **On-chain verification** | Payment confirmed on-chain server-side, not from a client callback |
| 2 | **Exact amount** | Verified amount == expected base units (integer) |
| 3 | **Correct mint asserted** | Verification checks the mint (rejects wrong/junk token) |
| 4 | **Recipient checked** | Transfer credits the expected recipient/ATA |
| 5 | **Reference bound** | Payment tied to a unique per-order reference |
| 6 | **Idempotent credit** | Unique constraint on signature; record+fulfill atomic; safe under duplicate webhooks |
| 7 | **Finality fit** | `finalized` before irreversible release; `confirmed` for UX |
| 8 | **transferChecked** | Uses checked transfer (mint+decimals), not `transfer` |
| 9 | **ATA handling** | Recipient ATA created if missing |
| 10 | **Integer money** | bigint/BN base units, no floats |
| 11 | **Bounded approval** | Subscriptions use `approveChecked` with a cap; no unlimited approve |
| 12 | **Cadence + per-period idempotency** | Recurring charges enforced once per period; program-enforced for production |
| 13 | **Revocable / cancellable** | `revoke` + scheduler stop on cancel |
| 14 | **Reliable delivery** | Sends go through dynamic fee + confirm/retry (solana-tx-skill), not single send |

Mark each ✅ pass / ⚠️ partial / ❌ fail with `file:line` evidence.

## Step 3: Report

```markdown
# Payments Safety Audit

**SDK:** @solana/web3.js | @solana/kit
**Payment paths found:** <N>  (<list with file:line>)

## Scorecard
| Check | checkout | sub-charge | webhook |
|-------|----------|------------|---------|
| 1 On-chain verify | ❌ | ✅ | ✅ |
| ... | | | |

## Critical gaps (fix first — money at risk)
1. **<gap>** — <file:line> — impact: <lost funds / double-charge / fraud> — fix: <one line> → <skill file>

## Recommended gaps
- ...

## Quick wins
- ...
```

Prioritize by impact:
- **Critical:** trusting client success, no signature dedup (double-credit), unlimited approval, no mint/amount check, fulfilling at non-final commitment for irreversible value.
- **High:** unchecked `transfer`, missing ATA handling, no per-period idempotency, floats for money.
- **Medium:** hardcoded mint, single-send (no retry), missing revoke/cancel.

## Step 4: Offer remediation

Offer to hand the top fixes to **payments-engineer**, smallest-blast-radius first, verification gate before happy path. Re-run this audit after to confirm the scorecard improved. Use [/verify-payment](verify-payment.md) to spot-check a real signature.

## Rules

- Cite `file:line` for every ❌/⚠️.
- Treat any "credit from client callback" or "no signature dedup" as **critical** — these directly lose money.
- Don't rewrite code in this command — report and prioritize. Implementation is payments-engineer's job.
- If no payment code is found, say so and point to the golden rules in [SKILL.md](../skill/SKILL.md).
