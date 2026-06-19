---
description: "Reconcile your payment ledger against the chain - find missed payments, double-credits, and orphaned transfers, and repair the ledger idempotently"
---

You are reconciling a payment ledger against on-chain reality. The chain is the source of truth; the ledger must match it. Goal: find and safely repair drift — payments that happened but weren't credited, and anything credited that shouldn't have been. Follow [receipts-ledger.md](../skill/receipts-ledger.md) and [verifying-payments.md](../skill/verifying-payments.md).

## Inputs to collect

- **Ledger access** (read), keyed by signature.
- **Recipient wallet(s) / references** to scan, and **cluster** + RPC.
- **Time window** to reconcile (e.g. last 24h, since last run).
- **Expected asset(s)** (mint per cluster — [resources.md](../skill/resources.md)).

## Step 1 — Pull both sides

- **On-chain:** for each merchant recipient/reference, list transfers in the window (`getSignaturesForAddress` → fetch each with `maxSupportedTransactionVersion: 0`).
- **Ledger:** list recorded entries in the same window.

## Step 2 — Diff

| Case | Meaning | Action |
|------|---------|--------|
| On-chain, **not** in ledger | Missed payment (customer closed tab, webhook lost) | Verify exactly, then credit **idempotently** (signature key) |
| In ledger, **not** on-chain | Phantom credit (bug, wrong cluster) | Investigate; never fulfill; flag for manual review |
| In both, **amounts differ** | Under/over-credit | Re-verify on-chain value; correct ledger |
| Duplicate signature in ledger | Double-credit | Collapse to one; refund/clawback policy if already fulfilled |
| Outbound refund not recorded | Ledger overstates revenue | Record the refund entry ([refunds.md](../skill/refunds.md)) |

## Step 3 — Repair safely

- Every credit goes through the **same idempotent path** as live crediting — re-running reconcile must be a no-op.
- Validate **exactly** (recipient + amount + mint + reference) before crediting a found payment; don't trust a bare transfer to your address.
- Use `finalized` for anything that triggers irreversible fulfillment.
- Make all writes atomic; record what reconcile changed (audit trail).

## Step 4 — Report

```markdown
## Reconciliation: <window> on <cluster>

- on-chain payments scanned: <n>
- ledger entries: <n>
- missed payments credited: <n>  (signatures: ...)
- phantom/ledger-only entries: <n>  (FLAGGED, not auto-resolved)
- amount mismatches: <n>
- duplicate credits found: <n>
- refunds reconciled: <n>

**Net change to recognized revenue:** <amount>
**Items needing manual review:** <list>
```

## Rules

- Reconcile is **idempotent**: safe to run repeatedly; never double-credits.
- Never auto-resolve ledger-only (phantom) entries — flag for a human.
- Always verify value before crediting a discovered payment.
- Schedule it as a periodic backstop, not a one-off — it's your safety net for anything the live flow missed.
