---
name: solana-payments
description: Accept money on Solana that actually settles. The definitive playbook for commerce on Solana - Solana Pay (transfer & transaction requests), USDC and multi-stablecoin payments (USDC/PYUSD/EURC/USDe) with token accounts and Token-2022 transfer-fee accounting, delegate-based recurring subscriptions (with a tested reference on-chain program), shareable payment links, Actions & Blinks (payments-as-a-URL), mobile payments (Mobile Wallet Adapter), and fiat off-ramps. Includes the full transaction-delivery layer (priority fees, compute budget, send/confirm/retry, Jito bundles, durable nonces, failure debugging) so every payment lands reliably, plus treasury/key management, compliance/sanctions screening, an executable Vitest test suite, and CI. Covers @solana/web3.js (classic) and @solana/kit (modern), plus @solana/pay and @solana/spl-token. Emphasizes payment safety - exact-amount verification, idempotent (never double-charge) processing, bounded delegate approvals, and settlement finality. Use whenever building checkout, billing, subscriptions, invoices, payment links, Blinks, mobile/POS payments, or crypto-to-fiat.
user-invocable: true
---

# Solana Payments & Commerce Skill

> **The problem this owns:** there is no Stripe for Solana. The pieces to accept money - Solana Pay, USDC transfers, token-account creation, recurring billing, payment links, fiat off-ramp - are real but fragmented across separate docs, with no clean, safe playbook. Recurring billing in particular has **no native primitive**. This skill packages the whole "accept money on Solana" stack as concrete, current, copy-pasteable patterns - with payment-grade safety baked in.

> **Two layers, one skill**: this skill owns the **commerce layer** (what to charge, how to request it, how to verify it settled, how to bill recurringly - safely) **and bundles the delivery layer** (priority fees, compute budget, send/confirm/retry, Jito bundles, durable nonces, failure debugging) so every payment actually lands. The delivery guides/agents/commands were originally [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill) and are included here; whenever a payment must *land*, apply the delivery golden path → [send-and-confirm.md](send-and-confirm.md).

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

### Frontend & UX (make it usable)
- "Let customers pay in USDC **without holding any SOL**" (gasless)
- "Give me a React checkout component / payment status hook"
- "Notify my server the instant a payment lands" (webhooks)
- "Just give me a working checkout I can run" (starter app)
- "Keep payment amounts private / don't dox my revenue" (private send)
- "Share a pay button in X / Discord (Blink) / payment-as-a-URL" (Actions & Blinks)
- "Accept payments on a phone / in-person POS" (Mobile Wallet Adapter)

### Multi-stablecoin & token safety
- "Accept PYUSD / EURC / USDe, not just USDC"
- "This token charges a transfer fee / is Token-2022 — handle it right"

### Operations, trust & compliance
- "How do I secure the relayer/treasury keys?" (multisig, KMS, rotation)
- "Screen for sanctioned wallets before crediting / off-ramping" (OFAC, velocity)
- "Prove this actually works" (executable tests + CI)

### Getting it to land (bundled delivery layer)
- "My payment / charge times out or never confirms"
- "What priority fee should I set? am I overpaying?"
- "Out of compute units / tx too large"
- "Atomic bundle / MEV protection / Jito"
- "Why did transaction `<sig>` fail?"

