/**
 * Aion chat route — workspace data fetchers.
 *
 * Per-turn reads of workspace state used by the system prompt and supporting
 * UI: pipeline + financial pulse + follow-up queue + pending insights.
 * Plus per-user memories and the workspace display name.
 */

import { createClient } from '@/shared/api/supabase/server';
import { getFollowUpQueue } from '@/app/(dashboard)/(features)/crm/actions/follow-up-actions';
import { getDealPipeline } from '@/widgets/dashboard/api/get-deal-pipeline';
import { getFinancialPulse } from '@/widgets/dashboard/api/get-financial-pulse';
import type { WorkspaceSnapshot } from './prompts';

export async function getWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
  try {
    const { getPendingInsights } = await import('@/app/(dashboard)/(features)/aion/actions/aion-insight-actions');
    const [pipeline, pulse, queue, insights] = await Promise.all([
      getDealPipeline().catch(() => null), getFinancialPulse().catch(() => null), getFollowUpQueue().catch(() => []),
      getPendingInsights(workspaceId, 50).catch(() => []),
    ]);
    return {
      activeDealCount: pipeline?.totalDeals ?? 0,
      pipelineValue: pipeline ? `$${Math.round((pipeline.totalWeightedValue ?? 0) / 100).toLocaleString()}` : 'unknown',
      pendingFollowUps: queue.length,
      pendingInsightCount: insights.length,
      outstandingInvoiceCount: pulse?.outstandingCount ?? 0,
      outstandingTotal: pulse ? `$${Math.round((pulse.outstandingTotal ?? 0) / 100).toLocaleString()}` : '$0',
      revenueThisMonth: pulse ? `$${Math.round((pulse.revenueThisMonth ?? 0) / 100).toLocaleString()}` : 'unknown',
    };
  } catch {
    return { activeDealCount: 0, pipelineValue: 'unknown', pendingFollowUps: 0, pendingInsightCount: 0, outstandingInvoiceCount: 0, outstandingTotal: '$0', revenueThisMonth: 'unknown' };
  }
}

export async function getUserMemories(workspaceId: string, userId: string): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .schema('cortex').from('aion_memory').select('fact')
      .eq('workspace_id', workspaceId).eq('user_id', userId)
      .order('updated_at', { ascending: false }).limit(10);
    return (data as Array<{ fact: string }> | null)?.map((m) => m.fact) ?? [];
  } catch { return []; }
}

export async function getWorkspaceName(workspaceId: string): Promise<string> {
  try {
    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();
    const { data } = await system.from('workspaces').select('name').eq('id', workspaceId).maybeSingle();
    return (data as any)?.name ?? 'your workspace';
  } catch { return 'your workspace'; }
}
