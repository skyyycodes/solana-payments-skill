# Marketplace Payments & Fee Splits

> Marketplaces move money between **multiple** parties at once: the buyer pays, the seller gets the bulk, and the platform takes a fee. The win on Solana is that you can do the whole split **atomically in one transaction** — either everyone is paid or no one is — which removes the "platform got paid but the seller didn't" class of bugs entirely.

## The core idea: one transaction, multiple transfers

A single transaction can contain several `transferChecked` instructions. Put the seller payout and the platform fee in the same transaction and they settle together:

```typescript
import { createTransferCheckedInstruction, getAssociatedTokenAddress } from '@solana/spl-token';

async function buildSplitPaymentIxs(opts: {
  buyer: PublicKey;
  seller: PublicKey;
  platform: PublicKey;
  mint: PublicKey;
  total: bigint;          // base units the buyer pays
  feeBps: number;         // platform fee in basis points, e.g. 250 = 2.5%
  decimals: number;
}) {
  const fee = (opts.total * BigInt(opts.feeBps)) / 10_000n;  // integer math, no floats
  const sellerAmount = opts.total - fee;                      // remainder — never rounds away value

  const buyerAta    = await getAssociatedTokenAddress(opts.mint, opts.buyer);
  const sellerAta   = await getAssociatedTokenAddress(opts.mint, opts.seller);
  const platformAta = await getAssociatedTokenAddress(opts.mint, opts.platform);

  return [
    createTransferCheckedInstruction(buyerAta, opts.mint, sellerAta,   opts.buyer, sellerAmount, opts.decimals),
    createTransferCheckedInstruction(buyerAta, opts.mint, platformAta, opts.buyer, fee,          opts.decimals),
  ];
}
```

Key rules:
- **Compute the fee in base units with integer math**, then give the **remainder** to the seller so cents never vanish to rounding.
- **Assert every recipient ATA exists** (create the seller's / platform's ATA in the same tx if missing — see [usdc-payments.md](usdc-payments.md)).
- One reference per order still applies; you verify the buyer's total the same way as any payment.

## Verifying a split

Verification is per-recipient: confirm the **seller** received `sellerAmount` and the **platform** received `fee`, both of the correct mint, in a successful transaction tagged with your reference. `validateTransfer` checks one recipient/amount pair — for splits, validate each leg (or verify manually across the instruction list as in [verifying-payments.md](verifying-payments.md)). Credit the order **once**, keyed on the signature.

## Who signs?

- **Buyer-funded split (above):** the buyer signs one transaction that pays both seller and platform. Simplest, fully atomic, no custody.
- **Escrow / delayed payout:** buyer pays into a program-owned account; the platform releases to the seller later (after a dispute window, delivery confirmation, etc.). This needs an on-chain program and is a custody decision — see the design framework in [agents/payments-architect.md](../agents/payments-architect.md).
- **Delegate-funded:** for recurring marketplace billing, the same bounded-delegate pattern from [subscriptions.md](subscriptions.md) applies, with the split done at charge time.

## Royalties & multi-party

The pattern generalizes: add a third `transferChecked` for a creator royalty, an affiliate, or a tax-withholding wallet. Each is just another leg. Watch the **transaction size limit** — a handful of recipients fit comfortably; for very large fan-outs, batch across transactions and reconcile by reference.

## Pitfalls

| Pitfall | Consequence | Fix |
|---------|-------------|-----|
| Two separate transactions (pay seller, then fee) | One lands, one fails → inconsistent payout | Single atomic transaction |
| Float percentage math | Fee/seller amounts drift | Integer base units, remainder to seller |
| Forgetting recipient ATAs | Transfer fails | Create ATAs in the same tx |
| Verifying only the total | Seller/platform leg could be wrong | Validate each leg |
| Custodial escrow without a program | Funds stuck / trust issues | Use an audited on-chain program |

## How this fits

Built directly on [usdc-payments.md](usdc-payments.md) (the transfers) and [verifying-payments.md](verifying-payments.md) (per-leg verification), landed via [solana-tx-skill](https://github.com/skyyycodes/solana-tx-skill). For recurring marketplace charges, combine with [subscriptions.md](subscriptions.md); to accept a token the buyer holds that isn't your settlement asset, see [accepting-any-token.md](accepting-any-token.md).
