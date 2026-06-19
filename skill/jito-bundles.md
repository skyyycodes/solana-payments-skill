# Jito Bundles & MEV Protection

> Layer 5 (alternative delivery). A Jito **bundle** is a list of up to 5 transactions executed **atomically, sequentially, and in order** by a Jito-Solana validator - all land or none do. Bundles also route around the public mempool, giving **MEV/front-running protection**. Use them when you need atomicity or protection; otherwise the standard RPC send loop is simpler and cheaper.

## When to use a bundle (and when not to)

| Need | Use a bundle? |
|------|---------------|
| Atomic multi-tx (e.g. setup + action that must not partially execute) | Yes |
| Front-running / sandwich protection on a swap | Yes |
| Guaranteed ordering of several txs | Yes |
| Just want one tx to land under load | **No** - use priority fee + rebroadcast loop ([send-and-confirm.md](send-and-confirm.md)). A Jito tip can *complement* this, but a bundle isn't required. |
| Time-critical single tx, want leader fast-path | Optional - Jito's `sendTransaction` (single tx + tip) can help |

> Bundles cost a **tip** (paid to the validator) on top of normal fees. Don't pay for atomicity you don't need.

## How bundles work

1. You assemble 1–5 fully-signed transactions.
2. **At least one** transaction must include a **tip**: a SOL transfer to one of Jito's tip accounts. Convention is to place the tip in the **last** transaction of the bundle (so it only pays if the preceding txs are valid in sequence).
3. You submit the bundle to a Jito **Block Engine** endpoint (region-specific).
4. If accepted, the bundle is executed atomically by the next Jito leader. If any tx fails or the bundle can't be placed, **none** land.

Key constraints:
- **Max 5 transactions** per bundle.
- All transactions must be **fully signed** and valid.
- Bundles are **all-or-nothing** and **ordered**.
- The **tip must be ≥ the minimum** (commonly 1000 lamports) and should be sized competitively during congestion.

## Tip accounts & sizing

Jito exposes a set of tip accounts (fetch the current list via the Block Engine `getTipAccounts` endpoint - **don't hardcode**, send the tip to a randomly chosen one to spread load). Tip **amount** should be dynamic: query Jito's tip-floor data and bid a percentile, similar to priority fees.

```typescript
// Fetch current tip accounts (do not hardcode the addresses).
async function getJitoTipAccounts(blockEngineUrl: string): Promise<string[]> {
  const res = await fetch(`${blockEngineUrl}/api/v1/bundles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTipAccounts', params: [] }),
  });
  const json = await res.json();
  return json.result as string[];
}

// Pick one at random to distribute tips.
function pickTipAccount(accounts: string[]): string {
  return accounts[Math.floor(Math.random() * accounts.length)];
}
```

## Adding a tip instruction

The tip is just a `SystemProgram.transfer` to a tip account, included in one of your bundle transactions (usually the last):

```typescript
import { SystemProgram, PublicKey, TransactionInstruction } from '@solana/web3.js';

function makeTipIx(payer: PublicKey, tipAccount: string, lamports: number): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: new PublicKey(tipAccount),
    lamports,
  });
}
```

## Submitting a bundle (raw JSON-RPC)

```typescript
import { VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

/** Submit up to 5 signed transactions as an atomic bundle. */
async function sendBundle(
  blockEngineUrl: string, // e.g. https://mainnet.block-engine.jito.wtf
  signedTxs: VersionedTransaction[],
): Promise<string> {
  if (signedTxs.length === 0 || signedTxs.length > 5) {
    throw new Error('A bundle must contain 1–5 transactions');
  }
  const encoded = signedTxs.map((tx) => bs58.encode(tx.serialize()));

  const res = await fetch(`${blockEngineUrl}/api/v1/bundles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendBundle', params: [encoded] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`sendBundle failed: ${json.error.message}`);
  return json.result as string; // bundleId
}
```

## Confirming a bundle

A bundle landing means **its transactions** confirmed. Poll bundle status, then verify the individual signatures on-chain.

```typescript
async function getBundleStatus(blockEngineUrl: string, bundleId: string) {
  const res = await fetch(`${blockEngineUrl}/api/v1/bundles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getInflightBundleStatuses',
      params: [[bundleId]],
    }),
  });
  return (await res.json()).result;
  // status transitions: Pending → Landed (or Failed / Invalid)
}
```

> A bundle that isn't landed within a few slots has effectively been dropped - rebuild with fresh blockhashes and a higher tip, just like the blockhash-expiry retry loop. The transactions still respect blockhash expiry.

## Using `jito-ts`

The `jito-ts` SDK wraps the Block Engine (searcher client) and handles bundle construction and tip accounts. Prefer it over raw JSON-RPC for production: it provides typed bundle building, tip-account fetching, and status streaming. Pick the Block Engine **region** closest to your infra (e.g. `ny`, `frankfurt`, `amsterdam`, `tokyo`) for lowest latency.

## Single-tx fast path

If you don't need atomicity but want Jito's leader fast-path + MEV protection for one transaction, include a tip instruction in that tx and submit it via Jito's `sendTransaction` (Block Engine) rather than a normal RPC. This is a lighter-weight alternative to a full bundle.

## Pitfalls

- **Hardcoding tip accounts.** Fetch them; they can change. Randomize across the set.
- **Tip too low during congestion.** Bundles compete on tip; a stale floor gets you skipped. Size the tip dynamically.
- **Forgetting the tip entirely.** A bundle with no tip is not accepted.
- **Assuming "submitted" = "landed".** Always confirm via bundle status **and** the individual signatures.
- **Overusing bundles.** For a single tx that just needs to land, the priority-fee + rebroadcast loop is simpler and cheaper. Reserve bundles for atomicity/MEV needs.
- **Ignoring blockhash expiry.** Bundle transactions still expire; rebuild on failure.

## Verify

- [ ] Bundle has 1–5 fully-signed transactions
- [ ] A tip instruction targets a freshly-fetched, randomly-chosen tip account
- [ ] Tip amount is dynamic (not a stale constant)
- [ ] Bundle status **and** individual signatures are confirmed
- [ ] A bundle is actually warranted (atomicity/MEV) vs a simpler send loop
- [ ] Region/endpoint chosen for latency

---

**Related:** fee sizing → [priority-fees.md](priority-fees.md) · base delivery → [send-and-confirm.md](send-and-confirm.md) · provider links → [resources.md](resources.md)
