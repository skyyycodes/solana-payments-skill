/**
 * SolanaCheckout — a drop-in checkout component.
 *
 * Wraps usePayment so the entire frontend is one tag:
 *   <SolanaCheckout createOrder={...} getStatus={...} onPaid={...} />
 *
 * It renders the Solana Pay link/QR and reflects each lifecycle state. It does NOT decide
 * "paid" — the server (via getStatus) is the source of truth.
 */
import { useEffect } from 'react';
import { usePayment, type CreatedOrder, type ServerStatus } from './use-payment';

export interface SolanaCheckoutProps {
  createOrder: () => Promise<CreatedOrder>;
  getStatus: (orderId: string) => Promise<ServerStatus>;
  onPaid?: (signature: string) => void;
  /** Optional: a function that turns a Solana Pay URL into a QR image src. */
  qrSrc?: (url: string) => string;
  autoStart?: boolean;
  until?: 'confirmed' | 'finalized';
}

const LABEL: Record<string, string> = {
  idle: 'Ready',
  creating: 'Creating order…',
  awaiting: 'Waiting for payment…',
  confirmed: 'Payment confirmed',
  finalized: 'Payment finalized',
  expired: 'Payment window expired',
  error: 'Something went wrong',
};

export function SolanaCheckout(props: SolanaCheckoutProps) {
  const { status, order, signature, error, start, reset } = usePayment({
    createOrder: props.createOrder,
    getStatus: props.getStatus,
    until: props.until,
  });

  useEffect(() => {
    if (props.autoStart) void start();
  }, [props.autoStart, start]);

  useEffect(() => {
    if ((status === 'confirmed' || status === 'finalized') && signature) {
      props.onPaid?.(signature);
    }
  }, [status, signature, props]);

  const paid = status === 'confirmed' || status === 'finalized';
  const active = status === 'awaiting';

  return (
    <div className="solana-checkout" data-status={status}>
      <p className="solana-checkout__status">{LABEL[status] ?? status}</p>

      {active && order && (
        <div className="solana-checkout__pay">
          {props.qrSrc ? (
            <img src={props.qrSrc(order.url)} alt="Scan to pay with a Solana wallet" width={240} height={240} />
          ) : null}
          <a href={order.url}>Open in wallet</a>
        </div>
      )}

      {paid && signature && (
        <a
          className="solana-checkout__receipt"
          href={`https://solscan.io/tx/${signature}`}
          target="_blank"
          rel="noreferrer"
        >
          View receipt
        </a>
      )}

      {error && <p className="solana-checkout__error">{error}</p>}

      {status === 'idle' && <button onClick={() => void start()}>Pay with Solana</button>}
      {(status === 'expired' || status === 'error') && <button onClick={reset}>Try again</button>}
    </div>
  );
}
