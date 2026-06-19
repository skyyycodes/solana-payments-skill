/**
 * Risk & sanctions screening — screen → decide → record.
 *
 * Before crediting (and especially before off-ramping), check the counterparty wallet
 * against a sanctions/deny list and apply velocity limits. This is pure and injectable so
 * it's testable and provider-agnostic (plug in OFAC SDN data, a screening API, etc.).
 *
 * Compliance note: this is plumbing, not legal advice. Use authoritative, up-to-date lists
 * and follow your jurisdiction's requirements.
 */
export type Decision = 'allow' | 'block' | 'review';

export interface ScreenResult {
  decision: Decision;
  reasons: string[];
}

export interface VelocityWindow {
  /** Count of payments from this wallet within the window. */
  count: number;
  /** Total base units moved by this wallet within the window. */
  totalBaseUnits: bigint;
}

export interface VelocityLimits {
  maxCount: number;
  maxTotalBaseUnits: bigint;
}

export interface ScreenInput {
  wallet: string; // base58
  amountBaseUnits: bigint;
  /** Sanctioned / denied addresses (normalized base58). Source from an authoritative list. */
  denyList: ReadonlySet<string>;
  /** Optional recent-activity window for velocity checks. */
  velocity?: VelocityWindow;
  limits?: VelocityLimits;
}

/** Pure screening decision. `block` = never proceed; `review` = hold for manual review. */
export function screen(input: ScreenInput): ScreenResult {
  const reasons: string[] = [];

  if (input.denyList.has(input.wallet)) {
    return { decision: 'block', reasons: ['wallet on sanctions/deny list'] };
  }

  if (input.velocity && input.limits) {
    if (input.velocity.count + 1 > input.limits.maxCount) {
      reasons.push('velocity: payment count limit exceeded');
    }
    if (input.velocity.totalBaseUnits + input.amountBaseUnits > input.limits.maxTotalBaseUnits) {
      reasons.push('velocity: amount limit exceeded');
    }
  }

  if (reasons.length > 0) return { decision: 'review', reasons };
  return { decision: 'allow', reasons: [] };
}

export interface ScreenRecord {
  wallet: string;
  decision: Decision;
  reasons: string[];
  at: string; // ISO timestamp
}

/**
 * Screen, then act, recording every decision for audit. The `proceed` callback only runs
 * on 'allow'. 'review'/'block' are recorded and surfaced to the caller.
 */
export async function screenAndRecord(
  input: ScreenInput,
  record: (r: ScreenRecord) => Promise<void>,
  proceed: () => Promise<void>,
): Promise<ScreenResult> {
  const result = screen(input);
  await record({
    wallet: input.wallet,
    decision: result.decision,
    reasons: result.reasons,
    at: new Date().toISOString(),
  });
  if (result.decision === 'allow') await proceed();
  return result;
}