> **Not in scope (delegate):**
> - *On-chain program logic* (e.g. a custom subscription/escrow program) → solana-dev-skill. This skill specifies the design and the client side (a reference Anchor program is in [examples/subscription-program](../examples/subscription-program)).
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
├──────────────────────────────────────────────────────────────────┤
│  DELIVER     Make every on-chain step LAND (bundled)               │
│              priority fee · compute budget · confirm/retry ·       │  → send-and-confirm.md, priority-fees.md,
│              Jito bundles · durable nonces · failure debugging     │    compute-budget.md, jito-bundles.md, debugging-failed-tx.md
└──────────────────────────────────────────────────────────────────┘
```

## The Golden Rules of Payments (apply every time)

Money code is unforgiving. These five rules are the heart of the skill:

1. **Verify on-chain, never trust the client.** A "payment succeeded" callback in the browser proves nothing. Confirm the transaction on-chain with the **exact recipient, exact amount, exact mint, and your unique reference**. → [verifying-payments.md](verifying-payments.md)
2. **Be idempotent - never double-credit or double-charge.** Tie every payment to a unique `reference`/order id and record processed signatures, so a retry or duplicate webhook can't apply value twice. → [verifying-payments.md](verifying-payments.md)
3. **Bound every approval.** A subscription delegate must be approved for a *capped* amount with `approveChecked` (and ideally a program that enforces cadence). Never `approve` an unlimited amount. → [subscriptions.md](subscriptions.md)
4. **Match finality to irreversibility.** Use `confirmed` for UX feedback, but require `finalized` before you ship goods, unlock funds, or do anything you can't claw back. → [verifying-payments.md](verifying-payments.md)
5. **Land the transaction reliably.** Any send/charge/pull must go through the bundled reliability stack (dynamic fee, simulate CU, rebroadcast/confirm loop, idempotent retry). → [send-and-confirm.md](send-and-confirm.md)

## Operating Procedure

### 1. Classify the request

| User signal | Primary skill file |
|-------------|--------------------|
| "Solana Pay / QR / transfer request / transaction request" | [solana-pay.md](solana-pay.md) |
| "Blink / Action / pay button in X or Discord / payment-as-a-URL / actions.json" | [actions-blinks.md](actions-blinks.md) |
| "mobile / phone / POS / in-person / Mobile Wallet Adapter / Seed Vault / deep link" | [mobile-payments.md](mobile-payments.md) |
| "payment link / invoice / shareable checkout" | [payment-links.md](payment-links.md) |
| "USDC / stablecoin / SPL / token account / ATA / decimals" | [usdc-payments.md](usdc-payments.md) |
| "PYUSD / EURC / USDe / multiple stablecoins / which mint" | [stablecoins.md](stablecoins.md) |
| "Token-2022 / transfer fee / transfer hook / extension / received less than sent" | [token-2022-payments.md](token-2022-payments.md) |
| "pay without SOL / gasless / fee payer / relayer sponsors fees" | [gasless-payments.md](gasless-payments.md) |
| "React / frontend / checkout component / wallet button / payment UI" | [react-checkout.md](react-checkout.md) |
| "webhook / Helius / real-time notify / event handler" | [webhooks.md](webhooks.md) |
| "private / confidential / hide amount / anonymous / stealth address" | [private-send.md](private-send.md) |
| "did they pay / verify / confirm / reconcile / don't double-charge" | [verifying-payments.md](verifying-payments.md) |
| "subscription / recurring / monthly / auto-charge / delegate" | [subscriptions.md](subscriptions.md) |
| "refund / dispute / chargeback / money back" | [refunds.md](refunds.md) |
| "marketplace / fee split / platform fee / royalty / payout to seller" | [marketplace-payments.md](marketplace-payments.md) |
| "accept any token / swap to USDC / they hold SOL not USDC" | [accepting-any-token.md](accepting-any-token.md) |
| "price in USD / fiat-priced / oracle / SOL price / Pyth" | [pricing-oracles.md](pricing-oracles.md) |
| "ledger / receipt / accounting / export / reporting" | [receipts-ledger.md](receipts-ledger.md) |
| "off-ramp / cash out / withdraw to bank / fiat" | [offramp-fiat.md](offramp-fiat.md) |
| "treasury / key management / multisig / Squads / KMS / relayer key / rotation / alerting" | [treasury-keys.md](treasury-keys.md) |
| "sanctions / OFAC / screening / compliance / risk / velocity limit / blocklist" | [compliance-screening.md](compliance-screening.md) |
| "coming from Stripe / how does X map / migrate from Stripe" | [from-stripe.md](from-stripe.md) |
| "test / devnet / how do I try this / unit test / CI / prove it works" | [testing.md](testing.md) |
| "is this safe / attack / replay / threat model / security" | [threat-model.md](threat-model.md) |
| "tx won't land / times out / dropped / confirm loop / retry" | [send-and-confirm.md](send-and-confirm.md) |
| "priority fee / how much to pay / overpaying" | [priority-fees.md](priority-fees.md) |
| "out of compute / CU / tx too large" | [compute-budget.md](compute-budget.md) |
| "atomic / bundle / MEV / front-run / sandwich" | [jito-bundles.md](jito-bundles.md) |
| "offline sign / nonce / blockhash expires too fast" | [durable-nonces.md](durable-nonces.md) |
| "why did tx `<sig>` fail / decode this error" | [debugging-failed-tx.md](debugging-failed-tx.md) |
| "web3.js vs kit / which SDK / migrate" | [kit-vs-web3js.md](kit-vs-web3js.md) |
| "what mint / provider / library / docs / endpoints" | [resources.md](resources.md) |

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
| Design a reliable sender / delivery strategy (Jito vs RPC, retry/confirm, under-load) | [tx-reliability-architect](../agents/tx-reliability-architect.md) | opus |
| Implement/refactor the send-and-confirm module, fee logic, retries | [tx-engineer](../agents/tx-engineer.md) | sonnet |

### 4. Verify before declaring done

- [ ] Payment verified **on-chain** (recipient + amount + mint + reference), not from a client callback
- [ ] Crediting is **idempotent** (reference/signature dedup; safe under duplicate webhooks/retries)
- [ ] Token transfers use **`transferChecked`** (mint + decimals enforced), and the recipient **ATA** is handled
- [ ] Amounts use **integer base units** (bigint), never floats
- [ ] Subscription delegates are **bounded** (`approveChecked`, capped), revocable, and cadence-enforced
- [ ] **Finality** matches irreversibility (`finalized` before releasing value)
- [ ] The on-chain send goes through the **bundled reliability stack** (dynamic fee, simulated CU, bounded rebroadcast/confirm loop, idempotent retry) → [send-and-confirm.md](send-and-confirm.md)

## Commands

| Command | Description |
|---------|-------------|
| [/verify-payment](../commands/verify-payment.md) | Given a reference or signature, confirm a payment landed for the exact amount/mint/recipient, idempotently |
| [/payments-audit](../commands/payments-audit.md) | Audit checkout/subscription code for payment-safety gaps (trust-the-client, double-credit, unbounded approvals) |
| [/build-checkout](../commands/build-checkout.md) | Scaffold a full checkout: Solana Pay request + USDC transfer + server-side verification gate |
| [/setup-subscription](../commands/setup-subscription.md) | Scaffold safe recurring billing: bounded approval, per-period idempotent charge, revoke, optional on-chain cadence |
| [/reconcile](../commands/reconcile.md) | Diff your ledger against the chain to catch missed payments, double-credits, and orphaned transfers |
| [/diagnose-tx](../commands/diagnose-tx.md) | Given a transaction signature, fetch it, decode logs + error codes, and explain the root cause + fix |
| [/tx-health-check](../commands/tx-health-check.md) | Audit a codebase's send/confirm code against the delivery reliability checklist |

## Agents

| Agent | Purpose |
|-------|---------|
| [payments-architect](../agents/payments-architect.md) | Designs payment/billing flows: custody model, settlement policy, delegate/subscription safety, reconciliation |
| [payments-engineer](../agents/payments-engineer.md) | Implements checkout, verification, and recurring-charge code against the skill patterns |
| [tx-reliability-architect](../agents/tx-reliability-architect.md) | Designs the delivery strategy: fee policy, retry/confirm design, Jito-vs-RPC, under-load behavior |
| [tx-engineer](../agents/tx-engineer.md) | Implements/refactors the sender: fee estimation, CU budgeting, send/confirm loops, bundles |

## Progressive Disclosure (read when needed)

### Requesting & accepting
- [solana-pay.md](solana-pay.md) - Solana Pay transfer & transaction requests, references, `@solana/pay`, QR
- [actions-blinks.md](actions-blinks.md) - Solana Actions & Blinks: payment-as-a-URL, GET/POST handlers, `actions.json`, CORS
- [usdc-payments.md](usdc-payments.md) - USDC/SPL/Token-2022 transfers, ATAs, decimals, `transferChecked`
- [stablecoins.md](stablecoins.md) - Multi-stablecoin (USDC/PYUSD/EURC/USDe): pin mints, token program, decimals
- [token-2022-payments.md](token-2022-payments.md) - Transfer fees (net-of-fee), transfer hooks, the allowlist stance
- [payment-links.md](payment-links.md) - Shareable links, invoices, hosted checkout patterns
- [gasless-payments.md](gasless-payments.md) - Fee abstraction: customer pays USDC with no SOL (relayer co-signs)
- [react-checkout.md](react-checkout.md) - Drop-in React checkout component + `usePayment` hook + status state machine
- [mobile-payments.md](mobile-payments.md) - Mobile Wallet Adapter, deep links/QR, Seed Vault, in-person POS
- [webhooks.md](webhooks.md) - Real-time settlement via provider webhooks (auth, idempotency, fast 200)
- [private-send.md](private-send.md) - Payment privacy: confidential amounts (Token-2022) + one-time receiving addresses (+ compliance)

### Settling & recurring
- [verifying-payments.md](verifying-payments.md) - The critical layer: find + validate + idempotent credit + finality
- [subscriptions.md](subscriptions.md) - Delegate-based recurring billing, safe approval limits, relayer vs program
- [refunds.md](refunds.md) - Idempotent refunds, partial refunds, disputes (no chargebacks)
- [receipts-ledger.md](receipts-ledger.md) - The payment ledger, receipts, exports, reconciliation backbone

### Advanced commerce
- [marketplace-payments.md](marketplace-payments.md) - Atomic fee splits, royalties, multi-party payouts
- [accepting-any-token.md](accepting-any-token.md) - Accept any token, auto-swap to USDC (Jupiter)
- [pricing-oracles.md](pricing-oracles.md) - Fiat-priced checkout, price feeds, quote locking
- [threat-model.md](threat-model.md) - Attacker's-eye view: every attack → its defense

### Operations, trust & compliance
- [treasury-keys.md](treasury-keys.md) - Multisig treasury (Squads), KMS/Turnkey relayer keys, hot/cold split, rotation, alerting
- [compliance-screening.md](compliance-screening.md) - Sanctions/OFAC + velocity screening: screen → decide → record

### Delivery layer (bundled — make every payment land)
- [send-and-confirm.md](send-and-confirm.md) - Blockhash lifetime, rebroadcast loop, confirmation strategy, idempotent retries
- [priority-fees.md](priority-fees.md) - Dynamic fee estimation (RPC / Helius), percentile strategy, clamping
- [compute-budget.md](compute-budget.md) - Simulate → tight CU limit, CU price, the fee math
- [jito-bundles.md](jito-bundles.md) - Atomic bundles, tips, MEV protection, when (not) to use
- [durable-nonces.md](durable-nonces.md) - Offline signing / long-lived transactions
- [kit-vs-web3js.md](kit-vs-web3js.md) - Choosing/translating between `@solana/web3.js` and `@solana/kit`
- [debugging-failed-tx.md](debugging-failed-tx.md) - Simulation, log reading, error-code decode, triage

### Exit & reference
- [offramp-fiat.md](offramp-fiat.md) - Crypto → fiat via off-ramp providers, deposit flows, reconciliation
- [from-stripe.md](from-stripe.md) - Stripe → Solana concept map for migrants
- [testing.md](testing.md) - Devnet + unit testing the patterns (idempotency, cadence, math)
- [resources.md](resources.md) - Mints, libraries, providers, docs, version reference

### Runnable code (type-checked **and unit-tested in CI** — 36 tests)
- [examples/](../examples) - Type-checked commerce (`checkout.ts`, `verify-and-credit.ts`, `subscription.ts`, `marketplace.ts`), tokens (`token2022.ts`, `stablecoins.ts`), distribution (`actions-handler.ts`), compliance (`screening.ts`), gasless (`gasless-relayer.ts`), privacy (`stealth-receive.ts`), UI (`use-payment.ts`, `react-checkout.tsx`), `webhook-handler.ts`, + delivery (`reliable-web3js.ts`, `reliable-kit.ts`, `devnet-demo.ts`)
- [examples/test/](../examples/test) - **Vitest suite**: amount math, fee splits, webhook idempotency, subscription cadence/cap, Token-2022 fee accounting, screening, Actions, stablecoin registry (`npm test`)
- [examples/starter/](../examples/starter) - **0→10min** end-to-end checkout app (create order → on-chain verify → drop-in page)
- [examples/subscription-program/](../examples/subscription-program) - Reference Anchor program with **`cargo test` cadence unit tests + clock-warped bankrun integration tests** + build/deploy guide
- [.github/workflows/ci.yml](../.github/workflows/ci.yml) - CI: type-check + test the examples + markdown link check on every push/PR

---

## Default Stack (June 2026)

| Layer | Choice |
|-------|--------|
| Payment protocol | Solana Pay (`@solana/pay`) for requests/QRs/verification |
| Token ops | `@solana/spl-token` (`transferChecked`, ATAs); resolve the owning program (SPL Token vs Token-2022) |
| Stablecoin | USDC default; PYUSD/EURC/USDe supported — pin mint per cluster → [stablecoins.md](stablecoins.md) |
| Distribution | Solana Pay QR + Actions/Blinks (`@solana/actions`) for shareable pay buttons |
| Mobile | Mobile Wallet Adapter (`@solana-mobile/*`) + Solana Pay QR for POS |
| Treasury/keys | Squads multisig treasury; KMS/Turnkey for hot relayer; hot/cold split → [treasury-keys.md](treasury-keys.md) |
| Compliance | Sanctions + velocity screening before crediting/off-ramp → [compliance-screening.md](compliance-screening.md) |
| Tests/CI | Vitest (`examples/`) + GitHub Actions; `cargo test` + bankrun for the program |
| Modern SDK | `@solana/kit` 6.x + `@solana-program/compute-budget` |
| Classic SDK | `@solana/web3.js` 1.95+ (`VersionedTransaction`) |
| Delivery | Bundled reliability stack — custom send loop + `getSignatureStatuses` polling → [send-and-confirm.md](send-and-confirm.md) |
| Fee source | RPC `getRecentPrioritizationFees` or Helius `getPriorityFeeEstimate` |
| Bundles | Jito Block Engine + `jito-ts` (when atomicity/MEV needed) |

> **Payment safety rule:** the browser saying "paid" is not proof. Nothing of value is released until the transaction is verified on-chain (exact amount/mint/recipient/reference) at the required finality, and recorded so it can never be applied twice.
