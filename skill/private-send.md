# Private Send (Payment Privacy)

> Solana is a **public ledger by default** — every payment exposes the amount, the sender, the receiver, and the time. For commerce that means anyone can read your revenue, your customer list, and your margins. "Private send" is really two separate goals with two different tools: **hide the amount** (Token-2022 Confidential Transfers) and **unlink the recipient** (one-time receiving addresses). This is legitimate financial privacy — not obfuscation of illicit funds; keep your AML/compliance obligations intact.

## First, the honest reality

There is **no fully anonymous payment** on a public chain without specialized ZK systems. Be precise about what each technique does and doesn't hide:

| Technique | Hides amount | Hides who paid | Hides who received | On-chain footprint |
|-----------|:---:|:---:|:---:|---|
| Default transfer | ❌ | ❌ | ❌ | Fully public |
| One-time receiving address | ❌ | ❌ | ⚠️ (until sweep) | Public; unlinkable *at rest* |
| Token-2022 Confidential Transfer | ✅ | ❌ | ❌ | Amounts encrypted, parties public |
| Both combined | ✅ | ❌ | ⚠️ | Best practical privacy |

Even combined, **timing, addresses, and the existence of a transfer remain visible.** Promise your users only what's true.

## Approach 1 — Confidential Transfers (hide the amount)

Token-2022 has a **Confidential Transfer** extension: balances and transfer amounts are **ElGamal-encrypted** and validated with zero-knowledge proofs, so the *amounts* aren't visible on-chain. Sender/receiver pubkeys still are. You can configure an optional **auditor** key so a designated party (you, a regulator) can decrypt amounts — important for compliance.

Lifecycle (conceptual — confirm exact APIs in [resources.md](resources.md); this surface evolves):

```
1. Mint is created WITH the ConfidentialTransfer extension (and optional auditor pubkey).
2. Each account is configured for confidential transfers (ElGamal + AES keys).
3. Deposit public balance → pending confidential balance, then "apply" to available.
4. Confidential transfer: amount encrypted; ZK proofs prove it's valid (no negative/overflow).
5. Withdraw back to a public balance when needed.
```

When to use: you need **amount privacy** (payroll, B2B invoices, not leaking pricing/revenue) while staying on a first-class, auditable Solana primitive. It does **not** hide who transacted.

## Approach 2 — One-time receiving addresses (unlink the recipient)

Give every order a **fresh receiving address** instead of one shared merchant wallet. An outside observer then can't trivially tie payments to each other or to your known identity. Later, sweep the funds to your treasury. Runnable: [examples/src/stealth-receive.ts](../examples/src/stealth-receive.ts).

```typescript
const addr = newReceivingAddress();             // fresh keypair per order (persist secret in KMS)
const payTo = await receivingAtaFor(addr.publicKey, usdcMint); // customer pays this
// ...later, once verified:
const ixs = await buildSweepToTreasury(connection, addr.publicKey, treasury, usdcMint, amount, relayer.publicKey);
// the one-time address holds no SOL → relayer is fee payer (see gasless-payments.md)
```

**The catch:** the **sweep links them on-chain** — all one-time addresses eventually flow to your treasury, so this is unlinkability *at rest*, not permanent anonymity. Mitigations: sweep on a delay/batch, or keep funds in the one-time accounts longer. It still defeats casual chain-watching of a single public storefront wallet.

This pairs naturally with [gasless-payments.md](gasless-payments.md): the one-time address never needs SOL because your relayer pays the sweep fee and the address only signs moving its own USDC.

## Approach 3 — Privacy protocols (proceed carefully)

ZK privacy layers and "shielded pool" protocols exist in the Solana ecosystem (e.g. compression/ZK tooling, confidential-compute networks). They change fast, and **mixer-style services carry real legal/compliance risk** (sanctions, AML). This skill does **not** help evade controls. If you adopt a third-party privacy protocol: verify it's active and reputable, understand its trust assumptions, keep records, and consult the compliance rules for your jurisdiction. Prefer the native primitives above.

## Compliance is not optional

Privacy ≠ evasion. For real businesses:
- Keep your own records/ledger ([receipts-ledger.md](receipts-ledger.md)) even when amounts are confidential on-chain.
- Use the **auditor key** with confidential transfers so amounts remain auditable to you/regulators.
- Apply the same KYC/AML/sanctions checks you would anywhere, especially before [off-ramping](offramp-fiat.md).

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Promising "anonymous" payments | False claims; parties/timing still public | State exactly what's hidden |
| One-time address with no SOL, no sponsor | Can't sweep | Fee-payer relayer ([gasless-payments.md](gasless-payments.md)) |
| Sweeping immediately, every time | Re-links instantly | Batch/delay sweeps |
| Confidential transfer, no auditor key | Can't satisfy compliance/audit | Configure an auditor key |
| Reusing the same "one-time" address | Defeats the purpose | Fresh address per order |
| Losing the one-time address secret | Funds stuck | Persist secrets in KMS, keyed by order |

## How this fits

Verification is unchanged for one-time addresses — you still confirm the exact transfer to that order's address ([verifying-payments.md](verifying-payments.md)) and credit idempotently. Confidential transfers change *what's visible*, not the gate. Sweeps land via the bundled delivery layer ([send-and-confirm.md](send-and-confirm.md)) and are sponsored via [gasless-payments.md](gasless-payments.md). Token mechanics live in [usdc-payments.md](usdc-payments.md); provider/spec links in [resources.md](resources.md).
