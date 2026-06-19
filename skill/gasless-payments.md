# Gasless Payments (Fee Abstraction)

> The single biggest reason normal users bounce off Solana checkout: **they hold USDC but the wallet says they need SOL to pay the fee.** Every transaction needs a fee payer with SOL, so a USDC-only customer literally can't submit a payment. Fee abstraction fixes this — **your relayer pays the fee** and the customer only signs the USDC transfer. Done right, the customer needs zero SOL and you take on no custody risk.

## The idea in one line

A Solana transaction's **fee payer** doesn't have to be the same account that moves the money. Make the **relayer** the fee payer, and the **customer** just authorizes their own USDC transfer. Both sign the same transaction; the relayer only ever pays the (tiny) network fee.

## The flow

```
server   build transfer  (fee payer = RELAYER, ATA rent = relayer)  →  relayer signs
            └─ send the partially-signed tx to the client
client   customer signs the SAME tx (their USDC transfer authority only)  →  return it
server   ASSERT it still matches what we built  →  send via the delivery layer  →  verify on-chain
```

Runnable version: [examples/src/gasless-relayer.ts](../examples/src/gasless-relayer.ts).

```typescript
// server
const { partiallySigned } = await buildSponsoredTransfer(connection, relayer, {
  customer, recipient, mint: usdcMint, amount, reference,
});
// client
const fullySigned = customerSign(partiallySigned, customerWallet);
// server — never co-sign/relay blindly:
const sig = await sendSponsored(connection, fullySigned, { relayer: relayer.publicKey, instructionCount: 1 });
```

## The security model (do not skip)

Fee abstraction is safe **only** because of strict boundaries:

1. **The relayer is the fee payer, nothing more.** It never becomes a delegate or owner of the customer's tokens. The customer's signature authorizes exactly one thing: moving *their* USDC to *your* recipient.
2. **Inspect before you co-sign / relay.** A client could hand back a different transaction (swap the fee payer's role, inject instructions, change the recipient). Re-derive what you expect and assert: fee payer is still your relayer, instruction set is unchanged, both signatures present. → `assertSafeToSponsor`.
3. **You pay the fees — so rate-limit.** A public relayer is a free-fee faucet for abusers. Gate it: per-customer/order limits, require the relayer endpoint to be tied to a real order, cap sponsored tx/min.
4. **Sponsor ATA rent deliberately.** Creating the recipient's ATA costs rent; the relayer pays it. Fine for your own recipient — just know it's a real (small) cost per new token account.

## Two ways to be the fee payer

| Approach | How | Use when |
|----------|-----|----------|
| **Co-sign relayer (this guide)** | Your server holds a relayer keypair, is the fee payer, co-signs each tx | You control the backend; simplest, fully in your hands |
| **Sponsorship service / paymaster** | A third-party fee-payer service signs as fee payer via an API | You don't want to run/secure a hot key, and accept a dependency |

Both rely on the same primitive (fee payer ≠ sender). The co-sign relayer is the most transparent and is what the example implements.

## Combine with verification

Gasless changes **who pays the fee**, not how you confirm payment. Once it lands you still verify on-chain exactly as in [verifying-payments.md](verifying-payments.md) — same recipient/amount/mint/reference checks, same idempotent credit. The `reference` is attached in the build step so settlement lookup is unchanged.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Co-signing whatever the client returns | Relayer tricked into paying for arbitrary txs | Assert fee payer + instructions before sending |
| Relayer also a token delegate | Relayer can move customer funds | Relayer is fee payer ONLY |
| No rate limiting | Fee-draining abuse | Per-order/customer caps, tie to real orders |
| Relayer key in source/env plaintext | Drained relayer wallet | KMS/HSM; keep minimal SOL; alert on balance |
| Forgetting blockhash expiry | Sponsored tx silently drops | Land via the delivery layer (rebroadcast loop) |

## How this fits

This sits on top of [usdc-payments.md](usdc-payments.md) (it sponsors a normal `transferChecked`), is verified by [verifying-payments.md](verifying-payments.md), and lands through the bundled delivery layer ([send-and-confirm.md](send-and-confirm.md)). It pairs naturally with the [drop-in checkout](react-checkout.md) so the customer never sees a "you need SOL" error. Run [/payments-audit](../commands/payments-audit.md) to check your relayer guards.
