# Solana Payments Skill (`solana-payments-skill`)

A Claude Code / Codex (and any kit-compatible coding agent) **skill** that turns your AI assistant into a specialist at the thing Solana still has no Stripe for: **accepting money that provably settles** — checkout, USDC payments, payment links, recurring subscriptions, and fiat off-ramps — built with payment-grade safety.

> **In one sentence:** there is no "Stripe for Solana." The building blocks (Solana Pay, USDC transfers, token-account creation, recurring billing, payment links, off-ramps) exist but are fragmented across separate docs, and recurring billing has **no native primitive** at all. This skill packages the whole "accept money on Solana" stack as concrete, current, copy-pasteable patterns — with the non-negotiable safety rules (verify on-chain, credit exactly once, bound every approval, finalize before releasing value) baked into every flow.

Built to slot into the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit), and designed as a **sibling** to [`solana-tx-skill`](https://github.com/skyyycodes/solana-tx-skill): payments owns the *commerce* layer (what to charge and how to verify it), while `solana-tx-skill` owns the *delivery* layer (getting each transaction to land reliably).

---

## Table of contents

- [Why this skill exists](#why-this-skill-exists)
- [Who it's for](#who-its-for)
- [How it pairs with solana-tx-skill](#how-it-pairs-with-solana-tx-skill)
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

## How it pairs with solana-tx-skill

These two skills compose into a complete commerce backend:

```
┌─────────────────────────────────────────────────────────┐
│  solana-payments-skill   ← the "WHAT" (product/flows)    │
│  Solana Pay · USDC · subscriptions · links · off-ramp    │
│  + the safety: verify on-chain, credit once, bound approvals
└───────────────────────────┬─────────────────────────────┘
                            │ every flow must SETTLE reliably
                            ▼
┌─────────────────────────────────────────────────────────┐
│  solana-tx-skill         ← the "HOW IT LANDS" (delivery) │
│  priority fees · compute budget · confirm/retry · idempotent landing
└─────────────────────────────────────────────────────────┘
```

Payments **defers all on-chain delivery** to `solana-tx-skill` — it never re-implements fee estimation or the send/confirm loop. Install both for the full stack; payments works standalone too (it just cross-references the delivery patterns).

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
└──────────────────────────────────────────────────────────────────┘
        Every on-chain step DELIVERS via → solana-tx-skill
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
| [`usdc-payments.md`](skill/usdc-payments.md) | Per-cluster USDC mints, base-unit integer math, Associated Token Accounts (create-if-missing), `transferChecked`, native SOL + rent caveats, and a Token-2022 note. |
| [`verifying-payments.md`](skill/verifying-payments.md) | The critical layer: find (poll/webhook) → validate exactly → credit idempotently (atomic record+fulfill) → finality fit, plus over/under/late payment and reconciliation. |
| [`subscriptions.md`](skill/subscriptions.md) | Delegate-based recurring billing: bounded `approveChecked`, relayer vs on-chain-program enforcement, the scheduler, per-period idempotency, cap exhaustion, and `revoke`. |
| [`payment-links.md`](skill/payment-links.md) | Shareable links/invoices: raw Solana Pay URLs vs hosted checkout, the invoice lifecycle, expiry/price-quoting, and single-use vs reusable references. |
| [`offramp-fiat.md`](skill/offramp-fiat.md) | Crypto → fiat via provider: quote → send-at-finalized → notify → reconcile, the compliance reality, and a provider-agnostic interface. |
| [`resources.md`](skill/resources.md) | Mints (verify-before-use), libraries, specs/docs, RPC/webhook providers, off-ramp providers, and a pinned version reference. |

### Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| [`payments-architect`](agents/payments-architect.md) | opus | **Designs** the commerce flow: custody model, settlement/finality policy, subscription/delegate safety, reconciliation and idempotency, on/off-ramp — and produces a concrete design artifact to hand off. |
| [`payments-engineer`](agents/payments-engineer.md) | sonnet | **Implements** checkout, the on-chain verification gate, payment links, and recurring charges — building the verification gate before the happy path and refusing the known money-losing anti-patterns. |

### Commands

| Command | What it does |
|---------|--------------|
| [`/verify-payment`](commands/verify-payment.md) | Given a reference or signature, confirms on-chain that the correct payment settled (exact amount/mint/recipient/reference), and advises idempotent crediting + finality. |
| [`/payments-audit`](commands/payments-audit.md) | Audits checkout/subscription code against a 14-point payment-safety checklist, scoring each path and prioritizing money-at-risk gaps with the prescribed fix. |

### Rules

| File | Purpose |
|------|---------|
| [`rules/typescript.md`](rules/typescript.md) | Auto-loadable payment-safety standards: verify on-chain (never trust the client), idempotent crediting, integer base units, checked token ops, bounded approvals, finality-before-release, and delivery via solana-tx-skill. |

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

### Install both skills (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/skyyycodes/solana-tx-skill/main/setup.sh | bash
curl -fsSL https://raw.githubusercontent.com/skyyycodes/solana-payments-skill/main/setup.sh | bash
```

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

**Do I need solana-tx-skill too?** Strongly recommended. This skill defers all transaction landing (fees, confirm/retry) to it. Payments still works standalone — it just cross-references those patterns.

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

- **Libraries:** `@solana/pay`, `@solana/spl-token` (0.4+), `bignumber.js`; SDKs `@solana/web3.js` 1.95+ and `@solana/kit` 6.x.
- **Agents:** Claude Code / Codex and any kit-compatible coding agent.
- **Sibling skill:** [`solana-tx-skill`](https://github.com/skyyycodes/solana-tx-skill) for transaction delivery (recommended).
- **Standalone:** no hard runtime dependency; complements `solana-dev-skill` (programs/frontend).

---

## Repository structure

```
solana-payments-skill/
├── skill/
│   ├── SKILL.md                 # entry point + routing table
│   ├── solana-pay.md
│   ├── usdc-payments.md
│   ├── verifying-payments.md
│   ├── subscriptions.md
│   ├── payment-links.md
│   ├── offramp-fiat.md
│   └── resources.md
├── agents/
│   ├── payments-architect.md
│   └── payments-engineer.md
├── commands/
│   ├── verify-payment.md
│   └── payments-audit.md
├── rules/
│   └── typescript.md
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