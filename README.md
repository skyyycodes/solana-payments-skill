# Solana Payments Skill (`solana-payments-skill`)

[![CI](https://github.com/skyyycodes/solana-payments-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/skyyycodes/solana-payments-skill/actions/workflows/ci.yml)

A Claude Code / Codex (and any kit-compatible coding agent) **skill** that turns your AI assistant into a specialist at the thing Solana still has no Stripe for: **accepting money that provably settles** — checkout, USDC payments, payment links, recurring subscriptions, and fiat off-ramps — built with payment-grade safety.

> **Verified:** the `examples/` are type-checked and unit-tested in CI (amount math, idempotency, cadence/cap, screening, Actions) against `@solana/kit` 6.x · `@solana/web3.js` 1.98.x · `@solana/spl-token` 0.4.x — last verified 2026-06-20.

> **In one sentence:** there is no "Stripe for Solana." The building blocks (Solana Pay, USDC transfers, token-account creation, recurring billing, payment links, off-ramps) exist but are fragmented across separate docs, and recurring billing has **no native primitive** at all. This skill packages the whole "accept money on Solana" stack as concrete, current, copy-pasteable patterns — with the non-negotiable safety rules (verify on-chain, credit exactly once, bound every approval, finalize before releasing value) baked into every flow.

Built to slot into the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit). It owns the *commerce* layer (what to charge and how to verify it) **and bundles the *delivery* layer** (getting each transaction to land reliably — dynamic fees, compute budget, send/confirm/retry, Jito bundles, durable nonces, failure debugging). The delivery layer originated as [`solana-tx-skill`](https://github.com/skyyycodes/solana-tx-skill) and is included here, so this is a **single, self-contained commerce backend** — no second skill required.

---

## Table of contents

- [Why this skill exists](#why-this-skill-exists)
- [Who it's for](#who-its-for)
- [Two layers in one skill (commerce + delivery)](#two-layers-in-one-skill-commerce--delivery)
- [The commerce stack (mental model)](#the-commerce-stack-mental-model)
- [The golden rules of payments](#the-golden-rules-of-payments)
- [What's included](#whats-included)
- [How progressive disclosure works](#how-progressive-disclosure-works)
- [Installation](#installation)
- [Usage](#usage)
- [The five flows, in depth](#the-five-flows-in-depth)
- [Design principles](#design-principles)
- [FAQ](#faq)
- [Glossary](#glossary)
- [Compatibility & requirements](#compatibility--requirements)
- [Repository structure](#repository-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Why this skill exists

Ask any Solana founder building commerce — a store, a SaaS, a marketplace, a creator tool — and you hit the same wall: **how do I actually take money, and know I got paid?** On web2, Stripe answers this in three lines. On Solana the answer is spread across the Solana Pay spec, the SPL Token docs, ATA mechanics, delegate approvals, and a dozen provider blog posts. There is no single, safe playbook — and the sharpest gap of all, **recurring billing, has no native primitive.**

Worse, payments is exactly the domain where a careless AI suggestion costs real money:

- Crediting an order from a **client-side "payment succeeded"** callback — trivially forged, instant free goods.
- **Double-crediting** because a webhook fired twice and there was no signature dedup.
- Approving an **unlimited** delegate for a subscription — one leaked key drains the wallet.
- Paying in the **wrong token** because the mint was never asserted.
- Shipping goods on an **optimistic** confirmation that later gets rolled back.

This skill encodes the correct, current patterns *and* the guardrails, so the agent builds checkout and billing that fail safe instead of catastrophically.

---

## Who it's for

- **Founders & engineers building commerce on Solana** — stores, SaaS, marketplaces, creator monetization, donations.
- **Anyone who needs recurring revenue** — subscriptions/usage billing, where Solana has no native answer.
- **Teams integrating crypto payments** into an existing product who want a safe checkout + verification gate.
- **Coding-agent users** who want the agent to stop emitting "trust the client" payment code and instead verify on-chain, idempotently.

You don't need to be a payments expert — that's the point. The skill encodes the safety.

---

## Two layers in one skill (commerce + delivery)

This skill is a **complete commerce backend** in one install — both the "what" and the "how it lands":

```
┌─────────────────────────────────────────────────────────┐
│  COMMERCE layer   ← the "WHAT" (product/flows)           │
│  Solana Pay · USDC · subscriptions · links · refunds ·   │
│  marketplace · off-ramp                                  │
│  + the safety: verify on-chain, credit once, bound approvals
├─────────────────────────────────────────────────────────┤
│  DELIVERY layer   ← the "HOW IT LANDS" (bundled)         │
│  priority fees · compute budget · confirm/retry ·        │
│  Jito bundles · durable nonces · failure debugging       │
└─────────────────────────────────────────────────────────┘
        every commerce flow LANDS via the delivery layer
```

The delivery layer (guides, agents, commands, examples) originated as [`solana-tx-skill`](https://github.com/skyyycodes/solana-tx-skill) and is **bundled here** — every transfer, approval, recurring charge, and off-ramp deposit lands through the same reliability golden path (dynamic fee → simulated CU → bounded rebroadcast/confirm loop → idempotent retry). You don't need to install anything else.

---

## The commerce stack (mental model)

The skill is organized around the five things every payment system does. The agent loads only the layer a task touches.

```
┌──────────────────────────────────────────────────────────────────┐
│  REQUEST     How you ask for money                                 │  → solana-pay.md, payment-links.md
│              Solana Pay transfer/tx request · payment link · QR    │
├──────────────────────────────────────────────────────────────────┤
│  ASSET       What moves                                            │  → usdc-payments.md
│              SOL · USDC / SPL / Token-2022 · ATAs · decimals       │
├──────────────────────────────────────────────────────────────────┤
│  SETTLE      Did it actually pay? (most-botched part)              │  → verifying-payments.md
│              reference lookup · exact validation · idempotent      │
│              credit · finality                                     │
├──────────────────────────────────────────────────────────────────┤
│  RECUR       Charge again later                                    │  → subscriptions.md
│              delegate approval (bounded) · relayer / program pull  │
├──────────────────────────────────────────────────────────────────┤
│  EXIT        Crypto → bank                                         │  → offramp-fiat.md
│              off-ramp provider · deposit address · reconcile       │
├──────────────────────────────────────────────────────────────────┤
│  DELIVER     Make every on-chain step LAND (bundled)              │  → send-and-confirm.md, priority-fees.md,
│              fee · compute budget · confirm/retry · Jito · nonce   │    compute-budget.md, jito-bundles.md, …
└──────────────────────────────────────────────────────────────────┘
```

---

## The golden rules of payments

These five rules are the heart of the skill and appear in every flow:

1. **Verify on-chain, never trust the client.** A browser "payment succeeded" proves nothing. Confirm the transaction on-chain with the **exact recipient, amount, mint, and your unique reference**.
2. **Be idempotent — never double-credit or double-charge.** Tie every payment to a unique reference/order id, record processed signatures with a uniqueness constraint, so a retry or duplicate webhook can't apply value twice.
3. **Bound every approval.** Subscription delegates use `approveChecked` with a **capped** amount (and ideally an on-chain program that enforces cadence). Never approve unlimited.
4. **Match finality to irreversibility.** `confirmed` for UX feedback; `finalized` before you ship goods, unlock funds, or do anything you can't claw back.
5. **Land the transaction reliably.** Any send/charge/pull goes through `solana-tx-skill`'s golden path (dynamic fee, simulate CU, rebroadcast/confirm loop, idempotent retry).

---

## What's included

### Skill files (progressive disclosure)

`skill/SKILL.md` is the entry point/router; each focused file is loaded only when the task needs it.

| File | What it covers in depth |
|------|-------------------------|
| [`SKILL.md`](skill/SKILL.md) | Entry point. The commerce stack, the five golden rules, a task-routing table, the operating procedure, the default stack, and the verify checklist. |
| [`solana-pay.md`](skill/solana-pay.md) | Solana Pay transfer requests (the URL scheme, `encodeURL`, QR) and transaction requests (GET/POST endpoint), the all-important `reference` key, and `findReference`/`validateTransfer`. |
| [`actions-blinks.md`](skill/actions-blinks.md) | **Payments-as-a-URL** — Solana Actions & Blinks: the GET (metadata) + POST (transaction) handlers, `actions.json`, CORS, preset + custom amounts, and verifying settlement by `reference`. The way payments get shared in X/Discord in 2026. |
| [`mobile-payments.md`](skill/mobile-payments.md) | **Mobile & POS** — Mobile Wallet Adapter (replaces the injected wallet), deep-link/QR fallbacks, Seed Vault, in-person counter flow, and session-resume correctness. |
| [`usdc-payments.md`](skill/usdc-payments.md) | Per-cluster USDC mints, base-unit integer math, Associated Token Accounts (create-if-missing), `transferChecked`, native SOL + rent caveats, and a Token-2022 note. |
| [`stablecoins.md`](skill/stablecoins.md) | **Beyond USDC** — a USDC/PYUSD/EURC/USDe registry: pin the exact mint per cluster, resolve the owning token program, per-mint decimals, and "accept many, settle in one." |
| [`token-2022-payments.md`](skill/token-2022-payments.md) | **Token-2022 footguns for payments** — transfer fees (you receive *less* than sent → quote net-of-fee), transfer hooks, frozen-by-default/permanent-delegate extensions, and the allowlist stance for arbitrary mints. |
| [`verifying-payments.md`](skill/verifying-payments.md) | The critical layer: find (poll/webhook) → validate exactly → credit idempotently (atomic record+fulfill) → finality fit, plus over/under/late payment and reconciliation. |
| [`subscriptions.md`](skill/subscriptions.md) | Delegate-based recurring billing: bounded `approveChecked`, relayer vs on-chain-program enforcement, the scheduler, per-period idempotency, cap exhaustion, and `revoke`. |
| [`payment-links.md`](skill/payment-links.md) | Shareable links/invoices: raw Solana Pay URLs vs hosted checkout, the invoice lifecycle, expiry/price-quoting, and single-use vs reusable references. |
| [`gasless-payments.md`](skill/gasless-payments.md) | **Fee abstraction** — the customer pays USDC with **no SOL**. A relayer is the fee payer and co-signs; full flow + the security boundaries (inspect-before-co-sign, rate limiting). |
| [`react-checkout.md`](skill/react-checkout.md) | **Drop-in React checkout**: a `usePayment` hook + `<SolanaCheckout>` component encoding the canonical `idle→awaiting→confirmed→finalized` state machine — the frontend in one tag. |
| [`webhooks.md`](skill/webhooks.md) | **Real-time settlement**: provider (Helius) webhook setup, authenticating the endpoint, idempotent handling, fast 200s, local-dev tunneling, and polling-vs-webhook trade-offs. |
| [`private-send.md`](skill/private-send.md) | **Payment privacy**, honestly: Token-2022 Confidential Transfers (encrypted amounts + auditor key) and one-time receiving addresses (unlinkability), what each does/doesn't hide, and the compliance reality. |
| [`refunds.md`](skill/refunds.md) | Idempotent refunds (never double-refund), full vs partial, refunding to the on-chain payer, subscription refunds, and the no-chargeback reality of disputes. |
| [`marketplace-payments.md`](skill/marketplace-payments.md) | Atomic multi-party payouts: platform fee splits, royalties, integer fee math, per-leg verification, and escrow vs buyer-funded models. |
| [`accepting-any-token.md`](skill/accepting-any-token.md) | Accept whatever token the customer holds and auto-swap to USDC (Jupiter): quote + slippage caps, verify the output, allowlisting input tokens. |
| [`pricing-oracles.md`](skill/pricing-oracles.md) | Fiat-priced checkout: when you need an oracle, reading Pyth (staleness + confidence), locking the quote with a TTL, and tolerance bands. |
| [`receipts-ledger.md`](skill/receipts-ledger.md) | The payment ledger keyed by signature — idempotency, receipts with on-chain proof, double-entry basics, exports, and retention. |
| [`threat-model.md`](skill/threat-model.md) | The attacker's-eye view: 12 concrete attacks → the exact control that stops each, trust boundaries, and operational safety. |
| [`treasury-keys.md`](skill/treasury-keys.md) | **Key management** (the thing that gets a business rekt): a hot/cold key inventory, Squads multisig treasury, KMS/Turnkey for the relayer, rotation, and balance/anomaly alerting. |
| [`compliance-screening.md`](skill/compliance-screening.md) | **Sanctions & risk screening** — `screen → decide → record`: OFAC/deny-list checks + velocity limits before crediting/off-ramping, fail-closed, and an immutable audit trail. |
| [`offramp-fiat.md`](skill/offramp-fiat.md) | Crypto → fiat via provider: quote → send-at-finalized → notify → reconcile, the compliance reality, and a provider-agnostic interface. |
| [`from-stripe.md`](skill/from-stripe.md) | A Stripe → Solana concept map (PaymentIntent, webhook, idempotency key, Customer, Subscription, Refund) for migrants. |
| [`testing.md`](skill/testing.md) | Testing on devnet + pure unit tests for the logic that matters (base-unit math, idempotency, cadence), and simulating failure paths. |
| [`resources.md`](skill/resources.md) | Mints (verify-before-use), libraries, specs/docs, RPC/webhook providers, off-ramp providers, delivery APIs, and a pinned version reference. |

#### Delivery layer (bundled — make every payment land)

| File | What it covers in depth |
|------|-------------------------|
| [`send-and-confirm.md`](skill/send-and-confirm.md) | Blockhash lifetime, the rebroadcast loop bounded by `lastValidBlockHeight`, confirmation strategy, and idempotent retries. |
| [`priority-fees.md`](skill/priority-fees.md) | Dynamic fee estimation (`getRecentPrioritizationFees` / Helius), percentile strategy, account-aware fees, clamping + fallback. |
| [`compute-budget.md`](skill/compute-budget.md) | Simulate to size the CU limit (+margin), set the CU price, the fee math, common pitfalls. |
| [`jito-bundles.md`](skill/jito-bundles.md) | Atomic all-or-nothing bundles, tips/tip accounts, regions, MEV protection, and when (not) to use. |
| [`durable-nonces.md`](skill/durable-nonces.md) | Offline signing and long-lived transactions with durable nonce accounts. |
| [`kit-vs-web3js.md`](skill/kit-vs-web3js.md) | Choosing and translating between `@solana/web3.js` (classic) and `@solana/kit` (modern). |
| [`debugging-failed-tx.md`](skill/debugging-failed-tx.md) | Simulation, reading program logs, an error-code decode table, and a triage flowchart. |

### Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| [`payments-architect`](agents/payments-architect.md) | opus | **Designs** the commerce flow: custody model, settlement/finality policy, subscription/delegate safety, reconciliation and idempotency, on/off-ramp — and produces a concrete design artifact to hand off. |
| [`payments-engineer`](agents/payments-engineer.md) | sonnet | **Implements** checkout, the on-chain verification gate, payment links, and recurring charges — building the verification gate before the happy path and refusing the known money-losing anti-patterns. |
| [`tx-reliability-architect`](agents/tx-reliability-architect.md) | opus | **Designs** the delivery strategy: fee policy, retry/confirm design, Jito-vs-RPC decision, and under-load behavior (bundled delivery layer). |
| [`tx-engineer`](agents/tx-engineer.md) | sonnet | **Implements/refactors** the sender: dynamic fee estimation, CU budgeting, the send/confirm/rebroadcast loop, and bundles (bundled delivery layer). |

### Commands

| Command | What it does |
|---------|--------------|
| [`/verify-payment`](commands/verify-payment.md) | Given a reference or signature, confirms on-chain that the correct payment settled (exact amount/mint/recipient/reference), and advises idempotent crediting + finality. |
| [`/payments-audit`](commands/payments-audit.md) | Audits checkout/subscription code against a 14-point payment-safety checklist, scoring each path and prioritizing money-at-risk gaps with the prescribed fix. |
| [`/build-checkout`](commands/build-checkout.md) | Scaffolds a complete checkout: Solana Pay request + USDC `transferChecked` transaction + the server-side verification gate, wired to land via solana-tx-skill. |
| [`/setup-subscription`](commands/setup-subscription.md) | Scaffolds safe recurring billing: bounded `approveChecked`, per-period idempotent charge, `revoke`, and optional on-chain cadence enforcement. |
| [`/reconcile`](commands/reconcile.md) | Diffs your ledger against the chain to find missed payments, double-credits, and orphaned transfers, repairing the ledger idempotently. |
| [`/diagnose-tx`](commands/diagnose-tx.md) | Given a transaction signature, fetches it, decodes logs + error codes, and explains the root cause + fix (bundled delivery layer). |
| [`/tx-health-check`](commands/tx-health-check.md) | Audits a codebase's send/confirm code against the delivery reliability checklist and reports gaps (bundled delivery layer). |

### Runnable examples

| Path | What |
|------|------|
| [`examples/`](examples) | **Type-checked _and_ unit-tested** reference code (`npm run typecheck && npm test`, 36 tests in CI). Commerce: `checkout.ts`, `verify-and-credit.ts`, `subscription.ts`, `marketplace.ts`. Tokens: `token2022.ts`, `stablecoins.ts`. Distribution: `actions-handler.ts`. Compliance: `screening.ts`. UX: `gasless-relayer.ts`, `stealth-receive.ts`, `use-payment.ts` + `react-checkout.tsx`, `webhook-handler.ts`. Delivery: `reliable-web3js.ts`, `reliable-kit.ts`, `devnet-demo.ts`. |
| [`examples/test/`](examples/test) | **Vitest suite** (runs in CI): amount math, fee splits, webhook idempotency, subscription cadence/cap, Token-2022 fee accounting, sanctions/velocity screening, Action metadata, stablecoin registry. |
| [`examples/starter/`](examples/starter) | **0→10min** runnable end-to-end checkout: one server file (create order → on-chain verify) + a drop-in HTML page. `node --import tsx starter/server.ts`. |
| [`examples/subscription-program/`](examples/subscription-program) | A reference **Anchor** program enforcing the subscription **cap and cadence on-chain** — with **`cargo test`** cadence unit tests + **clock-warped bankrun** integration tests + a build/test/deploy guide. |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | CI: type-check + run the example tests + a markdown link check on every push/PR (the green badge above). |

### Rules

| File | Purpose |
|------|---------|
| [`rules/typescript.md`](rules/typescript.md) | Auto-loadable payment-safety standards: verify on-chain (never trust the client), idempotent crediting, integer base units, checked token ops, bounded approvals, finality-before-release. |
| [`rules/transaction-delivery.md`](rules/transaction-delivery.md) | Auto-loadable delivery standards: never hardcode fees/CU limits, bound retry loops by blockhash expiry, idempotent resends, versioned transactions, and distinguishing delivery failures from on-chain failures. |

---

## How progressive disclosure works

Coding agents have a limited context budget. Loading one giant guide for every question wastes tokens. This skill is structured so the agent loads **only what the current task needs**:

1. The agent reads the short `SKILL.md` entry point.
2. `SKILL.md` has a **routing table** mapping the user's intent to one or two focused files.
3. The agent opens only those — a "verify a payment" question loads `verifying-payments.md`, not the off-ramp or subscription material.
4. Anything about transaction *landing* is routed out to `solana-tx-skill`.

This keeps responses fast and focused.

---

## Installation

Installs into your agent's skills directory (`~/.claude/skills/solana-payments` by default), with `agents/`, `commands/`, and `rules/` alongside, and `CLAUDE.md` where your agent reads configuration.

### Quick install (one line)

```bash
curl -fsSL https://raw.githubusercontent.com/skyyycodes/solana-payments-skill/main/setup.sh | bash
```

This downloads [`setup.sh`](setup.sh), which clones the repo to a temp directory and runs `install.sh` with defaults. It's a short, readable script — inspect it first if you prefer.

### Option A — Custom install (recommended for manual setup)

```bash
git clone https://github.com/skyyycodes/solana-payments-skill
cd solana-payments-skill
./install-custom.sh
```

It interactively asks for the install **location** (personal `~/.claude/skills/` or project `./.claude/skills/`), which **components** to copy (`agents/`, `commands/`, `rules/`), and **CLAUDE.md placement**. Non-interactive: `./install-custom.sh --project` or `--path /custom/dir`.

### Option B — Standard install (automation / CI)

```bash
./install.sh        # interactive Y/n
./install.sh -y     # non-interactive, all defaults
```

Defaults: skill → `~/.claude/skills/solana-payments`; `agents`/`commands`/`rules` → `~/.claude/`; `CLAUDE.md` → `~/.claude/CLAUDE.md` (existing backed up).

> **One install gets everything.** The transaction-delivery layer is bundled, so you don't need a separate skill to make payments land reliably.

### Uninstall

```bash
rm -rf ~/.claude/skills/solana-payments
# plus any agents/commands/rules files you copied, and restore CLAUDE.md.backup if needed
```

---

## Usage

Once installed, talk to your agent naturally — it routes to the right skill file automatically.

### Accept a payment

```
Let customers pay me in USDC and confirm on-chain when they've paid.
Generate a Solana Pay QR / payment link for order #123.
Build a checkout that watches for settlement and unlocks access.
```

### Verify & reconcile

```
Did this payment settle for the right amount?            →  /verify-payment
Make sure a duplicate webhook can never double-credit an order.
When is a payment final enough to ship the goods?
```

### Recurring & off-ramp

```
Build a $10/month subscription with a bounded delegate.
Let a relayer pull a monthly charge safely (no double-charge).
Let users cash out USDC to a bank account (fiat off-ramp).
```

### Make it usable (UX)

```
Let customers pay in USDC without holding any SOL (gasless).
Give me a React checkout component + a payment-status hook.
Notify my server the instant a payment lands (Helius webhook).
Keep payment amounts private without breaking compliance.  →  private-send
Just give me a working checkout I can run.            →  examples/starter
```

### Share & go mobile

```
Turn this payment into a Blink I can post in X / Discord.   →  actions-blinks
Build the Action GET/POST handlers + actions.json for my shop.
Accept payments on a phone / in-person POS (Mobile Wallet Adapter).  →  mobile-payments
```

### Multi-stablecoin & token safety

```
Accept PYUSD and EURC, not just USDC — pin the right mints.   →  stablecoins
This token is Token-2022 and charges a transfer fee — quote net-of-fee.  →  token-2022-payments
```

### Operations, trust & compliance

```
How should I secure the relayer and treasury keys?           →  treasury-keys
Screen wallets against sanctions + velocity before crediting.  →  compliance-screening
Prove the money logic works — run the tests.            →  cd examples && npm test
```

### Audit

```
Audit our checkout and subscription code for payment-safety gaps.  →  /payments-audit
```

The agent confirms your SDK (`package.json`), the mint + cluster, and the fee-payer/custody model before writing code, builds the on-chain verification gate first, and runs the verify checklist before declaring done.

---

## The five flows, in depth

**1. Solana Pay (`solana-pay.md`)** — the request layer. A *transfer request* is a `solana:...` URL (recipient + amount + `spl-token` + `reference`) the wallet fulfills; a *transaction request* points at an HTTPS endpoint that returns a full transaction to sign (for mints, fee splits, program calls). The unique `reference` public key is what lets you find and bind the payment to an order later.

**2. USDC payments (`usdc-payments.md`)** — the asset layer. Real commerce is in stablecoins, so most payments are SPL token transfers: per-cluster mints (mainnet vs devnet differ), 6-decimal base-unit integer math, Associated Token Accounts (create the recipient's if missing), and `transferChecked` (which enforces mint + decimals). Plus native SOL caveats and a Token-2022 note.

**3. Verifying payments (`verifying-payments.md`)** — the settle layer, and the one most implementations get wrong. Find the payment (polling or webhook) → validate it matches **exactly** (recipient, amount, mint, reference, success) → credit it **idempotently** (unique constraint on signature; record + fulfill atomically) → gate irreversible actions on **`finalized`**. Includes over/under/late-payment policy and reconciliation.

**4. Subscriptions (`subscriptions.md`)** — the recur layer, the genuinely novel piece. Solana has no native recurring billing, so you build it from the SPL **delegate** primitive: the customer `approveChecked`s a **bounded** cap, then a relayer or (better) an on-chain **program** pulls one period's charge on cadence. The file is opinionated about safety: never approve unlimited, enforce cadence on-chain for production, make every charge idempotent per `(subscription, period)`, and provide `revoke`.

**5. Fiat off-ramp (`offramp-fiat.md`)** — the exit layer. Crypto → bank is provider-handled (KYC, banking rails, licensing); you create an off-ramp order, send USDC to the deposit address **reliably and at `finalized`**, and reconcile via idempotent webhooks. Stays provider-agnostic behind an interface.

**+ Delivery (bundled)** — every one of those flows has to actually *land* a transaction under real network conditions. That's the bundled delivery layer (`send-and-confirm.md`, `priority-fees.md`, `compute-budget.md`, `jito-bundles.md`, `durable-nonces.md`, `debugging-failed-tx.md`): dynamic fee → simulated compute budget → bounded rebroadcast/confirm loop → idempotent retry, with Jito bundles for atomicity/MEV and `/diagnose-tx` for failures.

---

## Design principles

- **On-chain truth.** The browser saying "paid" is never proof; verification is server-side and on-chain.
- **Exactly once.** Idempotent crediting keyed by the on-chain signature; safe under duplicate webhooks and retries.
- **Bounded approvals.** Subscription delegates are capped, revocable, and cadence-enforced — never unlimited.
- **Right finality.** `confirmed` for UX, `finalized` before any irreversible value movement.
- **Integers for money.** Base units in `bigint`/`BN`; never floats.
- **Least custody.** Hold funds only when the product truly requires it.
- **Composable.** Owns the commerce layer; delegates delivery to `solana-tx-skill` and on-chain programs to `solana-dev-skill`.

---

## FAQ

**Does Solana have native subscriptions?** No — that's the gap this skill fills. Recurring billing is built from bounded token delegates plus a relayer or an on-chain program that enforces cap and cadence.

**Why can't I just trust the wallet's "success" screen?** Because it's client-side and trivially forged. Anyone could call your fulfillment endpoint. You must confirm the transfer on-chain (exact amount/mint/recipient/reference) server-side.

**Do I need both SDKs?** No — the skill writes for whichever your project uses (`@solana/web3.js` or `@solana/kit`).

**SOL or USDC?** USDC (a stablecoin) is almost always the better commerce UX — no price volatility between checkout and settlement. The skill covers both.

**Do I need solana-tx-skill too?** No — the transaction-delivery layer (fees, compute budget, confirm/retry, Jito, durable nonces, debugging) is **bundled into this skill**. One install is the whole commerce backend. (The standalone `solana-tx-skill` still exists if you only want the delivery layer in another project.)

**Is the off-ramp something I build?** No. You integrate a regulated provider; you build the order-create, the reliable USDC send at `finalized`, and idempotent reconciliation.

---

## Glossary

- **Solana Pay** — the open standard for requesting payments via a URL/QR, with a `reference` key for lookup and verification.
- **Reference** — a unique throwaway public key attached to a payment so you can find it on-chain and bind it to an order.
- **ATA (Associated Token Account)** — the deterministic account that holds a given SPL token for a wallet; must exist to receive that token.
- **`transferChecked` / `approveChecked`** — token instructions that enforce the mint and decimals; preferred for payments.
- **Delegate** — an authority approved to move tokens out of someone's token account, up to an approved amount; the basis for recurring pulls.
- **Idempotent credit** — applying a payment at most once, even if observed multiple times, via a uniqueness constraint on the signature.
- **Finality** — `confirmed` (fast, rarely reversible) vs `finalized` (irreversible); match it to the cost of being wrong.
- **Off-ramp / on-ramp** — converting crypto → fiat (bank/card) and back, handled by a regulated provider.

---

## Compatibility & requirements

- **Libraries:** `@solana/pay`, `@solana/spl-token` (0.4+), `bignumber.js`; SDKs `@solana/web3.js` 1.95+ and `@solana/kit` 6.x; `@solana-program/compute-budget` + `jito-ts` for delivery.
- **Agents:** Claude Code / Codex and any kit-compatible coding agent.
- **Self-contained:** the transaction-delivery layer is bundled — no separate skill required.
- **Standalone:** no hard runtime dependency; complements `solana-dev-skill` (programs/frontend).

---

## Repository structure

```
solana-payments-skill/
├── skill/
│   ├── SKILL.md                 # entry point + routing table
│   ├── solana-pay.md
│   ├── actions-blinks.md        # payments-as-a-URL (Actions & Blinks)
│   ├── mobile-payments.md       # Mobile Wallet Adapter / POS
│   ├── usdc-payments.md
│   ├── stablecoins.md           # USDC/PYUSD/EURC/USDe registry
│   ├── token-2022-payments.md   # transfer fees / hooks / allowlist
│   ├── verifying-payments.md
│   ├── subscriptions.md
│   ├── payment-links.md
│   ├── gasless-payments.md
│   ├── react-checkout.md
│   ├── webhooks.md
│   ├── private-send.md
│   ├── refunds.md
│   ├── marketplace-payments.md
│   ├── accepting-any-token.md
│   ├── pricing-oracles.md
│   ├── receipts-ledger.md
│   ├── threat-model.md
│   ├── treasury-keys.md         # multisig / KMS / rotation / alerting
│   ├── compliance-screening.md  # OFAC / velocity / screen→decide→record
│   ├── offramp-fiat.md
│   ├── from-stripe.md
│   ├── testing.md
│   ├── resources.md
│   │  # --- bundled delivery layer ---
│   ├── send-and-confirm.md
│   ├── priority-fees.md
│   ├── compute-budget.md
│   ├── jito-bundles.md
│   ├── durable-nonces.md
│   ├── kit-vs-web3js.md
│   └── debugging-failed-tx.md
├── agents/
│   ├── payments-architect.md
│   ├── payments-engineer.md
│   ├── tx-reliability-architect.md   # delivery
│   └── tx-engineer.md                # delivery
├── commands/
│   ├── verify-payment.md
│   ├── payments-audit.md
│   ├── build-checkout.md
│   ├── setup-subscription.md
│   ├── reconcile.md
│   ├── diagnose-tx.md                # delivery
│   └── tx-health-check.md            # delivery
├── .github/workflows/ci.yml     # CI: typecheck + test + link check
├── examples/                    # runnable, type-checked AND unit-tested
│   ├── src/checkout.ts · verify-and-credit.ts · subscription.ts · marketplace.ts
│   ├── src/token2022.ts · stablecoins.ts · actions-handler.ts · screening.ts
│   ├── src/gasless-relayer.ts · stealth-receive.ts · use-payment.ts · react-checkout.tsx · webhook-handler.ts
│   ├── src/reliable-web3js.ts · reliable-kit.ts · devnet-demo.ts   # delivery
│   ├── test/                    # Vitest suite (36 tests, runs in CI)
│   ├── starter/                 # 0→10min end-to-end checkout app
│   ├── package.json · tsconfig.json · vitest.config.ts
│   └── subscription-program/    # reference Anchor program: cargo test + bankrun + deploy guide
├── rules/
│   ├── typescript.md            # payment-safety
│   └── transaction-delivery.md  # delivery (fees/CU/retry)
├── CLAUDE.md                    # agent configuration
├── install.sh                   # standard installer
├── install-custom.sh            # custom installer
├── setup.sh                     # remote one-line installer
├── LICENSE
└── README.md
```

---

## Contributing

PRs welcome — the bar is **accuracy to the current stack and payment safety**.

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/my-improvement`.
3. Make your changes. If you change a documented pattern, keep the safety rules intact and cite source-of-truth docs (see `resources.md`).
4. Open a pull request describing what changed and why.

---

## License

MIT — see [LICENSE](LICENSE).