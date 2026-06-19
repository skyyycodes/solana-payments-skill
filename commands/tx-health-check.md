---
description: "Audit a codebase's transaction sending against the reliability checklist and report gaps with concrete fixes"
---

You are auditing how a codebase sends Solana transactions. Goal: find the gaps that cause dropped/failed/overpriced transactions, and report them with concrete, prioritized fixes mapped to the skill files.

## Step 1: Locate the sending code

Search the project for the transaction lifecycle. Look for:

- **Send calls:** `sendRawTransaction`, `sendTransaction`, `sendAndConfirmTransaction`, `sendAndConfirmTransactionFactory`, `sendBundle`
- **Fees:** `setComputeUnitPrice`, `getSetComputeUnitPriceInstruction`, `getRecentPrioritizationFees`, `getPriorityFeeEstimate`
- **Compute:** `setComputeUnitLimit`, `getSetComputeUnitLimitInstruction`, `simulateTransaction`, `getComputeUnitEstimate`
- **Blockhash/confirm:** `getLatestBlockhash`, `lastValidBlockHeight`, `confirmTransaction`, `getSignatureStatuses`
- **SDK:** `@solana/web3.js` vs `@solana/kit` in `package.json`

Use Grep/Glob; identify each distinct "send" code path.

## Step 2: Score each path against the checklist

For every sending path, evaluate:

| # | Check | Pass criteria |
|---|-------|---------------|
| 1 | **Dynamic priority fee** | Fee comes from `getRecentPrioritizationFees`/provider API, not a constant |
| 2 | **Account-aware fee** | Writable accounts passed to the estimate |
| 3 | **Fee clamped** | `[floor, ceiling]` + fallback on estimate failure |
| 4 | **Simulated CU limit** | `setComputeUnitLimit` set from `unitsConsumed`, not default/hardcoded |
| 5 | **CU margin** | ~10–20% headroom added |
| 6 | **Fresh blockhash** | `getLatestBlockhash` fetched right before signing |
| 7 | **Expiry-bounded** | Retry loop stops at `lastValidBlockHeight` (no infinite loop) |
| 8 | **Rebroadcast** | Tx is resent on an interval, not sent once |
| 9 | **Idempotent retry** | Same signed bytes resent; rebuild only on expiry |
| 10 | **On-chain vs delivery split** | On-chain `err` is decoded, not blindly retried |
| 11 | **Commitment fit** | `finalized` before irreversible value moves; `confirmed` for UX |
| 12 | **Versioned tx** | Uses `VersionedTransaction` / kit v0 messages |
| 13 | **Errors surfaced** | Logs included on failure; no swallowed `err` / fake success |

Mark each ✅ pass / ⚠️ partial / ❌ fail with the file:line evidence.

## Step 3: Report

```markdown
# Transaction Health Check

**SDK:** @solana/web3.js | @solana/kit
**Sending paths found:** <N>  (<list with file:line>)

## Scorecard
| Check | path A | path B |
|-------|--------|--------|
| 1 Dynamic fee | ❌ | ✅ |
| ... | | |

## Critical gaps (fix first)
1. **<gap>** — <file:line> — impact: <drops / overpay / double-spend risk> — fix: <one line> → <skill file>

## Recommended gaps
- ...

## Quick wins
- ...
```

Prioritize by impact:
- **Critical:** no rebroadcast, infinite/no expiry bound, retrying on-chain failures, swallowed errors, double-execution risk.
- **High:** hardcoded fee, unset CU limit (overpay + drops).
- **Medium:** missing clamps/margins, wrong commitment, legacy `Transaction`.

## Step 4: Offer remediation

Offer to hand the top fixes to **tx-engineer** to implement against the relevant skill files, smallest-blast-radius first. Re-run this command after to confirm the scorecard improved.

## Rules

- Cite `file:line` evidence for every ❌/⚠️.
- Don't rewrite code in this command - report and prioritize. Implementation is tx-engineer's job.
- If no sending code is found, say so and point to the golden path in [SKILL.md](../skill/SKILL.md).
