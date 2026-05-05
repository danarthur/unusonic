'use server';

/**
 * Read the current Aion-authored narrative for a deal (Phase 3 §3.5 B5).
 *
 * The narrative lives in cortex.memory with source_type='narrative' and
 * source_id=<deal_id> — one row per deal, upserted by update_narrative via
 * cortex.upsert_memory_embedding. When versioning is needed later, drop the
 * ON CONFLICT and read with ORDER BY updated_at DESC LIMIT 1 instead.
 *
 * Returns null when no narrative exists yet — DealNarrativeStrip renders
 * nothing in that case (honest empty state; no "Add a narrative" CTA
 * prompting the user to do something Aion is supposed to be doing for them).
 */

import { createClient } from '@/shared/api/supabase/server';
import { dealInWorkspace } from '@/app/api/aion/lib/deal-in-workspace';

export type DealNarrative = {
  text: string;
  updatedAt: string;
  authoredBy: string | null;
};

export async function getDealNarrative(dealId: string): Promise<DealNarrative | null> {
  if (!dealId) return null;

  // Belt — public.deal_in_workspace re-verifies caller membership even
  // though cortex.memory has workspace-scoped RLS.
  if (!(await dealInWorkspace(dealId))) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('cortex')
    .from('memory')
    .select('content_text, updated_at, metadata')
    .eq('source_type', 'narrative')
    .eq('source_id', dealId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.content_text) return null;

  const metadata = (data.metadata as Record<string, unknown> | null) ?? null;
  const authoredBy = typeof metadata?.authored_by === 'string' ? metadata.authored_by : null;

  return {
    text: data.content_text,
    updatedAt: data.updated_at,
    authoredBy,
  };
}
