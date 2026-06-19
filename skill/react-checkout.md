# Drop-in React Checkout

> The frontend glue is where most Solana checkouts get messy: connect a wallet, render a QR/link, poll for settlement, and reflect every state (`idle → awaiting → confirmed → finalized`, plus `expired`/`error`) without the client ever lying about whether you got paid. This packages that into one hook and one component, so a checkout UI is a single tag.

## The canonical lifecycle

```
idle ─▶ creating ─▶ awaiting ─▶ confirmed ─▶ finalized
                       │             (wait for finalized only if the action is irreversible)
                       ├─▶ expired   (window closed / timed out)
                       └─▶ error
```

Everyone reinvents this state machine — usually missing `expired` or the `confirmed` vs `finalized` distinction. Encode it once. Runnable: [examples/src/use-payment.ts](../examples/src/use-payment.ts) + [examples/src/react-checkout.tsx](../examples/src/react-checkout.tsx).

## The golden rule of a payment UI

**The client never decides "paid."** It polls a **server** endpoint that does the real on-chain verification ([verifying-payments.md](verifying-payments.md)). The UI only renders whatever the server reports. A wallet's "success" screen is not settlement.

## The hook

```tsx
const { status, order, signature, error, start, reset } = usePayment({
  createOrder: () => fetch('/api/orders', { method: 'POST' }).then(r => r.json()), // → { orderId, url, reference }
  getStatus: (id) => fetch(`/api/orders/${id}/status`).then(r => r.json()),         // server verifies on-chain
  until: 'confirmed', // or 'finalized' for irreversible fulfillment
});
```

- `createOrder` hits your server, which creates the order + Solana Pay URL + unique `reference` and persists them.
- `getStatus` hits your server, which runs find → validate → idempotent credit and returns `awaiting | confirmed | finalized | expired`.
- The hook polls, bounds itself with a timeout (→ `expired`), and cancels cleanly on unmount.

## The component

```tsx
<SolanaCheckout
  createOrder={createOrder}
  getStatus={getStatus}
  onPaid={(sig) => router.push(`/thank-you?tx=${sig}`)}
  qrSrc={(url) => `/api/qr?data=${encodeURIComponent(url)}`}  // optional QR renderer
  until="confirmed"
/>
```

It renders the pay link (and QR if you provide `qrSrc`), shows each state, fires `onPaid` once settled, and offers retry on `expired`/`error`. Style via the `data-status` attribute or the `solana-checkout__*` classes.

## Rendering the QR

`@solana/pay`'s `createQR` runs in the browser and returns a styleable QR object. To keep this component dependency-light it takes a `qrSrc(url)` callback instead, so you can render the QR however you like (a server `/api/qr` route, `createQR`, or any QR lib). Either way the QR encodes the Solana Pay `url` from `createOrder`.

## Wallet connection

For an in-app "click to pay" flow (vs scanning a QR), use the standard wallet adapter to sign the transaction the server builds. The QR/link flow above needs **no** wallet connection on your page at all — the customer's phone wallet handles it — which is why it's the simplest path to start. (Wallet-adapter UI itself is solana-dev-skill frontend territory.)

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Client marks the order paid | Trivially forged free goods | Poll a server that verifies on-chain |
| No `expired` state | UI spins forever | Bound polling with a timeout |
| Polling never cancelled | Memory leak / requests after unmount | Cancel on unmount (the hook does) |
| Treating `confirmed` as final | Reorg risk for shipping/payout | `until: 'finalized'` for irreversible actions |
| Hammering the RPC from the client | Rate limits, leaked keys | Poll your server, not the RPC directly |

## How this fits

The UI sits on top of the server-side gate in [verifying-payments.md](verifying-payments.md) and the request from [solana-pay.md](solana-pay.md) / [payment-links.md](payment-links.md). Pair it with [gasless-payments.md](gasless-payments.md) so the customer never sees a "you need SOL" error, and with the [10-minute starter](../examples/starter) for a full working wiring.
