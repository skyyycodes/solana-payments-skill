# Payment Links & Invoices

> A thin product layer over Solana Pay: turn a payment request into something you can **text, email, embed, or print as a QR** — and a hosted checkout page that watches for settlement. Mechanics reuse [solana-pay.md](solana-pay.md); verification reuses [verifying-payments.md](verifying-payments.md).

## What a "payment link" actually is

Two shapes, both built on Solana Pay:

1. **A raw Solana Pay URL** (`solana:...`) — opens directly in a mobile wallet. Great as a QR; not clickable as a normal web link on desktop.
2. **A hosted checkout page** (`https://pay.example.com/i/<id>`) — your page that renders the order, shows a QR + "open in wallet" button, and polls for settlement. This is what most products want.

## Pattern: hosted invoice/checkout

### 1. Create an invoice (server)

```typescript
type Invoice = {
  id: string;              // public link id
  reference: string;       // base58 of a fresh Keypair().publicKey — unique per invoice
  recipient: string;       // merchant wallet/owner
  mint: string;            // USDC mint (per cluster)
  amount: string;          // human units, e.g. '25.00'
  label: string;
  message: string;
  status: 'pending' | 'paid' | 'expired';
  expiresAt: number;
};

// POST /api/invoices  → persist Invoice with a fresh reference, return { id, url }
```

### 2. Render the checkout page

```typescript
import { encodeURL, createQR } from '@solana/pay';
import { PublicKey } from '@solana/web3.js';
import BigNumber from 'bignumber.js';

function renderInvoice(inv: Invoice) {
  const url = encodeURL({
    recipient: new PublicKey(inv.recipient),
    amount: new BigNumber(inv.amount),
    splToken: new PublicKey(inv.mint),
    reference: new PublicKey(inv.reference),
    label: inv.label,
    message: inv.message,
  });
  const qr = createQR(url, 360, 'transparent');
  // append qr; also expose url as an "Open in wallet" button (href = url.toString())
  return url;
}
```

### 3. Watch for settlement

The page polls `GET /api/invoices/:id/status`, which runs the standard verification (`findReference` → `validateTransfer`) and updates `status` **idempotently**. → [verifying-payments.md](verifying-payments.md).

```typescript
// client: poll until paid or expired
async function pollStatus(id: string) {
  const t = setInterval(async () => {
    const { status } = await fetch(`/api/invoices/${id}/status`).then(r => r.json());
    if (status === 'paid') { clearInterval(t); showSuccess(); }
    if (status === 'expired') { clearInterval(t); showExpired(); }
  }, 2000);
}
```

## Expiry & price quoting

- **Set an `expiresAt`.** Stale links shouldn't be payable forever at an old price. (The on-chain reference still works, so reconcile late payments rather than dropping them — see [verifying-payments.md](verifying-payments.md).)
- **If you quote in fiat** (e.g. "$25"), lock the USDC amount at invoice creation. For volatile assets (SOL), quote a short TTL and re-quote on expiry.
- **One reference per invoice.** Never reuse — it's how you bind the payment to the link.

## Multi-use vs single-use links

| Type | Reference strategy | Verification |
|------|--------------------|--------------|
| Single invoice (order #123) | One fixed reference | Match that reference |
| Reusable "tip jar" / donation link | Generate a fresh reference **per visit/session** and track each | Each payment is its own reference/record |

A reusable link that shares one reference can't distinguish payers — generate per-session references if you need to attribute payments.

## Security

- Links are **bearer**-ish: anyone with the link can pay (usually fine — they're paying *you*). Don't put secrets in them.
- Verify server-side; the page UI is just a convenience.
- Sanitize `label`/`message` you render (they may be user-supplied for merchant-of-record setups).

## How this fits

Links/invoices = [solana-pay.md](solana-pay.md) request + a hosted page + [verifying-payments.md](verifying-payments.md) settlement. On-chain sends (transaction-request links) land via [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill).
