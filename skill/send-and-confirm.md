# Send & Confirm

> Layer 3 - the core of the skill. A signed transaction is not landed until it is confirmed. The single biggest reason transactions "don't land" is relying on a fire-and-forget `sendRawTransaction` (or a naive `sendAndConfirmTransaction`) and never rebroadcasting. The reliable pattern is a **send-and-rebroadcast loop bounded by blockhash expiry**.

## Why naive sending fails

`sendAndConfirmTransaction` / `sendRawTransaction` sends the transaction **once** to your RPC node. Under load:

- The RPC's internal forward may be dropped before reaching the current leader.
- The leader may be saturated and drop low-priority transactions.
- Your tx may simply not be retried by the network once your blockhash gets close to expiry.

The fix: **you** rebroadcast the same signed transaction every ~2 seconds until it confirms or its blockhash expires.

## Blockhash lifetime (the clock you race against)

- A transaction includes a `recentBlockhash`. It is valid only while that blockhash is within ~150 blocks (~60–90 seconds) of the tip.
- `getLatestBlockhash()` returns `{ blockhash, lastValidBlockHeight }`. `lastValidBlockHeight` is the **last block height at which the tx can still be included**.
- Your loop must stop when `getBlockHeight() > lastValidBlockHeight`. After that, the tx **can never land** - rebuild with a fresh blockhash.

> Because the signature is a function of the signed message (which includes the blockhash), **resending the same signed tx is idempotent** - it always produces the same signature, so duplicate sends can never double-execute. This is what makes the rebroadcast loop safe.

## The reliable send loop (@solana/web3.js)

```typescript
import {
  Connection,
  VersionedTransaction,
  TransactionSignature,
} from '@solana/web3.js';

interface SendOptions {
  /** Stop rebroadcasting after this commitment is reached. */
  commitment?: 'processed' | 'confirmed' | 'finalized';
  /** How often to rebroadcast, ms. */
  rebroadcastIntervalMs?: number;
}

/**
 * Send a signed VersionedTransaction and rebroadcast until confirmed or expired.
 * `lastValidBlockHeight` must come from the SAME getLatestBlockhash used to build the tx.
 */
async function sendAndConfirm(
  connection: Connection,
  signedTx: VersionedTransaction,
  lastValidBlockHeight: number,
  opts: SendOptions = {},
): Promise<TransactionSignature> {
  const commitment = opts.commitment ?? 'confirmed';
  const interval = opts.rebroadcastIntervalMs ?? 2000;
  const raw = signedTx.serialize();

  // We control retries ourselves, so disable RPC-side retry + preflight.
  const signature = await connection.sendRawTransaction(raw, {
    skipPreflight: true,
    maxRetries: 0,
  });

  const deadlinePoll = (async () => {
    while (true) {
      const { value } = await connection.getSignatureStatuses([signature]);
      const status = value[0];
      if (status) {
        if (status.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        const reached =
          status.confirmationStatus === commitment ||
          status.confirmationStatus === 'finalized' ||
          (commitment === 'confirmed' && status.confirmationStatus === 'confirmed') ||
          (commitment === 'processed' && status.confirmationStatus != null);
        if (reached) return signature;
      }
      await sleep(interval);

      // Expiry check: once the chain passes lastValidBlockHeight, give up.
      const height = await connection.getBlockHeight(commitment);
      if (height > lastValidBlockHeight) {
        throw new BlockhashExpiredError(signature);
      }
    }
  })();

  const rebroadcast = (async () => {
    while (true) {
      await sleep(interval);
      // Resending the identical signed tx is idempotent (same signature).
      try {
        await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
      } catch {
        /* transient send errors are fine; the poller decides success/failure */
      }
    }
  })();

  try {
    return await deadlinePoll;
  } finally {
    // poller resolved/threw; stop rebroadcasting
    void rebroadcast; // (in real code, use an AbortController to cancel this loop)
  }
}

class BlockhashExpiredError extends Error {
  constructor(public signature: string) {
    super(`Blockhash expired before confirmation (sig ${signature})`);
    this.name = 'BlockhashExpiredError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```

> In production, drive both loops with a single `AbortController` so the rebroadcast loop is cancelled the moment the poller resolves. The snippet keeps them separate for readability.

## The retry wrapper (rebuild on expiry)

Expiry is **not** a failure - it just means "try again with a fresh blockhash." Wrap the send in a rebuild loop, and escalate the fee each attempt:

