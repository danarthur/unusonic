/**
 * gone_quiet_with_value — no activity in 14+ days AND the deal is valuable
 * relative to this workspace's median.
 *
 * Purpose: the raw `deal_stale` evaluator fires on every inactive deal,
 * which can flood the brief with low-value rows. This evaluator narrows
 * to the deals that matter. It does NOT replace `deal_stale` — that still
 * runs; this one surfaces a distinct trigger with a different priority band
 * so the compound-story collapse (Phase 3) can dedupe them.
 *
 * Value threshold: workspace median `budget_estimated`. Per the design
 * doc's pass-1 resolution: if fewer than 5 non-null budgets exist, fall
 * back to a hard-coded constant ($10k) rather than computing a misleading
 * median on thin data.
 *
 * See sales-brief-v2-design.md §4 + §18 pass 1 resolution 3.
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import { daysSince, type InsightCandidate } from '../insight-evaluators';
import { OPEN_DEAL_STATUSES } from '@/shared/lib/pipeline-stages/constants';

const STALE_DAYS = 14;
const MIN_BUDGETS_FOR_MEDIAN = 5;
const FALLBACK_VALUE_THRESHOLD = 10_000;

type DealRow = {
  id: string;
  title: string | null;
  status: string;
  updated_at: string;
  proposed_date: string | null;
  organization_id: string | null;
  budget_estimated: number | string | null;
};

type OrgRow = { id: string; display_name: string | null };

function computeValueThreshold(budgets: number[]): number {
  if (budgets.length < MIN_BUDGETS_FOR_MEDIAN) return FALLBACK_VALUE_THRESHOLD;
  const sorted = [...budgets].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function evaluateGoneQuietWithValue(
  workspaceId: string,
): Promise<InsightCandidate[]> {
  const system = getSystemClient();
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();

  const { data: deals } = await system
    .from('deals')
    .select('id, title, status, updated_at, proposed_date, organization_id, budget_estimated')
    .eq('workspace_id', workspaceId)
    .in('status', [...OPEN_DEAL_STATUSES])
    .is('archived_at', null);

  if (!deals?.length) return [];
  const dealRows = deals as DealRow[];

  // Compute workspace value threshold from non-null budgets. Fall back to
  // FALLBACK_VALUE_THRESHOLD when we don't have enough data for a meaningful
  // median.
  const budgets = dealRows
    .map((d) => Number(d.budget_estimated))
    .filter((n) => Number.isFinite(n) && n > 0);
  const threshold = computeValueThreshold(budgets);

  const valuableStale = dealRows.filter((d) => {
    const budget = Number(d.budget_estimated);
    if (!Number.isFinite(budget) || budget < threshold) return false;
    return d.updated_at < staleCutoff;
  });

  if (valuableStale.length === 0) return [];

  const dealIds = valuableStale.map((d) => d.id);

  // Check for recent activity (notes / follow-up log) to exclude false
  // positives where updated_at stalled but the deal is actually being
  // worked. Mirrors the existing deal_stale evaluator's approach.
  const sysAny = system as unknown as {
    schema(s: string): {
      from(t: string): {
        select(cols: string): {
          in(c: string, vals: string[]): {
            gte(c: string, v: string): Promise<{ data: Array<{ deal_id: string }> | null }>;
          };
        };
      };
    };
  };
  const [notesRes, logsRes] = await Promise.all([
    sysAny
      .schema('ops')
      .from('deal_notes')
      .select('deal_id')
      .in('deal_id', dealIds)
      .gte('created_at', staleCutoff),
    sysAny
      .schema('ops')
      .from('follow_up_log')
      .select('deal_id')
      .in('deal_id', dealIds)
      .gte('created_at', staleCutoff),
  ]);
  const active = new Set([
    ...(notesRes.data ?? []).map((r) => r.deal_id),
    ...(logsRes.data ?? []).map((r) => r.deal_id),
  ]);

  const survivors = valuableStale.filter((d) => !active.has(d.id));
  if (survivors.length === 0) return [];

  // Batch-fetch client names.
  const orgIds = [
    ...new Set(
      survivors.map((d) => d.organization_id).filter((x): x is string => Boolean(x)),
    ),
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

  return survivors.map((deal) => {
    const quietDays = daysSince(deal.updated_at);
    const budget = Number(deal.budget_estimated);
    const clientName = deal.organization_id
      ? orgNames[deal.organization_id] ?? null
      : null;

    // Priority: base 28, +3 per week quiet (cap at 44), +5 if budget >= 2x threshold.
    const priority = Math.min(
      44,
      28 + Math.floor((quietDays - STALE_DAYS) / 7) * 3 + (budget >= threshold * 2 ? 5 : 0),
    );
    const urgency: InsightCandidate['urgency'] =
      quietDays >= 28 ? 'high' : 'medium';

    const amountStr = `$${Math.round(budget).toLocaleString('en-US')}`;
    const who = clientName ?? deal.title ?? 'Untitled deal';
    const title = `Gone quiet ${quietDays}d · ${amountStr} — ${who}`;

    return {
      triggerType: 'gone_quiet_with_value',
      entityType: 'deal',
      entityId: deal.id,
      title,
      context: {
        dealTitle: deal.title,
        clientName,
        quietDays,
        budget,
        valueThreshold: threshold,
        usedFallback: budgets.length < MIN_BUDGETS_FOR_MEDIAN,
      },
      priority,
      suggestedAction: 'Reach out — this one\u2019s worth the call',
      href: `/crm/deal/${deal.id}`,
      urgency,
    };
  });
}
