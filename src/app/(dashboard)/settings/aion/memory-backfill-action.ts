'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import {
  backfillWorkspaceContentEmbeddings,
  type BackfillResult,
} from '@/app/api/aion/lib/backfill-embeddings';
import {
  auditWorkspaceContentFill,
  type FillAuditResult,
} from '@/app/api/aion/lib/audit-embeddings';
import {
  estimateAiSummaryBackfillCost,
  runAiSummaryBackfill,
  type AiSummaryCostEstimate,
  type AiSummaryBackfillResult,
} from '@/app/api/aion/lib/ai-summary-backfill';

export type MemoryBackfillResult =
  | { success: true; workspaceId: string; result: BackfillResult }
  | { success: false; error: string };

export type MemoryAuditResult =
  | { success: true; audit: FillAuditResult }
  | { success: false; error: string };

export type AiSummaryCostResult =
  | { success: true; estimate: AiSummaryCostEstimate }
  | { success: false; error: string };

export type AiSummaryRunResult =
  | { success: true; result: AiSummaryBackfillResult }
  | { success: false; error: string };

async function resolveAdminWorkspaceOrFail(): Promise<
  | { ok: true; workspaceId: string }
  | { ok: false; error: string }
> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: roleData } = await supabase.rpc('get_member_role_slug', {
    p_workspace_id: workspaceId,
  });
  const roleSlug = roleData as string | null;
  if (roleSlug !== 'owner' && roleSlug !== 'admin') {
    return { ok: false, error: 'Admin or owner role required.' };
  }

  return { ok: true, workspaceId };
}

export async function runMemoryBackfill(): Promise<MemoryBackfillResult> {
  const gate = await resolveAdminWorkspaceOrFail();
  if (!gate.ok) return { success: false, error: gate.error };

  const result = await backfillWorkspaceContentEmbeddings(gate.workspaceId);
  return { success: true, workspaceId: gate.workspaceId, result };
}

/**
 * Sprint 1 exit-gate audit. Returns per-source-type fill rates without
 * running the backfill — safe to call often.
 */
export async function runMemoryAudit(): Promise<MemoryAuditResult> {
  const gate = await resolveAdminWorkspaceOrFail();
  if (!gate.ok) return { success: false, error: gate.error };

  const audit = await auditWorkspaceContentFill(gate.workspaceId);
  return { success: true, audit };
}

/**
 * Pre-flight cost estimate for ai_summary backfill. Read-only — counts
 * eligible messages, samples body length, returns projected USD.
 */
export async function estimateAiSummaryCost(): Promise<AiSummaryCostResult> {
  const gate = await resolveAdminWorkspaceOrFail();
  if (!gate.ok) return { success: false, error: gate.error };

  const estimate = await estimateAiSummaryBackfillCost(gate.workspaceId);
  return { success: true, estimate };
}

/**
 * Run ai_summary backfill (Haiku one-shot per message, writes ops.messages.ai_summary).
 * Bounded by `cap` to stay under Vercel's 300s function limit for large workspaces.
 */
export async function runAiSummary(cap?: number): Promise<AiSummaryRunResult> {
  const gate = await resolveAdminWorkspaceOrFail();
  if (!gate.ok) return { success: false, error: gate.error };

  const result = await runAiSummaryBackfill(gate.workspaceId, { cap });
  return { success: true, result };
}
