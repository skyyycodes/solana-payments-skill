# Solana Pay — Transfer & Transaction Requests

> The REQUEST layer. Solana Pay is the open standard for asking for a payment via a URL (rendered as a link or QR). It has two modes: a **transfer request** (a declarative "send X to Y") and a **transaction request** (your server returns an arbitrary transaction to sign). Pair it with the **reference** key so you can later find and verify the exact payment. → settle in [verifying-payments.md](verifying-payments.md).

## Library

```bash
npm i @solana/pay @solana/web3.js bignumber.js
# QR rendering (browser): @solana/pay exposes createQR
```

`@solana/pay` gives you: `encodeURL`, `parseURL`, `createQR`, `findReference`, `validateTransfer`, and `createTransfer`.

## Mode 1 — Transfer request (declarative, most common)

A URL that says "pay this recipient this amount in this token, tagged with this reference." The wallet builds the transfer itself.

### The URL scheme

```
solana:<recipient>
  ?amount=<decimal>            # human units, e.g. 1.5 (NOT base units)
  &spl-token=<mint>            # omit for native SOL
  &reference=<pubkey>          # one or more; unique per order; used to find the tx later
  &label=<merchant name>       # display only
  &message=<order message>     # display only
  &memo=<on-chain memo>        # optional, written on-chain
```

### Build it

```typescript
import { encodeURL, createQR } from '@solana/pay';
import { PublicKey, Keypair } from '@solana/web3.js';
import BigNumber from 'bignumber.js';

const recipient = new PublicKey(MERCHANT_WALLET);     // or merchant USDC ATA owner
const reference = new Keypair().publicKey;            // UNIQUE per order — store it with order #123
const amount = new BigNumber('25.00');                // human units
const usdcMint = new PublicKey(USDC_MINT);            // verify per cluster (see resources.md)

const url = encodeURL({
  recipient,
  amount,
  splToken: usdcMint,
  reference,
  label: 'Acme Store',
  message: 'Order #123 — 1x Widget',
  memo: 'order:123',
});

// Render a QR for the customer:
const qr = createQR(url, 360, 'transparent');
// qr.append(document.getElementById('qr')!);  // browser
```

> **`reference` is the linchpin.** It's a throwaway public key (no secret needed) added to the transfer's account keys. It does nothing on-chain but lets you `findReference()` the payment later and bind it to order #123. **Generate a fresh one per order and persist it.**

### Amount units gotcha

The URL `amount` is in **human/UI units** (`25.00`), but on-chain transfers use **base units** (USDC has 6 decimals → `25_000_000`). `@solana/pay`'s `validateTransfer` handles the conversion when you give it a `BigNumber` amount; your own checks must not confuse the two. → [usdc-payments.md](usdc-payments.md).

## Mode 2 — Transaction request (server builds the tx)

Use when the payment isn't a plain transfer — e.g. it also mints an NFT, calls your program, splits fees, or adds a memo/loyalty instruction. The Solana Pay URL points at an **HTTPS endpoint** you host.

```
solana:https://store.example.com/api/pay?order=123
```

The wallet hits your endpoint in two steps:

```typescript
// GET  -> label + icon for the wallet UI
export function GET() {
  return Response.json({ label: 'Acme Store', icon: 'https://store.example.com/icon.png' });
}

// POST { account } -> a base64, serialized transaction for the customer to sign
export async function POST(req: Request) {
  const { account } = await req.json();          // the customer's pubkey
  const payer = new PublicKey(account);

  // Build the transfer (+ any extra instructions) with a fresh reference + the customer as fee payer.
  // Land/confirm later via solana-tx-skill once the wallet returns the signed tx.
  const tx = await buildOrderTransaction(payer, /* order */ 123);

  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return Response.json({
    transaction: Buffer.from(serialized).toString('base64'),
    message: 'Order #123 — approve to pay 25 USDC',
  });
}
```

Rules for transaction requests:
- The returned transaction must have the **customer as fee payer** (or a clearly-disclosed sponsor) and a **recent blockhash**.
- Include a unique **reference** key so you can still verify it. → [verifying-payments.md](verifying-payments.md)
- Don't include your own signature unless you're a required co-signer; partial-sign only what you must.

## Verifying the payment (always)

A Solana Pay URL is just a *request*. You must confirm it was paid:

```typescript
import { findReference, validateTransfer, FindReferenceError } from '@solana/pay';

// 1. Poll until the reference appears on-chain (or webhook). finality: 'confirmed' for UX.
let signatureInfo;
try {
  signatureInfo = await findReference(connection, reference, { finality: 'confirmed' });
} catch (e) {
  if (e instanceof FindReferenceError) return; // not paid yet — keep polling
  throw e;
}

// 2. Validate the on-chain transfer matches what you asked for (exact amount/recipient/mint).
await validateTransfer(
  connection,
  signatureInfo.signature,
  { recipient, amount, splToken: usdcMint, reference },
  { commitment: 'confirmed' },
);

// 3. Mark order #123 paid — IDEMPOTENTLY (record the signature; ignore if already processed).
```

Full settlement details (idempotency, finality, reconciliation) → [verifying-payments.md](verifying-payments.md).

## Pitfalls

| Pitfall | Fix |
|---------|-----|
| Trusting the wallet's "success" screen | Always `findReference` + `validateTransfer` server-side |
| Reusing one `reference` for many orders | Fresh keypair public key per order; store it |
| Confusing UI amount with base units | URL uses human units; on-chain math uses base units (bigint) |
| Recipient is wallet, but you accept USDC to an ATA | `validateTransfer` checks the SPL transfer to the recipient's ATA — pass `splToken` |
| No verification of `splToken` | An attacker could pay in a worthless token; always assert the mint |
| Treating `confirmed` as final for big-ticket items | Use `finalized` before shipping/releasing value |

## How this fits

- **Request** here → **asset** details in [usdc-payments.md](usdc-payments.md) → **settle** in [verifying-payments.md](verifying-payments.md).
- For shareable links/invoices built on this scheme → [payment-links.md](payment-links.md).
- Landing a transaction-request transaction reliably → [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill).
