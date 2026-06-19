# Fiat Off-Ramp (Crypto → Bank)

> The EXIT layer. At some point money leaves Solana for a bank account or card. You almost never build this yourself — KYC/AML, banking rails, and licensing are handled by an **off-ramp provider**. Your job is the integration: create an off-ramp order, send USDC **reliably and at `finalized`** to the provider's deposit address, and reconcile via webhooks. Stay provider-agnostic.

## What you build vs what the provider handles

| You | The off-ramp provider |
|-----|-----------------------|
| Create an off-ramp order via their API | KYC/identity verification |
| Send USDC to the quoted deposit address | Banking rails / card payout |
| Verify the send `finalized` on-chain | Compliance / licensing |
| Reconcile order status via webhooks | FX + fees, payout settlement |

> Treat the provider as an external dependency behind an interface. Don't hardcode one vendor deep in your code — wrap it so you can swap providers.

## The generic flow

```
1. Quote      → ask provider: "off-ramp 100 USDC to <bank/card>" → { rate, fees, depositAddress, orderId, expiresAt }
2. Send       → transfer USDC to depositAddress (reliable, finalized)  → solana-tx-skill
3. Verify     → confirm the transfer FINALIZED on-chain (verifying-payments.md)
4. Notify     → POST the signature/orderId to the provider (if required)
5. Reconcile  → provider webhook: processing → paid_out / failed; update your ledger idempotently
```

### Step 1 — Create the off-ramp order

```typescript
// Provider-agnostic shape — adapt to the specific API (see resources.md).
type OfframpQuote = {
  orderId: string;
  depositAddress: string;   // where YOU must send USDC
  depositMint: string;      // expected mint (assert it matches your USDC!)
  amount: string;           // base/human units the provider expects
  expiresAt: number;        // quotes expire — don't send late
  fees: { network: string; provider: string };
  rate: string;             // USDC -> fiat
};

const quote: OfframpQuote = await offramp.createOrder({
  amountUsdc: '100.00',
  payoutMethod: { type: 'bank', /* token/handle from provider KYC */ },
});
```

### Step 2 — Send USDC to the deposit address (reliably)

This is a normal USDC transfer ([usdc-payments.md](usdc-payments.md)) to `quote.depositAddress`, delivered via the reliability stack ([solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill)). Before sending:

- **Assert the deposit mint** equals your USDC mint and the **amount** matches the quote exactly.
- **Respect quote expiry** — re-quote if expired; never send against a stale quote.
- Include a memo/reference if the provider requires one to attribute the deposit.

### Step 3 — Verify `finalized` before considering it sent

Off-ramps are **irreversible** once the provider pays out fiat. Verify the deposit transfer at **`finalized`** (not just `confirmed`) before marking the order funded. → [verifying-payments.md](verifying-payments.md).

### Step 4–5 — Notify & reconcile

- Some providers detect the deposit automatically; others want you to POST the signature.
- Handle the provider's **webhooks idempotently** (status transitions: `processing` → `paid_out` / `failed`). Return 200 fast; persist by `orderId`.
- On `failed`/timeout: follow the provider's refund path; never assume the USDC is lost or double-send.

## On-ramp (fiat → crypto), briefly

The reverse (card/bank → USDC in the user's wallet) is also provider-handled: you create an on-ramp order with the user's destination wallet, the provider does KYC + payment, then delivers tokens. Verify receipt on-chain like any other payment ([verifying-payments.md](verifying-payments.md)).

## Compliance reality check

- Off/on-ramps are **regulated**. You're relying on the provider's licenses; read their terms about your jurisdiction and whether you can embed their flow.
- **Never store** raw bank details / PII you don't need — let the provider hold KYC.
- Keep an auditable ledger linking `orderId ↔ signature ↔ payout status`.

## Pitfalls

| Pitfall | Fix |
|---------|-----|
| Sending against an expired quote | Check `expiresAt`; re-quote |
| Wrong mint to deposit address | Assert deposit mint == your USDC |
| Marking funded at `confirmed` | Require `finalized` (irreversible payout) |
| Non-idempotent webhook handling | Persist by `orderId`; fast 200; dedup |
| Vendor lock-in | Wrap provider behind an interface |

## How this fits

Off-ramp = a USDC transfer ([usdc-payments.md](usdc-payments.md)) delivered reliably ([solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill)), verified at `finalized` ([verifying-payments.md](verifying-payments.md)), reconciled against a provider. Provider list → [resources.md](resources.md).
