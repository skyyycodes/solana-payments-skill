# Compute Budget

> Layer 2 of the reliability stack. Every transaction has a compute-unit (CU) ceiling. Set it **tightly** by simulating first. A tight limit lowers your fee, improves scheduler inclusion, and prevents "exceeded CUs" failures. Leaving the default is both a reliability and a cost bug.

## The defaults you must override

- Default CU limit: **200,000 CU per instruction**, capped at **1,400,000 CU per transaction**.
- If your transaction needs more than `200k × (number of instructions)`, it fails with an exceeded-CU error **unless** you raise the limit.
- If your transaction needs far less, the default makes you overpay (fee scales with the limit) and makes the tx look more expensive to schedule.

**Therefore: always set an explicit, simulated CU limit.** Don't guess.

## The two compute-budget instructions

Both come from the Compute Budget program and should be the **first instructions** in the transaction:

1. `setComputeUnitLimit(units)` - the ceiling. Set from simulation.
2. `setComputeUnitPrice(microLamports)` - the price (see [priority-fees.md](priority-fees.md)).

Fee math:

```
priority fee (lamports) = units × microLamports ÷ 1_000_000
total fee = base fee (5000 lamports/signature) + priority fee
```

## The pattern: simulate → measure → set limit + margin

### @solana/web3.js (classic)

```typescript
import {
  Connection,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';

/**
 * Build a versioned tx with a simulated, tight CU limit and a given CU price.
 * Returns the unsigned VersionedTransaction.
 */
async function buildWithBudget(
  connection: Connection,
  payer: PublicKey,
  instructions: TransactionInstruction[],
  microLamports: number,
): Promise<VersionedTransaction> {
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  // 1. Simulate with a max limit + the price ix, to measure real consumption.
  const simIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
    ...instructions,
  ];
  const simMsg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: simIxs,
  }).compileToV0Message();
  const sim = await connection.simulateTransaction(
    new VersionedTransaction(simMsg),
    { sigVerify: false, replaceRecentBlockhash: true },
  );

  if (sim.value.err) {
    throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs ?? []).join('\n')}`);
  }

  const consumed = sim.value.unitsConsumed ?? 200_000;
  // 2. Add ~10% headroom (program paths can vary slightly run-to-run).
  const units = Math.min(Math.ceil(consumed * 1.1), 1_400_000);

  // 3. Rebuild with the tight limit.
  const finalIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
    ...instructions,
  ];
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: finalIxs,
  }).compileToV0Message();

  return new VersionedTransaction(msg);
}
```

> `replaceRecentBlockhash: true` lets simulation succeed even if the blockhash is slightly stale, and `sigVerify: false` avoids needing signatures just to measure CUs.

### @solana/kit (modern)

Kit ships a helper factory that does the simulate-and-measure for you:

```typescript
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  prependTransactionMessageInstructions,
  estimateComputeUnitLimitFactory,
  type Rpc,
  type SolanaRpcApi,
} from '@solana/kit';
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';

async function buildWithBudget(
  rpc: Rpc<SolanaRpcApi>,
  feePayer,            // TransactionSigner
  instructions,       // Instruction[]
  microLamports: bigint,
) {
  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash({ commitment: 'confirmed' })
    .send();

  // Base message (no budget ixs yet).
  const base = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );

  // Measure CUs via the factory (simulates under the hood).
  const estimateComputeUnitLimit = estimateComputeUnitLimitFactory({ rpc });
  const consumed = await estimateComputeUnitLimit(base);
  const units = Math.min(Math.ceil(consumed * 1.1), 1_400_000);

  // Prepend the budget instructions.
  return prependTransactionMessageInstructions(
    [
      getSetComputeUnitLimitInstruction({ units }),
      getSetComputeUnitPriceInstruction({ microLamports }),
    ],
    base,
  );
}
```

## Anchor

Anchor's method builder accepts pre-instructions, which is the right place for the budget instructions:

```typescript
const microLamports = await estimateCuPrice(connection, writableAccounts);

await program.methods
  .doThing(args)
  .accounts({ /* ... */ })
  .preInstructions([
    ComputeBudgetProgram.setComputeUnitLimit({ units }), // from simulation
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
  ])
  .rpc();
```

> For accurate `units`, simulate first (Anchor exposes `.simulate()` / `.transaction()` to get a tx you can simulate), then rebuild with the measured limit. Don't ship a guessed constant.

## How much margin?

| Situation | Margin over `unitsConsumed` |
|-----------|-----------------------------|
| Deterministic instruction (transfer, fixed logic) | +5–10% |
| Branchy program (varies with state, account count) | +15–20% |
| Calls into unknown/3rd-party programs | +20–30%, and re-simulate close to send |

Too little margin → "exceeded CUs" failures when the path is slightly longer. Too much → overpay and worse scheduling. Measure, don't guess.

## Pitfalls

- **Skipping the limit instruction entirely.** You inherit `200k × ix_count` and overpay; large txs hit the per-tx cap and fail.
- **Simulating without the budget instructions, then sending with them.** The budget ixs themselves cost a tiny amount and change the account set; include them in simulation (or use kit's factory which accounts for it).
- **Reusing a stale CU estimate.** If program state changed (e.g., an account now needs initialization), the path lengthens. Re-simulate for high-value txs.
- **Putting budget ixs in the middle.** They should be first so the runtime applies them before execution. (The runtime reads them regardless of position, but first-is-conventional and avoids confusion.)
- **Confusing the two units.** `units` = compute units (the limit). `microLamports` = price per CU. They multiply into the fee.

## Verify

- [ ] CU limit is set from `unitsConsumed` in simulation, not hardcoded
- [ ] A sensible margin (10–20%) is added
- [ ] Both `setComputeUnitLimit` and `setComputeUnitPrice` are present
- [ ] Limit is capped at 1,400,000
- [ ] Simulation errors are surfaced (logs included), not swallowed

---

**Next:** get it confirmed reliably → [send-and-confirm.md](send-and-confirm.md)
