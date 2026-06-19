# Verifying & Settling Payments

> The SETTLE layer — the part most implementations get wrong, and the one that costs real money. A request being shown, or a wallet popup saying "success", proves nothing. You must confirm **on-chain** that the **exact** payment happened, credit it **exactly once**, and wait for the **right finality** before releasing anything irreversible.

## The four non-negotiables

1. **Verify on-chain, server-side.** Never release value based on a client-side success message.
2. **Validate exactly:** recipient, amount, mint, and your unique reference must all match.
3. **Idempotent crediting:** the same payment can be observed twice (retry, duplicate webhook, page refresh) — apply it once.
4. **Finality fit:** `confirmed` for UX; `finalized` before shipping goods / unlocking funds / off-ramping.

## Step 1 — Find the payment

Bind each order to a unique **reference** public key (from [solana-pay.md](solana-pay.md)). Find it two ways:

### Polling (simple)

```typescript
import { findReference, FindReferenceError } from '@solana/pay';

async function waitForPayment(connection: Connection, reference: PublicKey, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await findReference(connection, reference, { finality: 'confirmed' });
    } catch (e) {
      if (!(e instanceof FindReferenceError)) throw e; // real error
      await new Promise(r => setTimeout(r, 1500));      // not found yet
    }
  }
  throw new Error('Payment not detected before timeout');
}
```

### Webhooks (production)

Use an RPC provider's webhooks (e.g. Helius) to be notified when the reference/recipient account is touched, instead of hammering polling. Either way, the verification logic below is identical and is the source of truth.

## Step 2 — Validate it matches EXACTLY

```typescript
import { validateTransfer } from '@solana/pay';
import BigNumber from 'bignumber.js';

await validateTransfer(
  connection,
  signature,
  {
    recipient,                          // your merchant wallet / owner
    amount: new BigNumber('25.00'),     // human units; validateTransfer scales by mint decimals
    splToken: usdcMint,                 // REQUIRED for token payments — assert the mint
    reference,                          // the order's unique reference
  },
  { commitment: 'confirmed' },
);
// Throws if recipient/amount/mint/reference don't all match. No throw = verified.
```

If you verify manually instead of `validateTransfer`, you must check **all** of:
- the transfer instruction credits **your** recipient ATA,
- for the **exact** base-unit amount (`>=` only if you intentionally allow overpayment),
- of the **correct mint**,
- the tx is **successful** (`meta.err === null`),
- the **reference** key is present in the account keys.

> **Why all of them:** skip the mint and someone pays in a worthless token; skip the amount and they pay 1 cent; skip success and you credit a failed tx; skip reference and you can't bind it to the order.

## Step 3 — Credit idempotently (never double-apply)

A payment can be seen more than once. Make crediting safe under duplicates by recording the **signature** (and/or reference) with a uniqueness constraint, inside a transaction:

```typescript
async function creditOrderOnce(db: Db, orderId: string, signature: string, amount: bigint) {
  await db.transaction(async (tx) => {
    // Unique index on signature makes a duplicate insert fail — the guard against double-credit.
    const inserted = await tx.payments.insertIfAbsent({ signature, orderId, amount });
    if (!inserted) return;                 // already processed this exact payment — no-op
    await tx.orders.markPaid(orderId, signature);
    // ... fulfill: grant access / queue shipment / etc.
  });
}
```

Rules:
- The **dedup key is the on-chain signature** (globally unique), optionally also the reference/order id.
- Do the "record + fulfill" in **one atomic DB transaction** so a crash can't fulfill-without-recording or vice versa.
- Webhook handlers must be **idempotent and return 200 quickly**; providers retry on non-200 and will resend events.

## Step 4 — Wait for the right finality

| Action | Required commitment |
|--------|---------------------|
| Show "payment received" in the UI | `confirmed` |
| Unlock digital access / start a trial | `confirmed` (usually fine) |
| Ship physical goods / pay out / off-ramp / anything irreversible | `finalized` |

`confirmed` can, in rare reorgs, be rolled back; `finalized` cannot. Match the cost of being wrong. For high-value, verify at `finalized` before releasing value. (Finality + reliable confirmation mechanics → [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill).)

## Overpayment, underpayment, late payment

- **Underpaid:** don't fulfill; surface "amount mismatch" and the shortfall.
- **Overpaid:** decide policy up front (accept + record credit, or refund the difference). Don't silently keep it without a record.
- **Late (after timeout):** the reference still works forever; reconcile asynchronously rather than dropping a real payment. Never auto-refund without confirming the original first.

## Reconciliation

Keep a ledger keyed by signature. Periodically scan recipient accounts / references for payments your live flow missed (customer closed the tab after paying). The reference + idempotent credit make this safe to re-run.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Trusting client "success" | Free goods to attackers | Verify on-chain server-side |
| Not checking the mint | Paid in a junk token | Assert `splToken` |
| Checking amount with floats | Off-by-rounding credits | Integer base units |
| No signature dedup | Double-credit on retries/webhooks | Unique index on signature |
| Fulfilling at `processed`/optimistic | Reorg claws back the pay | `confirmed`/`finalized` per value |
| Non-idempotent webhook | Duplicate fulfillment | Idempotent handler, fast 200 |

## How this fits

This is the gate every flow passes through: [solana-pay.md](solana-pay.md) and [usdc-payments.md](usdc-payments.md) feed it; [subscriptions.md](subscriptions.md) verifies each recurring charge the same way; [offramp-fiat.md](offramp-fiat.md) requires `finalized` before sending to a provider. Use [/verify-payment](../commands/verify-payment.md) to run this checklist on a real signature/reference.
