# Starter — accept USDC in ~10 minutes

A complete, minimal, **type-checked** checkout you can run. One file of server glue ([`server.ts`](server.ts)) + one HTML page ([`public/checkout.html`](public/checkout.html)) wired to the skill's core pieces:

- **POST `/api/orders`** — creates an order, a Solana Pay URL, and a unique `reference` (from [`../src/checkout.ts`](../src/checkout.ts)).
- **GET `/api/orders/:id/status`** — verifies **on-chain** + credits **idempotently** (from [`../src/verify-and-credit.ts`](../src/verify-and-credit.ts)).
- **GET `/`** — the drop-in checkout page (QR + status polling).

## Run it (devnet)

```bash
cd examples
npm install

MERCHANT=<your-devnet-wallet-pubkey> \
RPC_URL=https://api.devnet.solana.com \
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU \
node --import tsx starter/server.ts
# open http://localhost:3000, click Pay, scan with a wallet holding devnet USDC
```

(Get devnet USDC from a faucet — see [`../../skill/testing.md`](../../skill/testing.md).)

## What it intentionally keeps simple

- **In-memory store** (a `Map` + a `Set` for signature idempotency) — swap for a real DB ([`../../skill/receipts-ledger.md`](../../skill/receipts-ledger.md)).
- **Polling** for status — add a webhook for production ([`../../skill/webhooks.md`](../../skill/webhooks.md)).
- **`confirmed`** finality — require `finalized` before anything irreversible ([`../../skill/verifying-payments.md`](../../skill/verifying-payments.md)).

## What it gets right (on purpose)

- The **client never decides "paid"** — the page polls the server, which verifies on-chain.
- Crediting is **idempotent** — the same payment can't be applied twice.
- Each order has a **unique reference**, so settlement lookup is exact.

From here, layer on [gasless payments](../../skill/gasless-payments.md) (pay with no SOL), the [React component](../../skill/react-checkout.md), or [subscriptions](../../skill/subscriptions.md).
