/**
 * Aion admin telemetry dashboard — Phase 3 §3.10 Wk 15b.
 *
 * Internal admin route. Renders the four cross-workspace metric cards
 * shipped in Wk 15a + the kill-metric stat from Wk 13. Server component
 * end-to-end — no client JS needed for v1; refresh by hitting reload.
 *
 * Auth gate is doubled: the page checks `isAionAdmin(user.id)` before any
 * DB work, AND the underlying metric RPCs in `aion.*` are GRANTed to
 * service_role only. A non-admin authenticated user gets a 404.
 *
 * Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.10
 */

import { notFound } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { isAionAdmin } from '@/app/api/aion/lib/admin-perimeter';
import { TelemetryDashboard } from './TelemetryDashboard';
import { fetchAdminMetrics } from './fetch-metrics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AionTelemetryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAionAdmin(user.id)) {
    // Don't reveal admin route exists for non-admins. notFound() renders
    // the standard 404 — same as a real missing page.
    notFound();
  }

  const result = await fetchAdminMetrics();

  return (
    <TelemetryDashboard
      dismissRate={result.dismissRate}
      hitRate={result.hitRate}
      toolDepth={result.toolDepth}
      clickThrough={result.clickThrough}
      killMetric={result.killMetric}
      generatedAt={new Date().toISOString()}
      errors={result.errors}
    />
  );
}
