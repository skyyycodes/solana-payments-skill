---
description: "Diagnose a failed or stuck Solana transaction from its signature - fetch it, decode logs and error codes, and explain the root cause and fix"
---

You are diagnosing a Solana transaction. The user will provide a **transaction signature** (and optionally the cluster and RPC URL). Your job: determine exactly why it failed or didn't land, then prescribe the fix. Follow [debugging-failed-tx.md](../skill/debugging-failed-tx.md).

## Inputs to collect

- **Signature** (required)
- **Cluster**: mainnet-beta (default) / devnet / testnet
- **RPC URL**: default to the cluster's public RPC if not given (warn it may be rate-limited)
- **IDL** (optional): if the failing program is an Anchor program, an IDL lets you decode `Custom` error codes by name

If the signature is missing, ask for it before proceeding.

## Step 1: Fetch the transaction

```bash
# Replace <SIG>, <RPC_URL>. maxSupportedTransactionVersion is REQUIRED or you get null.
curl -s <RPC_URL> -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc":"2.0","id":1,"method":"getTransaction",
  "params":["<SIG>",{"maxSupportedTransactionVersion":0,"commitment":"confirmed"}]
}'
```

- If the result is `null`:
  - Wrong cluster? Try the other clusters.
  - Did the caller omit `maxSupportedTransactionVersion`? (common false "missing" for versioned txs)
  - Too new (not yet propagated) or too old (pruned)? Check an explorer.
- If you have programmatic access, prefer the SDK call (`getTransaction` with `maxSupportedTransactionVersion: 0`) from [debugging-failed-tx.md](../skill/debugging-failed-tx.md).

## Step 2: Classify — delivery failure vs on-chain failure

- **No transaction found / never confirmed / expired** → **delivery problem.** The code/instructions are likely fine; the tx never landed.
  - Prescribe: dynamic priority fee, tight CU limit, rebroadcast loop bounded by `lastValidBlockHeight`, optional Jito tip. → [send-and-confirm.md](../skill/send-and-confirm.md), [priority-fees.md](../skill/priority-fees.md)
- **Found with `meta.err`** → **on-chain failure.** Continue to decode.

## Step 3: Decode the error

From `meta.err` and `meta.logMessages`:

1. Identify the failing **instruction index** if it's an `InstructionError`.
2. Map the error using the table in [debugging-failed-tx.md](../skill/debugging-failed-tx.md):
   - System `Custom: 1` → insufficient lamports (fee payer balance).
   - `{ Custom: N }` with N ≥ 6000 → Anchor program error; if an IDL is provided, map `N` to its error name/message (`6000` = first variant).
   - `ProgramFailedToComplete` → panic or out-of-CUs; check `consumed X of Y compute units` in logs.
   - `MissingRequiredSignature`, `AccountNotFound`, `InsufficientFundsForRent`, etc. → per the table.
3. Read the **program logs** bottom-up: find the innermost `Program ... failed` and the `Program log:` lines just above it.

## Step 4: Report

Produce a concise diagnosis:

```markdown
## Diagnosis: <SIG>

**Category:** Delivery failure | On-chain failure
**Root cause:** <one sentence>

**Evidence:**
- err: <meta.err>
- failing instruction: <index + program>
- key logs:
  > <the 2-3 decisive log lines>
- CUs: consumed <X> of <Y>   (if relevant)
- fee paid: <lamports>        (if relevant)

**Fix:**
1. <concrete step>
2. <concrete step>

**Relevant skill file(s):** <links>
```

## Step 5: Offer to implement the fix

If the fix is code (e.g. add CU budgeting, raise fee, add rebroadcast loop, fund fee payer), offer to hand off to **tx-engineer** to implement it following the relevant skill file.

## Rules

- Always use `maxSupportedTransactionVersion: 0` when fetching.
- Never claim a cause without evidence from `err` or logs.
- Distinguish delivery vs on-chain before prescribing - the fixes are opposite.
- Don't suggest "just retry" for on-chain failures.
