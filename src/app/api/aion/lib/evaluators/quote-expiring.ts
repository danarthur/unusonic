/**
 * quote_expiring — proposals nearing their `expires_at` deadline.
 *
 * Fires when a sent proposal's expires_at falls within the next 5 days
 * (configurable threshold). Signals: the client has a deadline pressure
 * the seller may not be tracking. Higher urgency as the expiry closes.
 *
 * Skips already-signed, already-expired-past, and explicitly-declined
 * proposals. Uses the public.proposals.expires_at column (verified
 * present in migration history — see sales-brief-v2-design.md §18).
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import { daysUntil, shortDate, type InsightCandidate } from '../insight-evaluators';

const LOOKAHEAD_DAYS = 5;

type ProposalRow = {
  id: string;
  deal_id: string;
  expires_at: string;
  deals: { title: string | null; organization_id: string | null } | null;
};

type OrgRow = { id: string; display_name: string | null };

export async function evaluateQuoteExpiring(
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const system = getSystemClient();
  const cutoff = new Date(Date.now() + LOOKAHEAD_DAYS * 86_400_000).toISOString();

  const { data } = await system
    .from('proposals')
    .select('id, deal_id, expires_at, deals!inner(title, organization_id)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'sent')
    .is('signed_at', null)
    .not('expires_at', 'is', null)
    .lte('expires_at', cutoff)
    .gte('expires_at', new Date().toISOString());

  if (!data?.length) return [];

  const rows = data as unknown as ProposalRow[];

  // Batch-fetch client org names for title strings.
  const orgIds = [
    ...new Set(rows.map((r) => r.deals?.organization_id).filter((x): x is string => Boolean(x))),
  ];
  let orgNames: Record<string, string> = {};
  if (orgIds.length > 0) {
    const { data: orgs } = await system
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', orgIds);
    orgNames = Object.fromEntries(
      ((orgs ?? []) as OrgRow[]).map((o) => [o.id, o.display_name ?? 'Unnamed client']),
    );
  }

  return rows.map((p) => {
    const dealTitle = p.deals?.title ?? 'Untitled deal';
    const clientName = p.deals?.organization_id
      ? orgNames[p.deals.organization_id]
      : null;
    const daysLeft = Math.max(0, daysUntil(p.expires_at));

    // Priority climbs steeply in the final 48h.
    const priority =
      daysLeft <= 1 ? 45 : daysLeft <= 2 ? 40 : daysLeft <= 3 ? 35 : 30;

    const urgency: InsightCandidate['urgency'] =
      daysLeft <= 1 ? 'critical' : daysLeft <= 3 ? 'high' : 'medium';

    const title = daysLeft <= 1
      ? `${dealTitle} quote expires tomorrow`
      : `${dealTitle} quote expires in ${daysLeft}d (${shortDate(p.expires_at)})`;

    return {
      triggerType: 'quote_expiring',
      entityType: 'proposal',
      entityId: p.id,
      title,
      context: {
        dealId: p.deal_id,
        dealTitle,
        clientName,
        expiresAt: p.expires_at,
        daysUntilExpiry: daysLeft,
      },
      priority,
      suggestedAction: 'Reach out before the quote expires',
      href: `/productions/deal/${p.deal_id}/proposal-builder`,
      urgency,
    };
  });
}
