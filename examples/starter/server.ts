/**
 * 0 → accepting USDC in ~10 minutes — a complete, minimal, type-checked starter.
 *
 * One file, no framework: it wires together the skill's three core pieces —
 *   POST /api/orders            → create an order + Solana Pay URL + unique reference
 *   GET  /api/orders/:id/status → verify ON-CHAIN + idempotent credit, report status
 *   GET  /                      → serve the drop-in checkout page (public/checkout.html)
 *
 * The verification gate and the request builder come from ../src — this just adds the
 * HTTP glue + an in-memory store so you can run it and see the whole loop work.
 *
 *   RPC_URL=https://api.devnet.solana.com \
 *   MERCHANT=<your devnet wallet> USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU \
 *   node --import tsx starter/server.ts
 */
import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Connection, PublicKey } from '@solana/web3.js';
import { createCheckout } from '../src/checkout';
import {
  verifyAndCredit,
  type PaymentStore,
  type ExpectedPayment,
  type VerifyResult,
} from '../src/verify-and-credit';

const PORT = Number(process.env.PORT ?? 3000);
const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
const MERCHANT = new PublicKey(process.env.MERCHANT ?? '11111111111111111111111111111111');
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // devnet USDC
);

const connection = new Connection(RPC_URL, 'confirmed');

// --- in-memory stores (swap for a real DB in production) ---
interface Order {
  expected: ExpectedPayment;
  status: 'awaiting' | 'confirmed' | 'expired';
  signature?: string;
  createdAt: number;
}
const orders = new Map<string, Order>();
const seenSignatures = new Set<string>();

const store: PaymentStore = {
  async insertIfAbsent(record) {
    if (seenSignatures.has(record.signature)) return false; // idempotent: already credited
    seenSignatures.add(record.signature);
    return true;
  },
  async markPaid(orderId, signature) {
    const o = orders.get(orderId);
    if (o) {
      o.status = 'confirmed';
      o.signature = signature;
    }
  },
};

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const ORDER_TTL_MS = 10 * 60 * 1000;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  try {
    // Create an order → Solana Pay URL + unique reference.
    if (req.method === 'POST' && url.pathname === '/api/orders') {
      const body = await readBody(req).then((b) => (b ? JSON.parse(b) : {}));
      const amountHuman = String(body.amount ?? '1.00');

      const { url: payUrl, reference } = createCheckout({
        recipient: MERCHANT,
        mint: USDC_MINT,
        amountHuman,
        label: 'Starter Store',
        message: 'Thanks for your order',
      });
      const orderId = reference.toBase58().slice(0, 12);
      orders.set(orderId, {
        expected: { orderId, recipient: MERCHANT, amountHuman, mint: USDC_MINT, reference },
        status: 'awaiting',
        createdAt: Date.now(),
      });
      return json(res, 200, { orderId, url: payUrl.toString(), reference: reference.toBase58() });
    }

    // Poll status → verify on-chain + credit idempotently.
    const statusMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
    if (req.method === 'GET' && statusMatch) {
      const order = orders.get(statusMatch[1]);
      if (!order) return json(res, 404, { error: 'unknown order' });

      if (order.status === 'confirmed') {
        return json(res, 200, { status: 'confirmed', signature: order.signature });
      }
      if (Date.now() - order.createdAt > ORDER_TTL_MS) {
        order.status = 'expired';
        return json(res, 200, { status: 'expired' });
      }

      const result: VerifyResult = await verifyAndCredit(connection, store, order.expected, 'confirmed');
      if (result.status === 'pending') return json(res, 200, { status: 'awaiting' });
      return json(res, 200, { status: 'confirmed', signature: result.signature });
    }

    // Serve the checkout page.
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile(new URL('./public/checkout.html', import.meta.url), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(html);
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Starter checkout on http://localhost:${PORT}  (RPC: ${RPC_URL})`);
});
