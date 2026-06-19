/**
 * Solana Actions & Blinks — a payment as a shareable URL that unfurls into a pay button
 * inside X, Discord, or any Blink-aware client.
 *
 *  - GET  your action URL  → returns metadata (icon/title/description + buttons)
 *  - POST your action URL  → returns a base64 transaction for the user's wallet to sign
 *
 * In production, import these types + helpers from `@solana/actions`
 * (`ActionGetResponse`, `ActionPostResponse`, `createPostResponse`, `ACTIONS_CORS_HEADERS`).
 * They're inlined here so the example is self-contained and type-checked without coupling
 * the skill to a specific package version — the shapes mirror the Actions spec exactly.
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { buildUsdcPayment } from './checkout';

export interface LinkedAction {
  type: 'transaction';
  label: string;
  href: string;
  parameters?: { name: string; label: string; required?: boolean }[];
}

export interface ActionGetResponse {
  type: 'action';
  icon: string;
  title: string;
  description: string;
  label: string;
  links?: { actions: LinkedAction[] };
}

export interface ActionPostRequest {
  account: string; // the user's wallet pubkey (base58)
}

export interface ActionPostResponse {
  type: 'transaction';
  transaction: string; // base64-serialized transaction
  message?: string;
}

/** CORS headers Blink clients require (mirrors ACTIONS_CORS_HEADERS from @solana/actions). */
export const ACTIONS_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Encoding, Accept-Encoding',
};

/** GET handler: the metadata a Blink renders (icon, copy, and the pay buttons). */
export function getPaymentAction(opts: {
  baseHref: string; // your POST endpoint, e.g. https://shop.xyz/api/actions/pay
  icon: string;
  title: string;
  description: string;
}): ActionGetResponse {
  return {
    type: 'action',
    icon: opts.icon,
    title: opts.title,
    description: opts.description,
    label: 'Pay',
    links: {
      actions: [
        { type: 'transaction', label: 'Pay 5 USDC', href: `${opts.baseHref}?amount=5` },
        { type: 'transaction', label: 'Pay 10 USDC', href: `${opts.baseHref}?amount=10` },
        {
          type: 'transaction',
          label: 'Pay custom',
          href: `${opts.baseHref}?amount={amount}`,
          parameters: [{ name: 'amount', label: 'USDC amount', required: true }],
        },
      ],
    },
  };
}

/**
 * POST handler: build the USDC payment transaction the wallet will sign. Returns the base64
 * transaction AND the order `reference` — persist the reference so you can verify settlement
 * exactly as any other payment (verify-and-credit.ts).
 */
export async function postPaymentAction(
  connection: Connection,
  body: ActionPostRequest,
  opts: { recipient: PublicKey; mint: PublicKey; amount: bigint },
): Promise<{ response: ActionPostResponse; reference: PublicKey }> {
  const payer = new PublicKey(body.account);
  const reference = Keypair.generate().publicKey;
  const tx = await buildUsdcPayment(connection, payer, {
    recipient: opts.recipient,
    mint: opts.mint,
    amount: opts.amount,
    reference,
  });
  const transaction = Buffer.from(tx.serialize()).toString('base64');
  return {
    response: { type: 'transaction', transaction, message: 'Confirm your payment' },
    reference,
  };
}