```typescript
async function sendWithRetries(
  connection: Connection,
  build: (microLamports: number) => Promise<{ tx: VersionedTransaction; lastValidBlockHeight: number }>,
  sign: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  baseMicroLamports: number,
  maxAttempts = 4,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const microLamports = Math.ceil(baseMicroLamports * (1 + 0.25 * attempt));
    const { tx, lastValidBlockHeight } = await build(microLamports); // fresh blockhash each time
    const signed = await sign(tx);
    try {
      return await sendAndConfirm(connection, signed, lastValidBlockHeight);
    } catch (e) {
      if (e instanceof BlockhashExpiredError && attempt < maxAttempts - 1) {
        continue; // rebuild with new blockhash + higher fee
      }
      throw e; // real on-chain error → don't blindly retry; decode it
    }
  }
  throw new Error('Exhausted retries without confirmation');
}
```

> **Critical:** only retry on **expiry / send transport** errors. If the tx failed *on-chain* (`status.err`), retrying the same instructions will just fail again. Decode it instead → [debugging-failed-tx.md](debugging-failed-tx.md).

## @solana/kit version

Kit provides `sendAndConfirmTransactionFactory`, which implements a proper confirmation strategy (including expiry handling) for you. Prefer it unless you need custom rebroadcast control.

```typescript
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  sendAndConfirmTransactionFactory,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  assertIsTransactionWithBlockhashLifetime,
} from '@solana/kit';

const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const rpcSubscriptions = createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com');

const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

// `txMessage` already has a blockhash lifetime, fee payer, budget ixs (see compute-budget.md)
const signedTx = await signTransactionMessageWithSigners(txMessage);
const signature = getSignatureFromTransaction(signedTx);

// Kit widens the signed tx's lifetime to a union; narrow it back to a blockhash
// lifetime so the confirmer can bound its wait by lastValidBlockHeight.
assertIsTransactionWithBlockhashLifetime(signedTx);

await sendAndConfirm(signedTx, { commitment: 'confirmed', skipPreflight: true });
// Throws on expiry or on-chain error; signature is known up front.
```

For full control over rebroadcast cadence in kit, compose `sendTransactionWithoutConfirmingFactory` with `createBlockHeightExceedencePromiseFactory` and `createRecentSignatureConfirmationPromiseFactory`.

## Choosing the commitment

| Commitment | Meaning | Use for |
|------------|---------|---------|
| `processed` | Seen by a node, not yet voted | Optimistic UI only; can be rolled back |
| `confirmed` | Voted by supermajority of cluster | **Default** for most actions; ~fast and safe |
| `finalized` | Rooted, irreversible | Exchanges, bridges, anything that triggers off-chain value transfer |

> Use `confirmed` to gate UI and most flows; require `finalized` before doing something you can't undo (crediting a deposit, releasing funds).

## Polling vs WebSocket confirmation

- **WebSocket (`signatureSubscribe`)** - lowest latency; kit's factory uses it. Downside: connections drop; you must handle reconnects and still bound by expiry.
- **Polling (`getSignatureStatuses`)** - simplest and most robust; poll every ~2s. Use `getSignatureStatuses` (batchable up to 256 sigs) rather than `getSignatureStatus`.

For most backends, **polling is the pragmatic default**. For latency-sensitive UIs, WebSocket with a polling fallback.

## Preflight: when to skip

- `skipPreflight: true` is recommended **inside the rebroadcast loop** (you already simulated when sizing CUs; re-running preflight on every resend wastes time and can reject on a stale blockhash).
- Run **one** simulation up front (during CU sizing) to catch real errors early. Don't fly blind - skipping preflight is about retries, not about never validating.

## Pitfalls

- **`sendAndConfirmTransaction` once, then giving up.** The classic drop. Rebroadcast.
- **Mismatched blockhash / lastValidBlockHeight.** They must come from the same `getLatestBlockhash` call.
- **Infinite retry.** Always bound by `lastValidBlockHeight`; never loop forever.
- **Retrying on-chain failures.** Decode `status.err` first; retrying won't help.
- **Treating expiry as success or as fatal.** It's neither - it's "rebuild and retry."
- **Polling too aggressively.** ~2s is plenty; sub-second polling just burns RPC credits and rate limits.
- **Using legacy `Transaction` instead of `VersionedTransaction`.** Use versioned txs (v0) - required for Address Lookup Tables and the modern path.

## Verify

- [ ] Transaction is rebroadcast on an interval, not sent once
- [ ] Loop is bounded by `lastValidBlockHeight`
- [ ] Retries rebuild with a fresh blockhash (and escalate fee)
- [ ] On-chain errors are decoded, not retried
- [ ] Commitment matches the stakes of the action
- [ ] `getSignatureStatuses` (batch) used for polling

---

**Next:** long-lived/offline txs → [durable-nonces.md](durable-nonces.md) · atomic/MEV-protected delivery → [jito-bundles.md](jito-bundles.md)
