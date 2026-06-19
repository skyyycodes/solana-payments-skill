# Choosing & Translating: @solana/web3.js vs @solana/kit

> Before writing any sending code, confirm which SDK the project uses. The two have **completely different APIs** for the exact patterns in this skill. Mixing them, or pasting kit code into a web3.js project, is a common source of confusion.

## Which is the project using?

Check `package.json`:

- `"@solana/web3.js": "^1.x"` → **classic** (a.k.a. "web3.js"). Class-based: `Connection`, `Transaction`, `VersionedTransaction`, `ComputeBudgetProgram`.
- `"@solana/kit": "^6.x"` → **modern** (formerly "web3.js v2", by Anza). Functional, tree-shakable: `createSolanaRpc`, `pipe`, transaction *messages*, signer abstractions, program packages like `@solana-program/compute-budget`. (Kit ships frequent majors; the patterns below are verified against the version pinned in [`examples/`](../examples).)

> A project can technically use both, but for transaction sending, pick one path and stay on it.

## Recommendation

| Scenario | Use |
|----------|-----|
| Existing codebase on web3.js 1.x | Stay on web3.js (don't rewrite to land a tx) |
| Greenfield / new code | **@solana/kit** - smaller bundles, better types, modern confirmation factories |
| Library that must support both | Keep transaction-building behind an interface; the patterns map 1:1 |

## Concept map (same idea, different API)

| Concept | @solana/web3.js (classic) | @solana/kit (modern) |
|---------|---------------------------|----------------------|
| RPC client | `new Connection(url)` | `createSolanaRpc(url)` |
| RPC subscriptions | built into `Connection` | `createSolanaRpcSubscriptions(wsUrl)` |
| A transaction | `Transaction` / `VersionedTransaction` | transaction **message** built via `pipe(...)` |
| Fee payer | `payerKey` / `feePayer` | `setTransactionMessageFeePayerSigner(signer, msg)` |
| Recent blockhash lifetime | `recentBlockhash` field | `setTransactionMessageLifetimeUsingBlockhash(bh, msg)` |
| Durable nonce lifetime | manual `nonceAdvance` first ix | `setTransactionMessageLifetimeUsingDurableNonce(...)` |
| Add instructions | `tx.add(ix)` / `TransactionMessage` | `appendTransactionMessageInstructions([...], msg)` |
| Prepend (budget ixs) | put first in array | `prependTransactionMessageInstructions([...], msg)` |
| Compute budget ixs | `ComputeBudgetProgram.setComputeUnit*` | `@solana-program/compute-budget`: `getSetComputeUnitLimit/PriceInstruction` |
| Estimate CUs | simulate, read `unitsConsumed` | `estimateComputeUnitLimitFactory({ rpc })` |
| Sign | `tx.sign([kp])` / wallet adapter | `signTransactionMessageWithSigners(msg)` |
| Get signature | `bs58` of `tx.signatures[0]` | `getSignatureFromTransaction(signedTx)` |
| Send + confirm | `sendRawTransaction` + custom loop | `sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })` |
| Recent priority fees | `connection.getRecentPrioritizationFees({ lockedWritableAccounts })` | `rpc.getRecentPrioritizationFees(addresses).send()` |
| Get sig statuses | `connection.getSignatureStatuses([sig])` | `rpc.getSignatureStatuses([sig]).send()` |
| Get tx | `connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 })` | `rpc.getTransaction(sig, { maxSupportedTransactionVersion: 0 }).send()` |

## Minimal end-to-end: @solana/kit

```typescript
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  prependTransactionMessageInstructions,
  estimateComputeUnitLimitFactory,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  assertIsTransactionWithBlockhashLifetime,
  sendAndConfirmTransactionFactory,
} from '@solana/kit';
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';

async function sendReliably(rpc, rpcSubscriptions, feePayerSigner, instructions, microLamports: bigint) {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();

  const base = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayerSigner, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );

  const estimate = estimateComputeUnitLimitFactory({ rpc });
  const units = Math.ceil((await estimate(base)) * 1.1);

  const withBudget = prependTransactionMessageInstructions(
    [getSetComputeUnitLimitInstruction({ units }), getSetComputeUnitPriceInstruction({ microLamports })],
    base,
  );

  const signed = await signTransactionMessageWithSigners(withBudget);
  const signature = getSignatureFromTransaction(signed);

  // Narrow the lifetime to a blockhash so the confirmer can bound its wait by expiry.
  assertIsTransactionWithBlockhashLifetime(signed);

  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  await sendAndConfirm(signed, { commitment: 'confirmed', skipPreflight: true });
  return signature;
}
```

## Minimal end-to-end: @solana/web3.js

See the full versions in [compute-budget.md](compute-budget.md) (build + simulate) and [send-and-confirm.md](send-and-confirm.md) (the rebroadcast loop). Classic web3.js does **not** ship a robust confirm-with-rebroadcast, so this skill's custom loop is the recommended path there.

## Interop note

If you must cross the boundary (e.g. a wallet returns a web3.js `VersionedTransaction` but your stack is kit), serialize to bytes and re-decode on the other side. Keep one SDK as the "source of truth" for building/sending and only convert at the edges. For deeper interop patterns, defer to solana-dev-skill's `kit-web3-interop.md`.

## Verify

- [ ] You confirmed the SDK from `package.json` before writing code
- [ ] You didn't mix `ComputeBudgetProgram` (classic) with `@solana-program/compute-budget` (kit) in the same path
- [ ] For greenfield, you recommended kit
- [ ] Boundary conversions (if any) happen only at the edges

---

**Back to:** [SKILL.md](SKILL.md)
