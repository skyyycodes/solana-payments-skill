# Durable Nonces

> Layer 4 (alternative lifetime). A normal transaction dies when its blockhash expires (~60–90s). A **durable nonce** replaces the blockhash with a stored, on-chain value that only changes when you advance it - so a signed transaction stays valid indefinitely. Use it when the ~90-second window is too short.

## When you actually need this

Durable nonces add complexity (an on-chain account + rent + an extra instruction). Only reach for them when blockhash expiry is a real problem:

| Use case | Why a nonce |
|----------|-------------|
| Offline / cold-wallet signing | Sign now, broadcast hours/days later |
| Multisig (e.g. Squads) collecting signatures over time | Signers may take a long time |
| Scheduled / delayed execution | Pre-sign, send at a future moment |
| Custody / approval workflows | Human approval steps exceed 90s |

> **Not** a fix for "my tx drops under load." For that, use the rebroadcast loop in [send-and-confirm.md](send-and-confirm.md). Nonces fix *expiry windows*, not *delivery*.

## How a durable nonce works

1. You create a **nonce account** owned by the System Program, holding a stored nonce value (which looks like a blockhash) and an authority.
2. Instead of a recent blockhash, your transaction uses the **stored nonce value** as its `recentBlockhash`.
3. The transaction's **first instruction must be `nonceAdvance`** (System Program). This is what proves freshness and consumes the nonce.
4. When the tx lands, `nonceAdvance` rolls the stored value to a new one - so the **same signed tx can never be replayed**.

The critical rules:
- `nonceAdvance` **must be the first instruction**.
- The tx's `recentBlockhash` field is set to the **current nonce value** (fetched from the account), not a real blockhash.
- The nonce authority must sign (it's a signer on `nonceAdvance`).

## Create a nonce account (one-time)

```typescript
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  NONCE_ACCOUNT_LENGTH,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

async function createNonceAccount(
  connection: Connection,
  payer: Keypair,
  nonceAuthority: Keypair,
): Promise<Keypair> {
  const nonceAccount = Keypair.generate();
  const rent = await connection.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
  const { blockhash } = await connection.getLatestBlockhash();

  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: nonceAccount.publicKey,
      lamports: rent,
      space: NONCE_ACCOUNT_LENGTH,
      programId: SystemProgram.programId,
    }),
    SystemProgram.nonceInitialize({
      noncePubkey: nonceAccount.publicKey,
      authorizedPubkey: nonceAuthority.publicKey,
    }),
  );

  await sendAndConfirmTransaction(connection, tx, [payer, nonceAccount]);
  return nonceAccount;
}
```

## Build & send a durable transaction

```typescript
import { NonceAccount, PublicKey, TransactionInstruction } from '@solana/web3.js';

async function buildDurableTx(
  connection: Connection,
  noncePubkey: PublicKey,
  nonceAuthority: PublicKey,
  feePayer: PublicKey,
  instructions: TransactionInstruction[],
): Promise<Transaction> {
  // 1. Read the current stored nonce value.
  const accountInfo = await connection.getAccountInfo(noncePubkey);
  if (!accountInfo) throw new Error('Nonce account not found');
  const nonceState = NonceAccount.fromAccountData(accountInfo.data);

  // 2. First instruction MUST be nonceAdvance.
  const advanceIx = SystemProgram.nonceAdvance({
    noncePubkey,
    authorizedPubkey: nonceAuthority,
  });

  // 3. Use the stored nonce as the recentBlockhash.
  const tx = new Transaction({
    feePayer,
    recentBlockhash: nonceState.nonce, // <-- the durable nonce, not getLatestBlockhash
  }).add(advanceIx, ...instructions);

  return tx; // sign later (even offline); broadcast whenever
}
```

This transaction stays valid until the nonce is advanced - by *this* tx landing, or by any other tx that advances the same nonce. It does not care about blockhash expiry.

## @solana/kit

Kit models the nonce lifetime explicitly via `setTransactionMessageLifetimeUsingDurableNonce`, and exposes the advance instruction through `@solana-program/system` (`getAdvanceNonceAccountInstruction`). The nonce-advance instruction is added automatically as the first instruction by the lifetime helper.

```typescript
import { setTransactionMessageLifetimeUsingDurableNonce } from '@solana/kit';

const txMessage = setTransactionMessageLifetimeUsingDurableNonce(
  {
    nonce,                 // current stored nonce value
    nonceAccountAddress,   // the nonce account
    nonceAuthorityAddress, // authority (must sign)
  },
  baseMessage,
);
```

## Gotchas

- **One in-flight tx per nonce.** The first landed tx advances the nonce, invalidating all others built on the old value. Don't build concurrent txs on the same nonce; use multiple nonce accounts for parallelism.
- **`nonceAdvance` must be first.** Any other ordering fails.
- **Authority must sign.** The nonce authority is a required signer (separate from, or same as, the fee payer).
- **Always read the fresh nonce value.** Don't cache it across uses - read the account right before building.
- **Rent cost.** A nonce account holds ~0.0015 SOL in rent. Close it (`nonceWithdraw` of full balance) when done if it's ephemeral.
- **Still need delivery.** Once you broadcast, the rebroadcast/confirm logic from [send-and-confirm.md](send-and-confirm.md) still applies - the nonce only solves expiry, not propagation.

## Verify

- [ ] `nonceAdvance` / durable-nonce lifetime helper makes the advance the first instruction
- [ ] `recentBlockhash` is set to the current stored nonce value, freshly read
- [ ] Nonce authority signs the transaction
- [ ] Only one transaction is built per nonce value at a time
- [ ] Ephemeral nonce accounts are closed to reclaim rent

---

**Related:** delivery & confirmation still apply → [send-and-confirm.md](send-and-confirm.md)
