/**
 * usePayment — the checkout state machine as a React hook.
 *
 * Everyone rebuilds this badly: create an order, show a QR/link, poll the SERVER (which
 * verifies on-chain) until it's paid, and reflect each state in the UI. This encodes the
 * canonical lifecycle once so the frontend is trivial.
 *
 * Status lifecycle:
 *   idle → creating → awaiting → confirmed → finalized
 *                        │            └→ (for irreversible actions, wait for finalized)
 *                        ├→ expired   (timed out / payment window closed)
 *                        └→ error
 *
 * IMPORTANT: the client NEVER decides "paid". It polls a server endpoint that does the
 * real on-chain verification (see verify-and-credit.ts). The client only renders state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type PaymentStatus =
  | 'idle'
  | 'creating'
  | 'awaiting'
  | 'confirmed'
  | 'finalized'
  | 'expired'
  | 'error';

export interface CreatedOrder {
  orderId: string;
  url: string; // Solana Pay URL (render as link or QR)
  reference: string;
}

/** Server's view of an order. The server is the source of truth (it verifies on-chain). */
export interface ServerStatus {
  status: 'awaiting' | 'confirmed' | 'finalized' | 'expired';
  signature?: string;
}

export interface UsePaymentOptions {
  createOrder: () => Promise<CreatedOrder>; // POST your /api/orders
  getStatus: (orderId: string) => Promise<ServerStatus>; // GET your /api/orders/:id/status
  pollIntervalMs?: number;
  timeoutMs?: number;
  /** Stop polling at 'confirmed' (default) or keep going until 'finalized'. */
  until?: 'confirmed' | 'finalized';
}

export interface UsePaymentResult {
  status: PaymentStatus;
  order: CreatedOrder | null;
  signature: string | null;
  error: string | null;
  start: () => Promise<void>;
  reset: () => void;
}

export function usePayment(opts: UsePaymentOptions): UsePaymentResult {
  const { createOrder, getStatus } = opts;
  const pollIntervalMs = opts.pollIntervalMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const until = opts.until ?? 'confirmed';

  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const reset = useCallback(() => {
    cancelled.current = true;
    setStatus('idle');
    setOrder(null);
    setSignature(null);
    setError(null);
  }, []);

  const start = useCallback(async () => {
    cancelled.current = false;
    setError(null);
    setSignature(null);
    setStatus('creating');
    try {
      const created = await createOrder();
      setOrder(created);
      setStatus('awaiting');

      const deadline = Date.now() + timeoutMs;
      const isDone = (s: ServerStatus['status']) =>
        until === 'finalized' ? s === 'finalized' : s === 'confirmed' || s === 'finalized';

      while (!cancelled.current && Date.now() < deadline) {
        const server = await getStatus(created.orderId);
        if (server.signature) setSignature(server.signature);
        setStatus(server.status);
        if (server.status === 'expired') return;
        if (isDone(server.status)) return;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
      if (!cancelled.current) setStatus('expired'); // timed out
    } catch (e) {
      if (cancelled.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [createOrder, getStatus, pollIntervalMs, timeoutMs, until]);

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  return { status, order, signature, error, start, reset };
}
