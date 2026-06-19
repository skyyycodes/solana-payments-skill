# Debugging Failed Transactions

> Layer 6. When a transaction fails or won't land, stop guessing and diagnose. This file is a triage flowchart, an error-code decode table, and the exact RPC calls to read what actually happened. Pairs with the [/diagnose-tx](../commands/diagnose-tx.md) command.

## Triage flowchart

```
Did you get a signature back?
├─ NO  → failure happened before/at submission
│        ├─ "Blockhash not found"        → blockhash stale/expired before send → fetch fresh, see send-and-confirm.md
│        ├─ Preflight simulation error    → it's a real on-chain error; jump to "Decode the error" below
│        ├─ "Transaction too large"       → >1232 bytes; use ALTs / fewer ixs / split
│        └─ RPC 429 / timeout             → rate-limited or RPC down; back off, switch endpoint
│
└─ YES → it was submitted; what's the status?
         ├─ Never confirmed, then expired  → DELIVERY problem, not a code bug
         │     → raise priority fee, tighten CU limit, add rebroadcast loop (send-and-confirm.md)
         │     → if still failing under heavy load, consider a Jito tip/bundle
         └─ Confirmed with err             → ON-CHAIN failure → "Decode the error" below
```

> The most important fork: **delivery problem** (expired, never confirmed) vs **on-chain failure** (`err` present). They have completely different fixes. Retrying an on-chain failure just wastes fees.

## Always start with simulation

Simulation is free and returns logs + the error + CUs consumed. Run it before sending, and re-run it on a failing signature's instructions.

```typescript
import { Connection, VersionedTransaction } from '@solana/web3.js';

async function explainSimulation(connection: Connection, tx: VersionedTransaction) {
  const sim = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });
  console.log('err:', sim.value.err);
  console.log('unitsConsumed:', sim.value.unitsConsumed);
  console.log('logs:\n' + (sim.value.logs ?? []).join('\n'));
  return sim.value;
}
```

The **program logs** are the single most useful artifact. Look for the last `Program ... failed` line and any `Program log:` lines just above it - that's almost always where the real reason is.

## Inspect a confirmed-but-failed signature

```typescript
async function fetchTx(connection: Connection, signature: string) {
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0, // REQUIRED for versioned txs, else you get null
    commitment: 'confirmed',
  });
  if (!tx) throw new Error('Tx not found (wrong cluster? not yet propagated? missing maxSupportedTransactionVersion?)');
  console.log('err:', tx.meta?.err);
  console.log('fee (lamports):', tx.meta?.fee);
  console.log('CUs:', tx.meta?.computeUnitsConsumed);
  console.log('logs:\n' + (tx.meta?.logMessages ?? []).join('\n'));
  return tx;
}
```

> **`maxSupportedTransactionVersion: 0` is mandatory.** Omitting it makes `getTransaction` return `null` for any versioned transaction - a very common "my tx disappeared" red herring.

## Error decode table

### Top-level / system errors

| Symptom | Meaning | Fix |
|---------|---------|-----|
| `BlockhashNotFound` / "Blockhash not found" | Blockhash expired or never recent | Fetch fresh `getLatestBlockhash` right before signing; bound retries by `lastValidBlockHeight` |
| `TransactionExpiredBlockheightExceededError` | Never landed before expiry | Delivery problem: raise fee, rebroadcast, tighten CU (send-and-confirm.md) |
| `Transaction too large` (>1232 bytes) | Too many ixs/accounts | Use Address Lookup Tables, split into multiple txs, or drop accounts |
| `Transaction simulation failed: ... exceeded ... compute units` | Hit the CU limit | Raise `setComputeUnitLimit` from a fresh simulation (compute-budget.md) |
| `AccountNotFound` | Referenced account doesn't exist | Create/initialize it first (e.g. ATA); check you're on the right cluster |
| `already been processed` | Duplicate of a tx that already landed | Usually benign in a rebroadcast loop - the original confirmed |

### Instruction errors (`InstructionError`)

`err` shaped like `{ InstructionError: [ixIndex, ...] }` - the first element is **which instruction** failed.

| `InstructionError` variant | Meaning | Common cause |
|----------------------------|---------|--------------|
| `"InsufficientFundsForRent"` | Account left below rent-exempt min | Fund the account / adjust lamports |
| `{ "Custom": N }` | Program-specific error code `N` | Decode against the program's error enum / IDL (see below) |
| `"ProgramFailedToComplete"` | Panic / ran out of CUs mid-execution | Raise CU limit; check for a program panic in logs |
| `"MissingRequiredSignature"` | A required signer didn't sign | Add the signer; check `isSigner` flags |
| `"AccountBorrowFailed"` | Account borrow conflict | Program bug / passing same account twice |
| `"PrivilegeEscalation"` | Tried to use an account with privileges it wasn't granted | Wrong signer/writable flags in the ix |

### The fee-payer classic: `Custom: 1` from the System Program

A `{ "Custom": 1 }` on a System Program instruction is **insufficient lamports** (e.g., can't pay for the transfer + fee + rent). Check the fee payer's balance.

## Decoding `Custom` program error codes

A `{ "Custom": 6000 }` is a program-defined error. To turn it into a human message:

- **Anchor programs:** Anchor error codes start at **6000** (= index 0 in the program's `#[error_code]` enum). Code `6000 + n` maps to the n-th error variant. The program's IDL (`idl.errors`) has the exact name + message. With the IDL loaded, Anchor clients usually surface the name automatically.
- **Native programs:** decode `N` against that program's published error enum.

```typescript
// Map an Anchor Custom code to its IDL error.
function decodeAnchorError(idl: { errors?: { code: number; name: string; msg?: string }[] }, code: number) {
  const e = idl.errors?.find((x) => x.code === code);
  return e ? `${e.name}: ${e.msg ?? ''} (code ${code})` : `Unknown custom error ${code}`;
}
```

## "It worked on devnet but not mainnet"

- Different account state (ATAs/PDAs that exist on devnet may not on mainnet) → simulate against mainnet.
- Higher congestion on mainnet → delivery problem, not a code bug. Apply the golden path.
- Different program IDs / lookup tables per cluster.

## Reading logs like a pro

- Each `Program <id> invoke [depth]` ... `Program <id> success|failed` pair brackets one program's execution. Failures cascade up; read the **innermost** failure.
- `Program log:` lines are `msg!`/`println`-style output from the program - the dev left clues here.
- `Program <id> consumed X of Y compute units` tells you exactly how close you were to the CU limit (relevant for `ProgramFailedToComplete`).

## Verify (you've actually diagnosed it)

- [ ] You determined delivery-failure vs on-chain-failure
- [ ] You read the program logs (sim or `getTransaction`)
- [ ] For `Custom` codes, you decoded against the IDL/error enum
- [ ] You used `maxSupportedTransactionVersion: 0` when fetching
- [ ] The fix matches the category (don't retry on-chain errors; don't "fix code" for delivery drops)

---

**Related:** [/diagnose-tx](../commands/diagnose-tx.md) automates this · delivery fixes → [send-and-confirm.md](send-and-confirm.md)
