'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type ContractForDeal = {
  status: string;
  signed_at: string | null;
  pdf_url: string | null;
};

/**
 * Fetches the latest contract for an event (created at handover when proposal was accepted).
 * Workspace-scoped via contracts.workspace_id.
 * Returns null on any error (e.g. contracts table has gig_id but no event_id).
 */
export async function getContractForEvent(
  eventId: string
): Promise<ContractForDeal | null> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .select('status, signed_at, pdf_url')
      .eq('event_id', eventId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[CRM] getContractForEvent:', error.message);
      return null;
    }
    if (!data) return null;
    const r = data as Record<string, unknown>;
    return {
      status: (r.status as string) ?? 'draft',
      signed_at: (r.signed_at as string) ?? null,
      pdf_url: (r.pdf_url as string) ?? null,
    };
  } catch (err) {
    console.error('[CRM] getContractForEvent:', err);
    return null;
  }
}
