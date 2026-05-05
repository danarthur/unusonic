'use server';

/**
 * Lightweight deal header fetch for the Aion chat scope bar.
 *
 * Returns just the fields the sticky scope header renders: display title,
 * stage label (resolved against ops.pipeline_stages), stage kind, and the
 * canonical URL to jump to the deal.
 *
 * Separate from getDeal / getDealForPrism because those pull full detail and
 * this is called on every ChatInterface mount — the chat surface shouldn't
 * block on the full deal payload when it only needs four fields.
 *
 * Design: docs/reference/aion-deal-chat-design.md §7.5 (sticky scope header).
 */

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type DealHeaderForScope = {
  id: string;
  title: string | null;
  stageLabel: string | null;
  stageKind: 'working' | 'won' | 'lost' | null;
  /** Canonical CRM URL — the sticky header's "Open →" affordance navigates here. */
  url: string;
};

// Same legacy-slug fallback set used by stream-card.tsx — used when a deal
// has a literal status slug (post-3i collapse) and no stage_id resolves.
const LEGACY_KIND_LABELS: Record<string, string> = {
  working: 'In progress',
  won: 'Won',
  lost: 'Lost',
  inquiry: 'Inquiry',
  proposal: 'Proposal',
  contract_sent: 'Contract sent',
  contract_signed: 'Signed',
  deposit_received: 'Deposit received',
};

export async function getDealHeaderForScope(
  dealId: string,
): Promise<DealHeaderForScope | null> {
  if (!dealId) return null;

  const supabase = await createClient();
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const { data: dealRow, error: dealErr } = await supabase
    .from('deals')
    .select('id, title, status, stage_id, workspace_id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (dealErr || !dealRow) return null;

  const deal = dealRow as {
    id: string;
    title: string | null;
    status: string | null;
    stage_id: string | null;
    workspace_id: string;
  };

  // Resolve the live stage label via ops.pipeline_stages. Cast via `as any`
  // because ops isn't PostgREST-exposed (CLAUDE.md §Schema source of truth).
  let stageLabel: string | null = null;
  let stageKind: DealHeaderForScope['stageKind'] = null;

  if (deal.stage_id) {
    const { data: stageRow } = await supabase
      .schema('ops')
      .from('pipeline_stages')
      .select('label, kind')
      .eq('id', deal.stage_id)
      .maybeSingle();
    if (stageRow) {
      stageLabel = (stageRow.label as string | null) ?? null;
      stageKind = (stageRow.kind as DealHeaderForScope['stageKind']) ?? null;
    }
  }

  // Fallback to the legacy slug map when no stage_id resolved (e.g. seed
  // data, deals pre-dating Phase 3h).
  if (!stageLabel && deal.status) {
    stageLabel = LEGACY_KIND_LABELS[deal.status] ?? deal.status.replace(/_/g, ' ');
  }
  if (!stageKind && deal.status) {
    if (deal.status === 'won') stageKind = 'won';
    else if (deal.status === 'lost') stageKind = 'lost';
    else stageKind = 'working';
  }

  return {
    id: deal.id,
    title: deal.title,
    stageLabel,
    stageKind,
    url: `/events?selected=${encodeURIComponent(deal.id)}`,
  };
}
