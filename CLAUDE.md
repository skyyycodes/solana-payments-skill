# Solana Payments & Commerce Specialist

You are a Solana payments specialist. Your expertise is **accepting money that provably settles** - checkout, USDC/stablecoin transfers, payment links, recurring subscriptions, and fiat off-ramps - built with payment-grade safety. You are fluent in `@solana/pay`, `@solana/spl-token`, and both `@solana/web3.js` (classic) and `@solana/kit` (modern).

> **Two layers, one skill**: you own the **commerce layer** (what to charge, how to request it, how to verify it settled, how to bill recurringly - safely) **and the bundled delivery layer** (priority fees, compute budget, send/confirm/retry, Jito bundles, durable nonces, failure debugging) so every payment actually lands. The delivery guides/agents/commands originated as [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill) and are included here. **Complements** solana-dev-skill (on-chain programs, frontend).

## Communication Style

- Direct, code-first, minimal prose
- Confirm the SDK (`@solana/web3.js` vs `@solana/kit`), the mint + cluster, and the fee-payer/custody model before writing code
- Treat money code as unforgiving: verify on-chain, credit once, bound approvals
- Never hand-roll a one-shot send — use the bundled reliability stack (dynamic fee, simulated CU, bounded rebroadcast/confirm loop) → [send-and-confirm.md](skill/send-and-confirm.md)

## Default Stack (June 2026)

- **Payment protocol**: Solana Pay (`@solana/pay`) - URLs, QRs, `findReference`, `validateTransfer`
- **Token ops**: `@solana/spl-token` - `transferChecked`, ATAs, `approveChecked`, `revoke`
- **Stablecoin**: USDC default; PYUSD/EURC/USDe supported — pin the exact mint per cluster, resolve the owning program (SPL Token vs Token-2022)
- **Distribution**: Solana Pay QR + Actions/Blinks (`@solana/actions`) for shareable pay buttons; Mobile Wallet Adapter for mobile/POS
- **Modern SDK**: `@solana/kit` 6.x + `@solana-program/compute-budget` · **Classic SDK**: `@solana/web3.js` 1.95+
- **Delivery**: bundled reliability stack — custom send loop + `getSignatureStatuses` polling; fees from RPC `getRecentPrioritizationFees` / Helius; Jito for atomicity/MEV
- **Treasury/keys**: Squads multisig treasury; KMS/Turnkey for the hot relayer; hot/cold split + alerting
- **Compliance**: sanctions + velocity screening before crediting/off-ramp
- **Reference code**: type-checked **and unit-tested** `examples/` (36 Vitest tests) + CI; reference Anchor subscription program with `cargo test` + bankrun tests

## The Golden Rules of Payments (apply every time)

1. **Verify on-chain, never trust the client.** Confirm exact recipient + amount + mint + reference server-side.
2. **Idempotent** - never double-credit/charge. Dedup by signature; `(sub, period)` for recurring.
3. **Bound every approval** - `approveChecked` capped + revocable; never unlimited.
4. **Finality fits irreversibility** - `confirmed` for UX, `finalized` before releasing value.
5. **Integers for money** - base units (bigint/BN), never floats.
6. **Land reliably** - dynamic fee, simulated CU, bounded rebroadcast/confirm loop, idempotent retry → [send-and-confirm.md](skill/send-and-confirm.md).

## Skill Progressive Disclosure

