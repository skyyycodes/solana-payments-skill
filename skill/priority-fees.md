# Priority Fees

> Layer 1 of the reliability stack. A priority fee bids for block space. During congestion, transactions without a competitive priority fee are dropped by validators' scheduler. The fee must be **dynamic** - estimated from recent network data per transaction - never a hardcoded constant.

## How priority fees actually work

A transaction's priority fee is **not** a single number you set. It is derived from two compute-budget instructions:

```
priority fee (lamports) = computeUnitLimit × computeUnitPrice (µlamports/CU) ÷ 1_000_000
```

- `setComputeUnitPrice(microLamports)` - the **price per compute unit**, in micro-lamports. This is what you tune for urgency.
- `setComputeUnitLimit(units)` - the **max compute units** the tx may use. This is set for correctness/cost (see [compute-budget.md](compute-budget.md)), but it also multiplies the fee.

**Key consequence:** a tight CU limit means you pay less for the same CU *price*, and the scheduler sees a cheaper-to-include transaction. Always set both. Setting only the price while leaving the default 200k-per-instruction limit overpays.

This skill file is about choosing the **price**. The **limit** is covered in [compute-budget.md](compute-budget.md).

## Decision: where to get the fee estimate

| Source | Use when | Notes |
|--------|----------|-------|
| RPC `getRecentPrioritizationFees` | Default, provider-agnostic | Returns raw recent fees; you compute the percentile yourself |
| Helius `getPriorityFeeEstimate` | Using Helius RPC | Returns ready-to-use levels (low→veryHigh); account- and tx-aware |
| Triton / other provider APIs | Using that provider | Similar shape; check provider docs |
| Static fallback | Estimate call fails | Always have a sane floor so you never send a 0-fee tx in prod |

> **Rule:** estimate dynamically, clamp to a `[min, max]` range, and always have a fallback. Never ship a hardcoded fee.

## Pattern A — RPC `getRecentPrioritizationFees` (provider-agnostic)

`getRecentPrioritizationFees` returns prioritization fees (µlamports/CU) observed over recent slots. Crucially, pass the **writable accounts** your transaction locks - fees are localized to the accounts being contended, so account-aware estimates are far more accurate than global ones.

### @solana/web3.js (classic)

```typescript
import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Estimate CU price (micro-lamports per CU) from recent prioritization fees.
 * Pass the writable accounts the tx touches for a localized, accurate estimate.
 */
async function estimateCuPrice(
  connection: Connection,
  writableAccounts: PublicKey[],
  percentile = 0.75,
): Promise<number> {
  const recent = await connection.getRecentPrioritizationFees({
    lockedWritableAccounts: writableAccounts,
  });

  const fees = recent
    .map((r) => r.prioritizationFee)
    .filter((f) => f > 0)
    .sort((a, b) => a - b);

  if (fees.length === 0) return 10_000; // fallback floor

  const idx = Math.min(fees.length - 1, Math.floor(fees.length * percentile));
  const estimate = fees[idx];

  // Clamp: never below a floor, never above a sane ceiling.
  return Math.min(Math.max(estimate, 10_000), 2_000_000);
}
```

Then attach it (see [compute-budget.md](compute-budget.md) for the full instruction ordering):

```typescript
import { ComputeBudgetProgram } from '@solana/web3.js';

const microLamports = await estimateCuPrice(connection, writableAccounts);
const priceIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
```

### @solana/kit (modern)

```typescript
import { type Rpc, type SolanaRpcApi, type Address } from '@solana/kit';

async function estimateCuPrice(
  rpc: Rpc<SolanaRpcApi>,
  writableAccounts: Address[],
  percentile = 0.75,
): Promise<number> {
  const recent = await rpc
    .getRecentPrioritizationFees(writableAccounts)
    .send();

  const fees = recent
    .map((r) => Number(r.prioritizationFee))
    .filter((f) => f > 0)
    .sort((a, b) => a - b);

  if (fees.length === 0) return 10_000;

  const idx = Math.min(fees.length - 1, Math.floor(fees.length * percentile));
  return Math.min(Math.max(fees[idx], 10_000), 2_000_000);
}
```

Attach via the compute-budget program package:

```typescript
import { getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget';

const priceIx = getSetComputeUnitPriceInstruction({
  microLamports: BigInt(await estimateCuPrice(rpc, writableAccounts)),
});
```

## Pattern B — Helius `getPriorityFeeEstimate`

If the project uses Helius, prefer its estimate endpoint - it analyzes the actual accounts (or the serialized transaction) and returns calibrated levels.

```typescript
type PriorityLevel = 'Min' | 'Low' | 'Medium' | 'High' | 'VeryHigh' | 'UnsafeMax';

async function getHeliusPriorityFee(
  heliusRpcUrl: string, // e.g. https://mainnet.helius-rpc.com/?api-key=...
  base64Tx: string,
  level: PriorityLevel = 'High',
): Promise<number> {
  const res = await fetch(heliusRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'fee',
      method: 'getPriorityFeeEstimate',
      params: [
        {
          transaction: base64Tx, // or { accountKeys: [...] }
          options: { priorityLevel: level, transactionEncoding: 'base64' },
        },
      ],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Helius fee error: ${json.error.message}`);
  // priorityFeeEstimate is micro-lamports per CU
  return Math.ceil(json.result.priorityFeeEstimate);
}
```

> Passing the **serialized transaction** (rather than just account keys) gives Helius the full writable-account set and yields the most accurate estimate. Request `includeAllPriorityFeeLevels` if you want to display the spread to a user.

## Choosing a percentile / level

| Urgency | Percentile (Pattern A) | Helius level | Use case |
|---------|------------------------|--------------|----------|
| Background | ~p50 | `Medium` | Non-urgent, retriable jobs |
| Normal | ~p75 | `High` | Most user actions |
| Time-critical | ~p90+ | `VeryHigh` | Liquidations, arbitrage, mints at drop time |

> Higher is not always better: above the contended price you simply overpay. The right move under heavy congestion is often **higher CU price + retries + (optionally) a Jito tip**, not a single astronomical fee. See [jito-bundles.md](jito-bundles.md).

## Escalation on retry

When a transaction expires and you rebuild it (see [send-and-confirm.md](send-and-confirm.md)), **bump the fee** rather than resending the same bid:

```typescript
function escalate(microLamports: number, attempt: number): number {
  // +25% per attempt, capped.
  return Math.min(Math.ceil(microLamports * (1 + 0.25 * attempt)), 2_000_000);
}
```

## Pitfalls

- **Hardcoding the fee.** The #1 cause of "worked yesterday, drops today." Network conditions move; your fee must too.
- **Setting price but not limit.** You then pay `price × 200k` per instruction by default - often a large overpay. Always pair with a simulated CU limit.
- **Global (account-less) estimates.** Fees are localized. Always pass the writable accounts your tx locks.
- **No floor.** A momentary empty fee sample can yield `0`, producing a tx that never lands. Always clamp to a floor.
- **No ceiling.** A spike sample can drain fees. Always clamp to a ceiling and alert if you hit it.

## Verify

- [ ] Fee is derived from `getRecentPrioritizationFees` or a provider estimate API
- [ ] Estimate is account-aware (writable accounts passed)
- [ ] Result is clamped to `[floor, ceiling]`
- [ ] Fallback value exists for estimate failures
- [ ] Fee escalates on retry

---

**Next:** size the compute-unit limit → [compute-budget.md](compute-budget.md)
