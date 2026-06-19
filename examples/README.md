# solana-payments-skill — examples

Runnable, **type-checked** and **unit-tested** reference code for the patterns in the skill. These compile against the real SDKs (`@solana/pay`, `@solana/spl-token`, `@solana/web3.js`) so the snippets in the docs can't silently drift — and the money-critical logic is covered by a Vitest suite that runs in CI.

```bash
cd examples
npm install
npm run typecheck   # tsc --noEmit — must pass
npm test            # vitest run — 36 tests (amount math, idempotency, cadence, fees, screening, Actions)
```

### Commerce layer

| File | Layer | What |
|------|-------|------|
| [`src/checkout.ts`](src/checkout.ts) | request + asset | Build a Solana Pay request and a USDC `transferChecked` transaction (fresh reference, ATA creation, base-unit math) |
| [`src/verify-and-credit.ts`](src/verify-and-credit.ts) | settle | The verification gate: find → validate exactly → idempotent credit → finality |
| [`src/subscription.ts`](src/subscription.ts) | recur | Bounded `approveChecked`, per-period charge pull, `revoke`, idempotent scheduler, `canChargeNow`/`withinCap` |
| [`src/marketplace.ts`](src/marketplace.ts) | split | Atomic fee-split math (remainder→seller) + the two transfers for one transaction |
| [`src/token2022.ts`](src/token2022.ts) | tokens | Token-2022 transfer-fee accounting: fee, net-after-fee, gross-up to a target net |
| [`src/stablecoins.ts`](src/stablecoins.ts) | tokens | Multi-stablecoin mint registry (USDC verified; PYUSD/EURC/USDe) that refuses to guess a mint |
| [`src/actions-handler.ts`](src/actions-handler.ts) | distribution | Solana Actions/Blinks GET (metadata) + POST (transaction) handlers |
| [`src/screening.ts`](src/screening.ts) | compliance | Sanctions + velocity screening: `screen → decide → record` |

### UX & frontend

| File | What |
|------|------|
| [`src/gasless-relayer.ts`](src/gasless-relayer.ts) | Fee abstraction — relayer pays the fee, customer pays USDC with no SOL (partial signing + assert-before-relay) |
| [`src/use-payment.ts`](src/use-payment.ts) | React `usePayment` hook — the canonical idle→awaiting→confirmed→finalized state machine |
| [`src/react-checkout.tsx`](src/react-checkout.tsx) | Drop-in `<SolanaCheckout>` component |
| [`src/webhook-handler.ts`](src/webhook-handler.ts) | Real-time settlement webhook (auth, idempotent, fast 200) |
| [`src/stealth-receive.ts`](src/stealth-receive.ts) | One-time receiving address + sweep to treasury (recipient unlinkability) |

### Delivery layer (bundled from solana-tx-skill)

The commerce examples mark where transaction landing plugs in — here is that landing layer, implemented and type-checked:

| File | What |
|------|------|
| [`src/reliable-web3js.ts`](src/reliable-web3js.ts) | `@solana/web3.js` reliable sender: dynamic fee + simulated CU + rebroadcast/confirm loop |
| [`src/reliable-kit.ts`](src/reliable-kit.ts) | The same golden path with `@solana/kit` |
| [`src/devnet-demo.ts`](src/devnet-demo.ts) | Runnable devnet demo (`npm run devnet`) |

## Tests

[`test/`](test) holds the Vitest suite that runs in CI (`npm test`):

| Test | Proves |
|------|--------|
| [`money.test.ts`](test/money.test.ts) | Integer amount conversion + fee splits (no float drift, remainder→seller) |
| [`webhook.test.ts`](test/webhook.test.ts) | Webhook auth (401), bad body (400), idempotent credit, retry-on-error (500) |
| [`subscription.test.ts`](test/subscription.test.ts) | Cadence (`canChargeNow`), cap (`withinCap`), one charge per period under duplicate runs |
| [`token2022.test.ts`](test/token2022.test.ts) | Transfer-fee math + gross-up (capped and uncapped) |
| [`screening.test.ts`](test/screening.test.ts) | Block sanctioned, review on velocity, record-always / proceed-only-on-allow |
| [`actions.test.ts`](test/actions.test.ts) | Well-formed Blink metadata (presets + custom-amount parameter) |
| [`stablecoins.test.ts`](test/stablecoins.test.ts) | Verified USDC mints; non-USDC flagged for verification; refuses to guess |

## On-chain subscription program

See [`subscription-program/`](subscription-program) for a reference Anchor program that enforces the subscription **cap and cadence on-chain** (the production-grade design from `skill/subscriptions.md`). It ships with **Rust unit tests** (`cargo test`, proving the cadence rule) and **clock-warped bankrun integration tests** ([`subscription-program/tests`](subscription-program/tests)), plus a full build/deploy guide. Build it with the Anchor toolchain.
