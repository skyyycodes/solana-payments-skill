---
name: solana-payments
description: Accept money on Solana that actually settles. The definitive playbook for commerce on Solana - Solana Pay (transfer & transaction requests), USDC/stablecoin payments with token accounts, delegate-based recurring subscriptions, shareable payment links, and fiat off-ramps. Covers @solana/web3.js (classic) and @solana/kit (modern), plus @solana/pay and @solana/spl-token. Emphasizes payment safety - exact-amount verification, idempotent (never double-charge) processing, bounded delegate approvals, and settlement finality. Use whenever building checkout, billing, subscriptions, invoices, payment links, or crypto-to-fiat. Builds on solana-tx-skill for reliable delivery.
user-invocable: true
---

# Solana Payments & Commerce Skill

> **The problem this owns:** there is no Stripe for Solana. The pieces to accept money - Solana Pay, USDC transfers, token-account creation, recurring billing, payment links, fiat off-ramp - are real but fragmented across separate docs, with no clean, safe playbook. Recurring billing in particular has **no native primitive**. This skill packages the whole "accept money on Solana" stack as concrete, current, copy-pasteable patterns - with payment-grade safety baked in.

> **Builds on**: [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill) owns the **delivery layer** (priority fees, compute budget, send/confirm/retry, idempotent landing). This skill owns the **commerce layer** on top of it: what to charge, how to request it, how to verify it settled, and how to bill on a recurring basis - safely. Whenever a payment must *land*, defer to solana-tx-skill's golden path.

## What This Skill Is For

Use this skill when the user is building:

### Accepting a payment
- "Let customers pay me in USDC / SOL"
- "Generate a Solana Pay QR / payment request for an order"
- "Build a checkout that confirms when the customer has paid"
- "Create a shareable payment link / invoice"

### Verifying & reconciling
- "How do I know order #123 was actually paid (right amount, right token)?"
- "Make sure I never credit the same payment twice"
- "When is a payment 'final' enough to ship the goods / unlock access?"

### Recurring & advanced
- "Charge $10/month - build subscriptions on Solana"
- "Let a relayer pull a recurring payment safely"
- "Let users cash out to a bank account (fiat off-ramp)"

> **Not in scope (delegate):**
> - *Getting a transaction to land reliably* → [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill) (this skill calls into it).
> - *On-chain program logic* (e.g. a custom subscription/escrow program) → solana-dev-skill. This skill specifies the design and the client side.
> - *Wallet UI / connection* → solana-dev-skill frontend.

## The Commerce Stack (mental model)

```
┌──────────────────────────────────────────────────────────────────┐
│  REQUEST     How you ask for money                                 │
│              Solana Pay transfer/tx request · payment link · QR    │  → solana-pay.md, payment-links.md
├──────────────────────────────────────────────────────────────────┤
│  ASSET       What moves                                            │
│              SOL · USDC / SPL / Token-2022 · ATAs · decimals       │  → usdc-payments.md
├──────────────────────────────────────────────────────────────────┤
│  SETTLE      Did it actually pay? (the part most people get wrong) │
│              reference lookup · exact-amount validation ·          │  → verifying-payments.md
│              idempotent crediting · finality                       │
├──────────────────────────────────────────────────────────────────┤
│  RECUR       Charge again later                                    │
│              delegate approval (bounded) · relayer / program pull  │  → subscriptions.md
├──────────────────────────────────────────────────────────────────┤
│  EXIT        Crypto → bank                                         │
│              off-ramp provider · deposit address · reconcile       │  → offramp-fiat.md
└──────────────────────────────────────────────────────────────────┘
        Every on-chain step DELIVERS via → solana-tx-skill (fees, confirm, retry)
```

## The Golden Rules of Payments (apply every time)

Money code is unforgiving. These five rules are the heart of the skill:

