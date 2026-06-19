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

# TypeScript Standards for Solana Transaction Sending

Rules for client-side code that builds, signs, and sends Solana transactions. These encode the non-negotiables of the reliability stack.

## Fees & compute budget

### NEVER hardcode priority fees or CU limits

```typescript
// BAD — magic numbers; drops when the network moves, overpays otherwise
tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));
tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));

// GOOD — fee estimated from recent network data, limit from simulation
const microLamports = await estimateCuPrice(connection, writableAccounts); // clamped + fallback
const units = await simulateUnits(connection, ixs); // unitsConsumed * 1.1
tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units }));
```

### Always clamp the fee and provide a fallback

```typescript
const FLOOR = 10_000;     // µlamports/CU
const CEILING = 2_000_000;
return Math.min(Math.max(estimate || FLOOR, FLOOR), CEILING);
```

## Send & confirm

### NEVER send once and assume it landed

```typescript
// BAD — single send, no rebroadcast, no expiry handling
const sig = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(sig); // can hang / silently never lands

// GOOD — rebroadcast loop bounded by lastValidBlockHeight, polling statuses
const sig = await sendAndConfirm(connection, signedTx, lastValidBlockHeight, { commitment: 'confirmed' });
```

### Bound every retry loop by blockhash expiry

```typescript
// BAD — can loop forever
while (true) { await connection.sendRawTransaction(raw); await sleep(2000); }

// GOOD
const height = await connection.getBlockHeight('confirmed');
if (height > lastValidBlockHeight) throw new BlockhashExpiredError(sig);
```

### Retries must be idempotent

Resend the **same signed bytes** (same signature). Only rebuild with a new blockhash when the previous one expired. Never construct a fresh transaction that could double-execute the same intent.

### Distinguish delivery failures from on-chain failures

```typescript
try {
  return await sendAndConfirm(...);
} catch (e) {
  if (e instanceof BlockhashExpiredError) {
    // delivery problem → rebuild with new blockhash + higher fee
  } else {
    // on-chain error → decode it; DO NOT blindly retry
    throw e;
  }
}
```

## Transactions

### Use VersionedTransaction, not legacy Transaction

```typescript
// GOOD
const msg = new TransactionMessage({ payerKey, recentBlockhash, instructions }).compileToV0Message();
const tx = new VersionedTransaction(msg);
```

### Always pass maxSupportedTransactionVersion when reading

```typescript
// BAD — returns null for versioned txs
await connection.getTransaction(sig);

// GOOD
await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
```

## Type safety

### No `any`; explicit return types on async senders

```typescript
// BAD
async function send(tx): any {}

// GOOD
async function send(tx: VersionedTransaction): Promise<TransactionSignature> {}
```

### Use bigint / BN for u64; never JS number for lamport amounts at scale

```typescript
const lamports = 2_000_000_000n; // bigint for kit
// or new BN('2000000000') for web3.js/Anchor
```

### Custom error types for the lifecycle

```typescript
export class BlockhashExpiredError extends Error {
  constructor(public signature: string) {
    super(`Blockhash expired before confirmation (sig ${signature})`);
    this.name = 'BlockhashExpiredError';
  }
}
```

## SDK hygiene

### Don't mix classic and kit compute-budget APIs

```typescript
// BAD — classic ix in a kit pipeline (or vice-versa)
import { ComputeBudgetProgram } from '@solana/web3.js';
import { getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget';

// GOOD — pick one per code path based on package.json
```

### Tree-shakable imports

```typescript
// BAD
import * as web3 from '@solana/web3.js';
// GOOD
import { Connection, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
```

## Error handling

### Never swallow errors or fake success

```typescript
// BAD
try { await send(); } catch { return { ok: true }; } // hides drops

// GOOD — surface logs, let the caller decide
catch (e) {
  logger.error('send failed', { err: e, logs: simulation?.logs });
  throw e;
}
```

---

**Remember:** estimate fees, simulate CUs, rebroadcast until confirmed or expired, retry idempotently, and never confuse a delivery drop with an on-chain error.
