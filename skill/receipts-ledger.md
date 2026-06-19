# Receipts & the Payment Ledger

> The chain records that money moved; **your business** needs to record *why* — which order, which customer, which invoice, fulfilled or not. That's the ledger. It's the same store that makes crediting idempotent, and it's your source of truth for receipts, reporting, refunds, reconciliation, and accounting. Without it, you can't answer "did this customer pay?" reliably.

## The ledger is not optional

On-chain data is authoritative but inconvenient: it has no order ids, no customer emails, no fulfillment state. Keep a local, append-only ledger keyed by the **on-chain signature** (globally unique). It does triple duty:

1. **Idempotency** — the unique signature prevents double-credit ([verifying-payments.md](verifying-payments.md)).
2. **Reporting / accounting** — revenue, refunds, fees over time.
3. **Reconciliation** — diff your ledger against the chain to catch missed payments ([/reconcile](../commands/reconcile.md)).

## Minimal schema

```typescript
interface LedgerEntry {
  signature: string;        // PRIMARY KEY — globally unique, the dedup guard
  reference: string;        // ties the payment to the order/invoice
  orderId: string;
  customerWallet: string;   // the payer (read from the on-chain transfer)
  recipient: string;        // your merchant wallet
  mint: string;             // which asset
  amount: string;           // base units, as a string (avoid float/precision loss)
  direction: 'in' | 'out';  // 'out' = refund / payout
  status: 'recorded' | 'fulfilled' | 'refunded';
  finality: 'confirmed' | 'finalized';
  createdAt: string;        // ISO timestamp
}
```

Store `amount` as an integer **string** (base units), not a float — JSON/DB floats silently lose precision on large token amounts. Record both inbound payments and outbound refunds/payouts so the ledger nets to your real position.

## Generating a receipt

A receipt is a human-readable view of a ledger entry plus a link to the proof on-chain:

```
Receipt #INV-1042
Paid:        25.00 USDC
From:        7xKX…9aQ2
To:          Merchant (4zMM…ncDU)
When:        2026-06-20 18:04 UTC  (finalized)
Order:       order_8831
Proof:       https://solscan.io/tx/<signature>
```

Always include the **signature / explorer link** — it's the verifiable proof, the equivalent of a card-statement line the customer can independently check.

## Double-entry, lightly

For real accounting, treat each event as a movement: a payment is `+amount` to revenue, a refund is `-amount`, a platform fee split records both legs ([marketplace-payments.md](marketplace-payments.md)). Even a simple `direction in/out` ledger lets you export a CSV your accountant can use and reconcile against the chain.

## Exports & retention

- **CSV/exports** for accounting and tax: signature, date, amount, mint, direction, order.
- **Retention:** keep entries indefinitely (or per your jurisdiction) — they're needed to resolve disputes ([refunds.md](refunds.md)) and audits long after the order closed.
- **Privacy:** wallets are pseudonymous but public; don't co-mingle them with PII more than you must.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| No ledger, "the chain is enough" | Can't answer "did they pay?" | Local ledger keyed by signature |
| Amount stored as float | Precision loss on big amounts | Integer base-unit string |
| Only recording inbound | Refunds/payouts invisible | Record `direction: out` too |
| Receipt without proof link | Unverifiable, disputes drag | Include explorer/signature |
| Mutable ledger rows | Audit trail destroyed | Append-only, status transitions |

## How this fits

The ledger is the spine the whole skill leans on: [verifying-payments.md](verifying-payments.md) writes to it idempotently, [refunds.md](refunds.md) appends outbound entries, [subscriptions.md](subscriptions.md) records each period, and [/reconcile](../commands/reconcile.md) reads it against the chain. Build it once and every other flow gets safer.
