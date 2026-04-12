/**
 * Billing status enforcement — server-side gate.
 *
 * Three states with different behaviors:
 *   - active: pass (no warning)
 *   - past_due within grace period (7 days): pass with warning flag
 *   - past_due after grace / canceled: throw BillingBlockedError
 *
 * Wire this into every server action that needs a tier-gated capability.
 * The tier-gate.ts checks feature capabilities; this checks payment status.
 * Both must pass for a gated action to execute (two-gate model).
 *
 * @module shared/lib/billing-gate
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export class BillingBlockedError extends Error {
  readonly billingStatus: string;
  readonly gracePeriodEndsAt: string | null;

  constructor(billingStatus: string, gracePeriodEndsAt: string | null) {
    const message = billingStatus === 'canceled'
      ? 'Your subscription has been canceled. Reactivate to access this feature.'
      : 'Your payment is past due and the grace period has ended. Update your payment method to continue.';
    super(message);
    this.name = 'BillingBlockedError';
    this.billingStatus = billingStatus;
    this.gracePeriodEndsAt = gracePeriodEndsAt;
  }
}

export interface BillingCheckResult {
  allowed: boolean;
  warning: boolean;
  warningMessage: string | null;
  billingStatus: string;
}

/**
 * Check billing status for a workspace. Returns a result object instead
 * of throwing — use this when you want to show a warning banner without
 * blocking the action entirely.
 */
export async function checkBillingStatus(workspaceId: string): Promise<BillingCheckResult> {
  const supabase = await createClient();
  const { data: workspace } = await (supabase as any)
    .from('workspaces')
    .select('billing_status, grace_period_ends_at, cancel_at_period_end, current_period_end')
    .eq('id', workspaceId)
    .maybeSingle();

  const billingStatus: string = workspace?.billing_status ?? 'active';
  const gracePeriodEndsAt: string | null = workspace?.grace_period_ends_at ?? null;
  const now = new Date();

  if (billingStatus === 'active') {
    return { allowed: true, warning: false, warningMessage: null, billingStatus };
  }

  if (billingStatus === 'canceling') {
    const periodEnd = workspace?.current_period_end
      ? new Date(workspace.current_period_end)
      : null;
    const daysLeft = periodEnd
      ? Math.ceil((periodEnd.getTime() - now.getTime()) / 86400000)
      : null;

    return {
      allowed: true,
      warning: true,
      warningMessage: daysLeft !== null
        ? `Your subscription ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. You will revert to the Foundation plan.`
        : 'Your subscription is ending soon.',
      billingStatus,
    };
  }

  if (billingStatus === 'past_due') {
    const graceEnd = gracePeriodEndsAt ? new Date(gracePeriodEndsAt) : null;

    if (graceEnd && now < graceEnd) {
      // Within grace period — warn but allow
      const daysLeft = Math.ceil((graceEnd.getTime() - now.getTime()) / 86400000);
      return {
        allowed: true,
        warning: true,
        warningMessage: `Payment failed. Update your payment method within ${daysLeft} day${daysLeft === 1 ? '' : 's'} to avoid losing access to premium features.`,
        billingStatus,
      };
    }

    // Grace period expired — block tier-gated features
    return {
      allowed: false,
      warning: true,
      warningMessage: 'Your payment is past due and the grace period has ended. Update your payment method to continue using premium features.',
      billingStatus,
    };
  }

  if (billingStatus === 'canceled') {
    return {
      allowed: false,
      warning: true,
      warningMessage: 'Your subscription has been canceled. Reactivate to access premium features.',
      billingStatus,
    };
  }

  // Unknown status — default to allowed (safe for new statuses)
  return { allowed: true, warning: false, warningMessage: null, billingStatus };
}

/**
 * Throws BillingBlockedError if the workspace's billing status blocks
 * tier-gated features. Use this as a guard at the top of server actions
 * that require an active subscription.
 *
 * Foundation-tier features (basic CRM, basic events) should NOT call this.
 * Only call for tier-gated actions (Aion active/autonomous, custom roles,
 * advanced reporting, etc.).
 */
export async function requireBillingActive(workspaceId: string): Promise<void> {
  const result = await checkBillingStatus(workspaceId);
  if (!result.allowed) {
    throw new BillingBlockedError(result.billingStatus, null);
  }
}
