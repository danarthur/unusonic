/**
 * Settings → Billing — subscription invoice history, payment method, audit trail.
 *
 * Separate from /settings/plan (which handles tier selection).
 * This page shows the money side: past invoices, payment method management
 * via Stripe Customer Portal, and subscription event history.
 *
 * @module app/(dashboard)/settings/billing/page
 */

import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { BillingPageClient } from './billing-page-client';

export default async function BillingPage() {
  const supabase = await createClient();

  // Get current workspace from session
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div>Not authenticated</div>;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return <div>No workspace found</div>;
  const workspaceId = membership.workspace_id;

  // Fetch workspace billing state
  const { data: workspace } = await (supabase as any)
    .from('workspaces')
    .select('name, subscription_tier, billing_status, stripe_customer_id, stripe_subscription_id, current_period_end, trial_ends_at, cancel_at_period_end, extra_seats, aion_actions_used')
    .eq('id', workspaceId)
    .maybeSingle();

  // Fetch cached subscription invoices
  const system = getSystemClient();
  const { data: invoices } = await (system as any)
    .from('subscription_invoices')
    .select('stripe_invoice_id, amount_paid, currency, status, period_start, period_end, hosted_invoice_url, invoice_pdf_url, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(12);

  // Fetch subscription events for audit trail
  const { data: events } = await (system as any)
    .from('subscription_events')
    .select('id, event_kind, from_state, to_state, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <BillingPageClient
      workspaceId={workspaceId}
      workspace={workspace}
      invoices={invoices ?? []}
      events={events ?? []}
    />
  );
}
