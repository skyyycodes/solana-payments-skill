# Solana Actions & Blinks (payments as a shareable URL)

> This is **how people share payments in 2026.** A *Blink* (blockchain link) is a normal URL that any supporting client — X, Discord, a wallet, a browser extension — unfurls into a native **pay button**. Behind it is a *Solana Action*: a tiny HTTP API your server hosts that returns metadata (GET) and a ready-to-sign transaction (POST). A payments skill without Actions is missing the ecosystem's standard distribution channel.

## The mental model

An Action is **two HTTP handlers** on one URL:

```
GET  /api/actions/pay        → ActionGetResponse   (icon, title, description, buttons)
POST /api/actions/pay        → ActionPostResponse  (a base64 transaction to sign)
```

A **Blink** is just that Action URL wrapped so a client can render it. You make a URL discoverable as a Blink by:

1. Hosting the GET/POST handlers (below).
2. Serving an **`actions.json`** at your domain root so clients know which paths are Actions and how to map them.
3. Setting permissive **CORS headers** (`ACTIONS_CORS_HEADERS`) so any client can call you.

Runnable handler: [examples/src/actions-handler.ts](../examples/src/actions-handler.ts). Use the real [`@solana/actions`](https://github.com/solana-developers/solana-actions) package in production — it ships these exact types plus `createPostResponse` and `ACTIONS_CORS_HEADERS`; the example inlines the shapes so it stays type-checked without coupling to a version.

## GET — describe the payment

```typescript
const action = getPaymentAction({
  baseHref: 'https://shop.example/api/actions/pay',
  icon: 'https://shop.example/icon.png',
  title: 'Pay Acme',
  description: 'Pay in USDC',
});
// → { type:'action', icon, title, description, label:'Pay', links:{ actions:[ ...buttons ] } }
```

`links.actions` lets you offer preset amounts **and** a custom-amount field via `parameters` and a `{amount}` placeholder in the `href`. The client renders these as buttons / an input.

## POST — return a transaction to sign

The body carries `{ account }` (the user's wallet). Build the **exact same** USDC payment you'd build anywhere else, attach a `reference`, serialize to base64, return it. The client's wallet signs and sends it.

```typescript
const { response, reference } = await postPaymentAction(connection, body, {
  recipient, mint: usdcMint, amount,
});
// persist `reference` → then verify settlement exactly like any other payment
return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
```

**Critical:** an Action transaction settles like any other payment. Store the `reference`, then confirm on-chain with the same recipient/amount/mint/reference checks and idempotent credit from [verifying-payments.md](verifying-payments.md). Never treat "wallet signed the Action" as "paid."

## `actions.json` (makes your URLs Blinks)

Served at `https://shop.example/actions.json`:

```json
{
  "rules": [
    { "pathPattern": "/pay", "apiPath": "/api/actions/pay" },
    { "pathPattern": "/api/actions/**", "apiPath": "/api/actions/**" }
  ]
}
```

This maps a shareable, human path (`/pay`) to the Action API path. Share `https://shop.example/pay` anywhere Blink-aware and it becomes a pay button.

## Don't skip these

| Rule | Why |
|------|-----|
| **CORS headers on every response** (incl. `OPTIONS`) | Clients call cross-origin; without them the Blink silently fails to load |
| **Verify settlement server-side with the `reference`** | A signed Action ≠ a confirmed payment; only on-chain verification credits the order |
| **Validate `account` and the requested `amount`** | The POST body is attacker-controlled; clamp amount, reject junk pubkeys |
| **Make the build idempotent per order** | Users click twice; one order → one reference → one credit |
| **HTTPS + a stable `icon`** | Required for the Blink to render and look trustworthy |
| **Don't put secrets in the GET metadata** | It's public and cached by unfurlers |

## How this fits

Actions are a **front door** to the same engine: the POST builds a normal [USDC payment](usdc-payments.md) (optionally [gasless](gasless-payments.md)), it [lands via the delivery layer](send-and-confirm.md), and you [verify + credit](verifying-payments.md) by `reference`. It's the distribution counterpart to the [drop-in React checkout](react-checkout.md): Blinks for *sharing anywhere*, the component for *your own site*. See [resources.md](resources.md) for spec + dialect links.
