---
description: "Verify a Solana payment from a reference or signature - confirm it landed for the exact recipient, amount, and mint, then advise on idempotent crediting and finality"
---

You are verifying a Solana payment. The user provides a **reference** (Solana Pay) or a **transaction signature**, and ideally the **expected recipient, amount, and mint**. Your job: prove on-chain whether the correct payment settled, and advise safe crediting. Follow [verifying-payments.md](../skill/verifying-payments.md).

## Inputs to collect

- **Reference** (base58 pubkey) **or** **signature** (required — at least one)
- **Cluster**: mainnet-beta (default) / devnet / testnet
- **Expected recipient** (merchant wallet/owner)
- **Expected amount** (human units) + **mint** (e.g. USDC — verify per cluster, see [resources.md](../skill/resources.md))
- **RPC URL** (default to public; warn it may be rate-limited)

If only a reference is given, resolve it to a signature first. If neither recipient/amount/mint is given, you can still report what happened, but flag that you cannot confirm it's the *correct* payment without expectations.

## Step 1: Resolve reference → signature (if needed)

Using `@solana/pay` `findReference`, or by signature search on the reference account:

```bash
# By signature: fetch the tx (maxSupportedTransactionVersion REQUIRED or you get null)
curl -s <RPC_URL> -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc":"2.0","id":1,"method":"getTransaction",
  "params":["<SIG>",{"maxSupportedTransactionVersion":0,"commitment":"confirmed"}]
}'
```

If a reference (not signature) is provided, conceptually run `findReference(connection, reference, { finality: 'confirmed' })` to get the signature, then fetch as above. If nothing is found: the payment hasn't landed yet (keep polling) or it's on a different cluster — try the others.

## Step 2: Validate the transfer matches EXACTLY

Confirm **all** of the following from the fetched transaction:

| Check | How |
|-------|-----|
| Transaction **succeeded** | `meta.err === null` |
| Credits **your recipient** | the SPL transfer's destination ATA is owned by the expected recipient (or SystemProgram transfer to recipient for SOL) |
| **Exact amount** | parsed transfer amount == expected base units (`>=` only if overpayment is intentionally allowed) |
| **Correct mint** | the transfer's mint == expected mint (reject otherwise) |
| **Reference present** | the reference pubkey appears in the account keys (binds it to the order) |

Prefer `validateTransfer(connection, signature, { recipient, amount, splToken, reference }, { commitment })` which checks these together and throws on mismatch.

## Step 3: Advise finality

- If the action is reversible (UI/digital): `confirmed` is acceptable.
- If irreversible (ship goods / payout / off-ramp): require the tx to be **`finalized`** before releasing value.

## Step 4: Report

```markdown
## Payment verification: <reference|sig>

**Cluster:** <...>   **Status:** VERIFIED ✅ | MISMATCH ❌ | NOT FOUND / PENDING ⏳

**Evidence:**
- signature: <sig>
- success: <meta.err === null>
- recipient: <matches? expected vs actual>
- amount: <expected base units vs actual>
- mint: <expected vs actual>
- reference present: <yes/no>
- finality observed: processed | confirmed | finalized

**Verdict:** <one sentence — safe to credit, or why not>

**Safe crediting advice:**
- Idempotency: record signature `<sig>` with a unique constraint; do record+fulfill atomically.
- Finality: <ok at confirmed | wait for finalized because the action is irreversible>.

**Relevant skill file(s):** verifying-payments.md (+ usdc-payments.md / solana-pay.md as needed)
```

## Step 5: Offer follow-up

If verification passes, offer to hand the idempotent-crediting / webhook implementation to **payments-engineer**. If it fails (delivery never landed), point to [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill) to diagnose why the tx didn't confirm.

## Rules

- Always use `maxSupportedTransactionVersion: 0` when fetching.
- Never declare "paid" without matching recipient **and** amount **and** mint **and** success.
- A reference being present is not enough — validate the value moved.
- Recommend `finalized` before any irreversible release.
- Never advise crediting without signature-level idempotency.