1. **Verify on-chain, never trust the client.** A "payment succeeded" callback in the browser proves nothing. Confirm the transaction on-chain with the **exact recipient, exact amount, exact mint, and your unique reference**. → [verifying-payments.md](verifying-payments.md)
2. **Be idempotent - never double-credit or double-charge.** Tie every payment to a unique `reference`/order id and record processed signatures, so a retry or duplicate webhook can't apply value twice. → [verifying-payments.md](verifying-payments.md)
3. **Bound every approval.** A subscription delegate must be approved for a *capped* amount with `approveChecked` (and ideally a program that enforces cadence). Never `approve` an unlimited amount. → [subscriptions.md](subscriptions.md)
4. **Match finality to irreversibility.** Use `confirmed` for UX feedback, but require `finalized` before you ship goods, unlock funds, or do anything you can't claw back. → [verifying-payments.md](verifying-payments.md)
5. **Land the transaction reliably.** Any send/charge/pull must go through the reliability stack (dynamic fee, simulate CU, rebroadcast/confirm loop, idempotent retry). → [solana-tx-skill golden path](https://github.com/skyyycodes/solana-tx-skill)

## Operating Procedure

### 1. Classify the request

| User signal | Primary skill file |
|-------------|--------------------|
| "Solana Pay / QR / transfer request / transaction request" | [solana-pay.md](solana-pay.md) |
| "payment link / invoice / shareable checkout" | [payment-links.md](payment-links.md) |
| "USDC / stablecoin / SPL / token account / ATA / decimals" | [usdc-payments.md](usdc-payments.md) |
| "did they pay / verify / confirm / reconcile / don't double-charge" | [verifying-payments.md](verifying-payments.md) |
| "subscription / recurring / monthly / auto-charge / delegate" | [subscriptions.md](subscriptions.md) |
| "off-ramp / cash out / withdraw to bank / fiat" | [offramp-fiat.md](offramp-fiat.md) |
| "what mint / provider / library / docs / endpoints" | [resources.md](resources.md) |
| "tx won't land / fees / confirm loop / retry" | defer to [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill) |

### 2. Confirm the basics before writing code

- **SDK**: `@solana/web3.js` (classic) vs `@solana/kit` (modern) - check `package.json`.
- **Cluster + token**: which mint? (USDC mainnet vs devnet differ - verify the address). → [resources.md](resources.md)
- **Who pays fees**: customer wallet, or a server fee-payer/relayer?
- **Custody**: are you taking custody (hot wallet/PDA) or is this peer-to-peer to the merchant?

### 3. Pick the right agent (optional, for larger tasks)

| Task | Agent | Model |
|------|-------|-------|
| Design a payment/billing/subscription flow safely (custody, delegate policy, settlement, reconciliation) | [payments-architect](../agents/payments-architect.md) | opus |
| Implement checkout / verification / subscription-charge code | [payments-engineer](../agents/payments-engineer.md) | sonnet |

### 4. Verify before declaring done

- [ ] Payment verified **on-chain** (recipient + amount + mint + reference), not from a client callback
- [ ] Crediting is **idempotent** (reference/signature dedup; safe under duplicate webhooks/retries)
- [ ] Token transfers use **`transferChecked`** (mint + decimals enforced), and the recipient **ATA** is handled
- [ ] Amounts use **integer base units** (bigint), never floats
- [ ] Subscription delegates are **bounded** (`approveChecked`, capped), revocable, and cadence-enforced
- [ ] **Finality** matches irreversibility (`finalized` before releasing value)
- [ ] The on-chain send goes through the **reliability stack** ([solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill))

## Commands

| Command | Description |
|---------|-------------|
| [/verify-payment](../commands/verify-payment.md) | Given a reference or signature, confirm a payment landed for the exact amount/mint/recipient, idempotently |
| [/payments-audit](../commands/payments-audit.md) | Audit checkout/subscription code for payment-safety gaps (trust-the-client, double-credit, unbounded approvals) |

## Agents

| Agent | Purpose |
|-------|---------|
| [payments-architect](../agents/payments-architect.md) | Designs payment/billing flows: custody model, settlement policy, delegate/subscription safety, reconciliation |
| [payments-engineer](../agents/payments-engineer.md) | Implements checkout, verification, and recurring-charge code against the skill patterns |

## Progressive Disclosure (read when needed)

### Requesting & accepting
- [solana-pay.md](solana-pay.md) - Solana Pay transfer & transaction requests, references, `@solana/pay`, QR
- [usdc-payments.md](usdc-payments.md) - USDC/SPL/Token-2022 transfers, ATAs, decimals, `transferChecked`
- [payment-links.md](payment-links.md) - Shareable links, invoices, hosted checkout patterns

### Settling & recurring
- [verifying-payments.md](verifying-payments.md) - The critical layer: find + validate + idempotent credit + finality
- [subscriptions.md](subscriptions.md) - Delegate-based recurring billing, safe approval limits, relayer vs program

### Exit & reference
- [offramp-fiat.md](offramp-fiat.md) - Crypto → fiat via off-ramp providers, deposit flows, reconciliation
- [resources.md](resources.md) - Mints, libraries, providers, docs, version reference

---

## Default Stack (June 2026)

| Layer | Choice |
|-------|--------|
| Payment protocol | Solana Pay (`@solana/pay`) for requests/QRs/verification |
| Token ops | `@solana/spl-token` (`transferChecked`, ATAs) |
| Stablecoin | USDC (verify mint per cluster) |
| Modern SDK | `@solana/kit` 6.x |
| Classic SDK | `@solana/web3.js` 1.95+ |
| Delivery | [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill) reliability stack |

> **Payment safety rule:** the browser saying "paid" is not proof. Nothing of value is released until the transaction is verified on-chain (exact amount/mint/recipient/reference) at the required finality, and recorded so it can never be applied twice.