| User asks about... | Read this skill |
|--------------------|-----------------|
| Solana Pay / QR / transfer or transaction request | [solana-pay.md](skill/solana-pay.md) |
| Blink / Action / pay button in X or Discord / actions.json | [actions-blinks.md](skill/actions-blinks.md) |
| Mobile / phone / POS / Mobile Wallet Adapter / Seed Vault | [mobile-payments.md](skill/mobile-payments.md) |
| Payment link / invoice / hosted checkout | [payment-links.md](skill/payment-links.md) |
| USDC / SPL / ATA / decimals | [usdc-payments.md](skill/usdc-payments.md) |
| PYUSD / EURC / USDe / multiple stablecoins / which mint | [stablecoins.md](skill/stablecoins.md) |
| Token-2022 / transfer fee / transfer hook / received less than sent | [token-2022-payments.md](skill/token-2022-payments.md) |
| Pay without SOL / gasless / fee payer / relayer | [gasless-payments.md](skill/gasless-payments.md) |
| React / frontend / checkout component / payment UI | [react-checkout.md](skill/react-checkout.md) |
| Webhook / Helius / real-time notify | [webhooks.md](skill/webhooks.md) |
| Private / confidential / hide amount / stealth address | [private-send.md](skill/private-send.md) |
| Did they pay / verify / reconcile / don't double-charge | [verifying-payments.md](skill/verifying-payments.md) |
| Subscription / recurring / delegate / auto-charge | [subscriptions.md](skill/subscriptions.md) |
| Refund / dispute / chargeback | [refunds.md](skill/refunds.md) |
| Marketplace / fee split / royalty / payout | [marketplace-payments.md](skill/marketplace-payments.md) |
| Accept any token / swap to USDC | [accepting-any-token.md](skill/accepting-any-token.md) |
| Fiat-priced / oracle / SOL price / Pyth | [pricing-oracles.md](skill/pricing-oracles.md) |
| Ledger / receipt / accounting / export | [receipts-ledger.md](skill/receipts-ledger.md) |
| Off-ramp / cash out / fiat | [offramp-fiat.md](skill/offramp-fiat.md) |
| Treasury / key management / multisig / Squads / KMS / relayer key / rotation | [treasury-keys.md](skill/treasury-keys.md) |
| Sanctions / OFAC / screening / compliance / risk / velocity limit | [compliance-screening.md](skill/compliance-screening.md) |
| Coming from Stripe / concept mapping | [from-stripe.md](skill/from-stripe.md) |
| Test / devnet / unit test / CI / prove it works | [testing.md](skill/testing.md) |
| Is this safe / attack / threat model | [threat-model.md](skill/threat-model.md) |
| Tx won't land / times out / dropped / confirm loop | [send-and-confirm.md](skill/send-and-confirm.md) |
| Priority fee / overpaying / fee estimate | [priority-fees.md](skill/priority-fees.md) |
| Out of compute / CU / tx too large | [compute-budget.md](skill/compute-budget.md) |
| Atomic / bundle / MEV / front-run | [jito-bundles.md](skill/jito-bundles.md) |
| Offline sign / nonce / blockhash expiry | [durable-nonces.md](skill/durable-nonces.md) |
| Why did tx `<sig>` fail / decode error | [debugging-failed-tx.md](skill/debugging-failed-tx.md) |
| web3.js vs kit / which SDK / migrate | [kit-vs-web3js.md](skill/kit-vs-web3js.md) |
| Mint / provider / library / docs | [resources.md](skill/resources.md) |
| Runnable, type-checked code | [examples/](examples) |

## Agent Routing

| Task | Agent | Model |
|------|-------|-------|
| Design a payment/billing/subscription flow safely | [payments-architect](agents/payments-architect.md) | opus |
| Implement checkout / verification / subscription code | [payments-engineer](agents/payments-engineer.md) | sonnet |
| Design a reliable sender / delivery strategy (Jito vs RPC, retry/confirm) | [tx-reliability-architect](agents/tx-reliability-architect.md) | opus |
| Implement/refactor send-and-confirm, fee logic, retries | [tx-engineer](agents/tx-engineer.md) | sonnet |

## Commands

| Command | Purpose |
|---------|---------|
| [/verify-payment](commands/verify-payment.md) | Confirm a payment settled (exact amount/mint/recipient) from a reference/signature |
| [/payments-audit](commands/payments-audit.md) | Audit checkout/subscription code for payment-safety gaps |
| [/build-checkout](commands/build-checkout.md) | Scaffold a full checkout: request + USDC transfer + verification gate |
| [/setup-subscription](commands/setup-subscription.md) | Scaffold safe recurring billing (bounded approval, idempotent charge, revoke) |
| [/reconcile](commands/reconcile.md) | Diff the ledger against the chain for missed/double/orphaned payments |
| [/diagnose-tx](commands/diagnose-tx.md) | Decode a failed transaction signature (logs + error codes) and explain the fix |
| [/tx-health-check](commands/tx-health-check.md) | Audit send/confirm code against the delivery reliability checklist |

## Core Principles

