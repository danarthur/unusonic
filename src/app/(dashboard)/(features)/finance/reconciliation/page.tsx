/**
 * Reconciliation surface — Phase 1.3.
 *
 * One sub-route off /finance. Server Component fetches all five reconciliation
 * metrics in parallel and hands them to the client renderer. Gated on
 * finance:reconcile capability — admin and owner only by default.
 *
 * @module app/(features)/finance/reconciliation
 */

import 'server-only';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import { hasCapability } from '@/shared/lib/permissions';
import { callMetric, type MetricResult } from '@/shared/lib/metrics/call';
import { ReconciliationClient } from './reconciliation-client';

export const dynamic = 'force-dynamic';

async function getWorkspaceId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get('workspace_id')?.value;
    if (fromCookie) return fromCookie;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    return membership?.workspace_id ?? null;
  } catch {
    return null;
  }
}

export default async function ReconciliationPage() {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect('/login');

  const allowed = await hasCapability(null, workspaceId, 'finance:reconcile');
  if (!allowed) redirect('/finance');

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getFullYear(), 0, 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const year = periodEnd.getFullYear();

  const [syncHealth, variance, unreconciled, invoiceVariance, salesTax, form1099] =
    await Promise.all<MetricResult>([
      callMetric(workspaceId, 'finance.qbo_sync_health'),
      callMetric(workspaceId, 'finance.qbo_variance'),
      callMetric(workspaceId, 'finance.unreconciled_payments'),
      callMetric(workspaceId, 'finance.invoice_variance'),
      callMetric(workspaceId, 'finance.sales_tax_worksheet', {
        period_start: fmt(periodStart),
        period_end: fmt(periodEnd),
      }),
      callMetric(workspaceId, 'finance.1099_worksheet', { year }),
    ]);

  return (
    <ReconciliationClient
      workspaceId={workspaceId}
      results={{ syncHealth, variance, unreconciled, invoiceVariance, salesTax, form1099 }}
      defaultPeriod={{ start: fmt(periodStart), end: fmt(periodEnd) }}
      defaultYear={year}
    />
  );
}
