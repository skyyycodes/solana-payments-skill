---
globs:
  - "src/**/*.{ts,tsx}"
  - "app/**/*.{ts,tsx}"
  - "lib/**/*.{ts,tsx}"
  - "tests/**/*.ts"
exclude:
  - "**/node_modules/**"
  - "**/dist/**"
  - "**/*.d.ts"
---

# TypeScript Standards for Solana Payments

Rules for code that accepts, verifies, and recurs money on Solana. Money code is unforgiving — these are non-negotiable.

## Verification

### NEVER trust the client; verify on-chain, server-side

```typescript
// BAD — credits an order from a browser callback. Trivially forged.
onPaymentSuccess(() => fetch('/api/orders/123/fulfill', { method: 'POST' }));

// GOOD — server verifies the on-chain transfer, then fulfills
const info = await findReference(connection, reference, { finality: 'confirmed' });
await validateTransfer(connection, info.signature,
  { recipient, amount, splToken: mint, reference }, { commitment: 'confirmed' });
await creditOrderOnce(orderId, info.signature, amount); // idempotent
```

### Validate amount, mint, recipient, AND reference — all of them

```typescript
// BAD — "the reference showed up, must be paid"
if (await findReference(connection, reference)) markPaid();

// GOOD — assert the value actually moved correctly
await validateTransfer(connection, signature,
  { recipient, amount, splToken: mint, reference }, { commitment });
```

## Idempotency

### NEVER credit a payment more than once

```typescript
// GOOD — unique constraint on the on-chain signature is the dedup guard
await db.transaction(async (tx) => {
  const inserted = await tx.payments.insertIfAbsent({ signature, orderId }); // unique(signature)
  if (!inserted) return;                 // duplicate webhook/retry — no-op
  await tx.orders.markPaid(orderId, signature);
});
```

### Webhook handlers must be idempotent and return 200 fast

Providers retry on non-2xx and resend events. Dedup by event id / signature; never fulfill twice.

## Money amounts

### Integer base units only — never floats

```typescript
// BAD — float math loses cents
const amount = 25.0 * 1e6;

// GOOD — bigint base units (USDC = 6 decimals)
function toBaseUnits(human: string, decimals: number): bigint {
  const [w, f = ''] = human.split('.');
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
}
const amount = toBaseUnits('25.00', 6); // 25_000_000n
```

## Token operations

### Use the CHECKED variants for payments

```typescript
// BAD — no mint/decimals enforcement
createTransferInstruction(source, dest, owner, amount);
createApproveInstruction(account, delegate, owner, amount);

// GOOD — mint + decimals enforced by the runtime
createTransferCheckedInstruction(source, mint, dest, owner, amount, decimals);
createApproveCheckedInstruction(account, mint, delegate, owner, cap, decimals);
```

### Create the recipient ATA if it doesn't exist

```typescript
try { await getAccount(connection, destAta); }
catch (e) {
  if (e instanceof TokenAccountNotFoundError)
    ixs.push(createAssociatedTokenAccountInstruction(payer, destAta, owner, mint));
  else throw e;
}
```

### Treat the mint + cluster as configuration

```typescript
// BAD — mainnet mint hardcoded, breaks on devnet, hard to audit
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// GOOD — from config per cluster, verified against an authoritative source
const USDC = new PublicKey(config.usdcMint);
```

## Subscriptions

### NEVER approve an unlimited amount; bound and track it

```typescript
// BAD — a leaked delegate key drains the wallet
createApproveInstruction(ata, delegate, owner, BigInt('18446744073709551615'));

// GOOD — capped (e.g. 3 cycles), tracked, re-approved before exhaustion
createApproveCheckedInstruction(ata, mint, delegate, owner, capBaseUnits, decimals);
```

### Charge once per period; enforce cadence

```typescript
// GOOD — idempotent per (subscription, period); prefer on-chain program for cadence/cap
if (await alreadyCharged(sub.id, period)) return;
const sig = await chargeOnce(sub, period);
await recordCharge(sub.id, period, sig);
```

Provide `revoke` (`createRevokeInstruction`) and stop the scheduler on cancellation.

## Finality

### Gate irreversible actions on `finalized`

```typescript
// BAD — ships goods on optimistic confirmation; a reorg claws back the pay
if (status === 'processed') shipOrder();

// GOOD
if (await isFinalized(connection, signature)) shipOrder(); // confirmed is fine for UI only
```

## Delivery

### Don't hand-roll the send loop — use the reliability stack

```typescript
// BAD — single send, no fee/CU/retry; payment silently drops under load
await connection.sendRawTransaction(tx.serialize());

// GOOD — dynamic fee + simulated CU + confirm/retry (solana-tx-skill golden path)
await sendReliably(connection, signedTx, lastValidBlockHeight);
```

## Type safety

### No `any`; explicit return types; bigint for u64 amounts

```typescript
async function verifyAndCredit(ref: PublicKey): Promise<{ credited: boolean; signature: string }> { /* ... */ }
```

---

**Remember:** verify on-chain, credit exactly once, integers for money, checked token ops, bounded approvals, finality before irreversible release, and land every send via solana-tx-skill.
