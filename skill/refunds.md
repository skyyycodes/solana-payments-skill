# Refunds & Disputes

> Refunds move money **back** to the customer, and they are as dangerous as the original charge: a double-refund is a direct, unrecoverable loss. On-chain payments are final and have no chargeback rail, so refunds are something **you** implement — deliberately, idempotently, and only after confirming the original payment.

## The four non-negotiables

1. **Confirm the original first.** Never refund an order you haven't verified was paid on-chain (recipient + amount + mint + reference). An unconfirmed or failed "payment" must never trigger a refund.
2. **Refund at most once.** Treat the refund like crediting in reverse: a unique key (`refund:<orderId>` or `refund:<originalSignature>`) guards against issuing it twice.
3. **Refund the right amount, to the right wallet.** Pay back to the wallet that actually paid (read it from the original transfer), in the **same mint**, in **base units**.
4. **Record before you release confidence.** Persist the refund signature and mark the order `refunded` in one atomic step, so a crash can't double-send.

## The flow

```
verify original  →  decide amount (full / partial)  →  build transfer back
   →  land via solana-tx-skill  →  confirm at finalized  →  record + mark refunded
```

A refund is just an outbound payment from the merchant to the customer. Build it exactly like [usdc-payments.md](usdc-payments.md) (`transferChecked`, ATA handling, base units) and land it via [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill). What makes it a *refund* is the bookkeeping around it.

## Idempotent refund

```typescript
async function refundOnce(db: Db, order: PaidOrder, amount: bigint): Promise<string> {
  // 1. Guard: the order must be a verified payment, and not already refunded.
  if (order.status !== 'paid') throw new Error('Cannot refund an unpaid/unverified order');
  if (amount > order.paidAmount) throw new Error('Refund exceeds amount paid');

  // 2. Reserve the refund atomically — a unique key prevents a second concurrent refund.
  const reserved = await db.refunds.insertIfAbsent({
    key: `refund:${order.id}`,           // one refund per order (use a counter for multiple partials)
    orderId: order.id,
    amount: amount.toString(),
    status: 'pending',
  });
  if (!reserved) {
    const existing = await db.refunds.get(`refund:${order.id}`);
    return existing.signature ?? ''; // already issued (or in-flight) — never send again
  }

  // 3. Build + land the outbound transfer to the ORIGINAL payer, same mint.
  const signature = await sendRefundTransfer({
    to: order.payerWallet,             // read from the original on-chain transfer, not user input
    mint: order.mint,
    amount,                            // base units
  });

  // 4. Record + mark refunded atomically.
  await db.transaction(async (tx) => {
    await tx.refunds.markSent(`refund:${order.id}`, signature);
    await tx.orders.markRefunded(order.id, signature);
  });
  return signature;
}
```

## Full vs partial refunds

- **Full:** refund `order.paidAmount`. Mark the order `refunded`.
- **Partial:** refund `< paidAmount` (e.g. one line item, or a price adjustment). Track `refundedTotal` and never let cumulative refunds exceed `paidAmount`. Use a per-refund key (`refund:<orderId>:<n>`) so multiple partials each stay idempotent.
- **Overpayment refunds:** if a customer overpaid (see [verifying-payments.md](verifying-payments.md)), the "refund the difference" path is the same code — refund `paid - expected`.

## Refunding subscriptions

A recurring charge is refunded like any other payment — find the specific period's signature, then refund it. Separately decide whether to **cancel** the subscription (deactivate + `revoke` the delegate, see [subscriptions.md](subscriptions.md)). Refunding a period does **not** stop future charges; cancellation does.

## Disputes (there is no chargeback)

On-chain payments have **no involuntary reversal** — a customer cannot force a clawback, and neither can you. "Disputes" are an off-chain, policy/support process that ends in either *no action* or *you issuing a refund* with the flow above. Implications:

- Keep enough records (signature, payer wallet, amount, mint, timestamp, order) to resolve disputes manually.
- Decide a refund **policy and window** up front and surface it at checkout.
- For higher-trust flows, consider escrow / delayed settlement so funds aren't released until a dispute window passes — but that's a design choice, not a built-in.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Refund before confirming original | Refunding a payment that never landed | Verify on-chain first |
| No refund idempotency key | Double refund on retry / double-click | Unique `refund:<orderId>` key |
| Refund to user-supplied address | Funds sent to attacker | Refund to the on-chain payer |
| Wrong mint / float amount | Wrong value returned | Same mint, base units |
| Send-then-record | Crash re-sends the refund | Reserve key → send → record atomically |
| Confirming refund at `processed` | Reorg, ambiguous state | `finalized` for outbound money |

## How this fits

Refunds close the money lifecycle that [verifying-payments.md](verifying-payments.md) opens. They reuse [usdc-payments.md](usdc-payments.md) to build the transfer and [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill) to land it reliably. Use [/reconcile](../commands/reconcile.md) to detect orders that were refunded off-flow and keep the ledger honest.
