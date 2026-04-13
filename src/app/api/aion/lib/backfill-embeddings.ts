/**
 * Backfill embeddings for existing workspace content.
 *
 * Run via server action or API route. Embeds all un-embedded deal notes,
 * follow-up logs, and proposals for a workspace.
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';
import { upsertEmbedding, buildContextHeader } from './embeddings';

export type BackfillResult = {
  dealNotes: number;
  followUpLogs: number;
  proposals: number;
  catalogPackages: number;
  errors: number;
};

/**
 * Backfill all content embeddings for a workspace.
 * Rate-limited with 100ms delays to avoid hitting Voyage rate limits.
 */
export async function backfillWorkspaceContentEmbeddings(
  workspaceId: string,
): Promise<BackfillResult> {
  const supabase = await createClient();
  const result: BackfillResult = { dealNotes: 0, followUpLogs: 0, proposals: 0, catalogPackages: 0, errors: 0 };

  // ── Deal notes ──────────────────────────────────────────────────────────

  const { data: notes } = await supabase
    .schema('ops')
    .from('deal_notes')
    .select('id, deal_id, content')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (notes?.length) {
    // Batch-fetch deal titles for context headers
    const dealIds = [...new Set((notes as any[]).map((n: any) => n.deal_id))];
    const { data: deals } = await supabase.from('deals').select('id, title').in('id', dealIds);
    const dealMap = new Map((deals ?? []).map((d: any) => [d.id, d.title]));

    for (const note of notes as any[]) {
      if (!note.content?.trim()) continue;
      try {
        const header = buildContextHeader('deal_note', { dealTitle: dealMap.get(note.deal_id) ?? null });
        await upsertEmbedding(workspaceId, 'deal_note', note.id, note.content, header);
        result.dealNotes++;
      } catch { result.errors++; }
      await delay(100);
    }
  }

  // ── Follow-up logs ──────────────────────────────────────────────────────

  const { data: logs } = await supabase
    .schema('ops')
    .from('follow_up_log')
    .select('id, deal_id, content, summary, channel')
    .eq('workspace_id', workspaceId)
    .not('content', 'is', null)
    .order('created_at', { ascending: false });

  if (logs?.length) {
    const dealIds = [...new Set((logs as any[]).map((l: any) => l.deal_id))];
    const { data: deals } = await supabase.from('deals').select('id, title').in('id', dealIds);
    const dealMap = new Map((deals ?? []).map((d: any) => [d.id, d.title]));

    for (const log of logs as any[]) {
      const text = log.content || log.summary;
      if (!text?.trim()) continue;
      try {
        const header = buildContextHeader('follow_up', { dealTitle: dealMap.get(log.deal_id) ?? null, channel: log.channel });
        await upsertEmbedding(workspaceId, 'follow_up', log.id, text, header);
        result.followUpLogs++;
      } catch { result.errors++; }
      await delay(100);
    }
  }

  // ── Proposals (scope_notes + payment_notes) ─────────────────────────────

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id, scope_notes, payment_notes')
    .eq('workspace_id', workspaceId);

  if (proposals?.length) {
    const dealIds = [...new Set((proposals as any[]).map((p: any) => p.deal_id))];
    const { data: deals } = await supabase.from('deals').select('id, title').in('id', dealIds);
    const dealMap = new Map((deals ?? []).map((d: any) => [d.id, d.title]));

    for (const prop of proposals as any[]) {
      const parts = [prop.scope_notes, prop.payment_notes].filter(Boolean);
      if (parts.length === 0) continue;
      try {
        const header = buildContextHeader('proposal', { dealTitle: dealMap.get(prop.deal_id) ?? null });
        await upsertEmbedding(workspaceId, 'proposal', prop.id, parts.join('\n\n'), header);
        result.proposals++;
      } catch { result.errors++; }
      await delay(100);
    }
  }

  // ── Catalog packages (re-embed with Voyage) ─────────────────────────────

  try {
    const { backfillWorkspaceEmbeddings } = await import('@/features/sales/api/catalog-embeddings');
    const catalogResult = await backfillWorkspaceEmbeddings(workspaceId);
    result.catalogPackages = catalogResult.processed;
    result.errors += catalogResult.errors;
  } catch { /* catalog backfill is optional */ }

  return result;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