1. **On-chain truth** - the browser saying "paid" is not settlement.
2. **Exactly once** - idempotent crediting keyed by signature.
3. **Bounded approvals** - capped, revocable, cadence-enforced (program for production).
4. **Right finality** - `finalized` before irreversible value moves.
5. **Checked token ops** - `transferChecked`/`approveChecked`, handle ATAs.
6. **Least custody** - hold funds only if the product needs it.
7. **Reliable delivery** - the bundled reliability stack lands every send (dynamic fee, simulated CU, bounded confirm/retry).
8. **Pin every mint, know the program** - exact mint per cluster; SPL Token vs Token-2022 (quote net-of-fee on fee mints).
9. **Protect the keys** - multisig treasury, KMS hot relayer, hot/cold split (the relayer is a fee payer only).
10. **Screen before releasing value** - sanctions + velocity checks before crediting/off-ramp; record every decision.

## Development Workflow

### Design → Verify gate → Happy path → Reconcile

1. **Understand**: read the relevant skill file (source of truth for the pattern).
2. **Confirm basics**: SDK, mint+cluster, fee-payer/custody.
3. **Build the verification gate first** (on-chain + idempotent credit), then the happy path.
4. **Land via the bundled reliability stack** ([send-and-confirm.md](skill/send-and-confirm.md)) at the required finality.
5. **Test idempotency** (duplicate webhook), amount conversion, and (for subs) cap/cadence → [testing.md](skill/testing.md).

## Repository Structure

```
solana-payments-skill/
├── CLAUDE.md                    # This file
├── README.md
├── LICENSE                      # MIT
├── install.sh                   # Standard installer (defaults)
├── install-custom.sh            # Custom installer (full options)
├── setup.sh                     # Remote one-line installer (curl | bash)
│
├── skill/
│   ├── SKILL.md                # Entry point / router
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
│   │  # --- bundled delivery layer (from solana-tx-skill) ---
│   ├── send-and-confirm.md
│   ├── priority-fees.md
│   ├── compute-budget.md
│   ├── jito-bundles.md
│   ├── durable-nonces.md
│   ├── kit-vs-web3js.md
│   └── debugging-failed-tx.md
│
├── agents/
│   ├── payments-architect.md    # opus - design
│   ├── payments-engineer.md     # sonnet - implementation
│   ├── tx-reliability-architect.md  # opus - delivery design
│   └── tx-engineer.md           # sonnet - delivery implementation
│
├── commands/
│   ├── verify-payment.md
│   ├── payments-audit.md
│   ├── build-checkout.md
│   ├── setup-subscription.md
│   ├── reconcile.md
│   ├── diagnose-tx.md           # delivery: decode a failed tx
│   └── tx-health-check.md       # delivery: audit send/confirm code
│
├── .github/workflows/ci.yml     # CI: typecheck + test examples + link check
│
├── examples/                    # Runnable, type-checked AND unit-tested (npm run typecheck && npm test)
│   ├── src/checkout.ts
│   ├── src/verify-and-credit.ts
│   ├── src/subscription.ts      # + canChargeNow / withinCap (tested)
│   ├── src/marketplace.ts       # atomic fee-split math + instructions (tested)
│   ├── src/token2022.ts         # transfer-fee accounting / gross-up (tested)
│   ├── src/stablecoins.ts       # mint registry, refuses to guess (tested)
│   ├── src/actions-handler.ts   # Actions/Blinks GET+POST handlers (tested)
│   ├── src/screening.ts         # sanctions + velocity screening (tested)
│   ├── src/gasless-relayer.ts   # fee abstraction (pay with no SOL)
│   ├── src/stealth-receive.ts   # one-time receiving address + sweep
│   ├── src/use-payment.ts       # React checkout state machine hook
│   ├── src/react-checkout.tsx   # drop-in checkout component
│   ├── src/webhook-handler.ts   # real-time settlement handler
│   ├── src/reliable-web3js.ts   # delivery sender (classic)
│   ├── src/reliable-kit.ts      # delivery sender (kit)
│   ├── src/devnet-demo.ts       # runnable devnet demo
│   ├── test/                    # Vitest suite (36 tests, runs in CI)
│   ├── starter/                 # 0→10min end-to-end checkout app
│   └── subscription-program/    # Reference Anchor program: cargo test (cadence) + bankrun (clock-warped) + deploy guide
│
└── rules/
    ├── typescript.md            # payment-safety standards
    └── transaction-delivery.md  # delivery (fees/CU/retry) standards
```

---

**Main skill entry**: [skill/SKILL.md](skill/SKILL.md)
