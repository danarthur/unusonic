import Link from 'next/link';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { StagePanel } from '@/shared/ui/stage-panel';
import { resolveReasonLabel } from '@/shared/lib/follow-up-copy';

export const dynamic = 'force-dynamic';

/**
 * /crm/archive — residual past deals with pending follow-ups.
 *
 * P0 scope (intentionally narrow, per the plan):
 *   • Past = deal status is `won` AND every event has already started, OR
 *     deal status is `lost` / `archived_at IS NOT NULL`.
 *   • The list is filtered to deals that still have at least one pending,
 *     non-superseded follow-up. The Today widget excludes these same deals
 *     (via `ops.active_deals`), so this page is where they go to live.
 *
 * P1 adds: "Show all past deals" toggle, fuller drilldown, resolution
 * actions on a per-deal row. See claude-opus-4-7 build chat 2026-04-18.
 */

type ArchiveRow = {
  dealId: string;
  title: string;
  status: string;
  latestEventDate: string | null;
  pendingFollowUps: Array<{
    id: string;
    reason: string;
    reason_type: string;
    priority_score: number;
    created_at: string;
  }>;
};

async function loadArchive(): Promise<{ rows: ArchiveRow[]; error: string | null }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { rows: [], error: 'No active workspace.' };

  const supabase = await createClient();

  // Start with deals that have at least one pending, non-superseded follow-up
  // in this workspace. Scope in: deals we later classify as past.
  const { data: pendingRows, error: queueErr } = await supabase
    .schema('ops')
    .from('follow_up_queue')
    .select('id, deal_id, reason, reason_type, priority_score, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .is('superseded_at', null)
    .order('priority_score', { ascending: false });

  if (queueErr) return { rows: [], error: queueErr.message };

  const pending = (pendingRows ?? []) as Array<{
    id: string;
    deal_id: string;
    reason: string;
    reason_type: string;
    priority_score: number;
    created_at: string;
  }>;

  if (pending.length === 0) return { rows: [], error: null };

  const dealIds = [...new Set(pending.map((p) => p.deal_id))];

  // Load deal metadata. Include archived + won + lost — anything that's NOT
  // in ops.active_deals is fair game for the archive.
  const { data: deals } = await supabase
    .from('deals')
    .select('id, title, status, archived_at')
    .in('id', dealIds)
    .eq('workspace_id', workspaceId);

  const dealMap = new Map<
    string,
    { title: string | null; status: string; archived_at: string | null }
  >();
  for (const d of (deals ?? []) as Array<{
    id: string;
    title: string | null;
    status: string;
    archived_at: string | null;
  }>) {
    dealMap.set(d.id, { title: d.title, status: d.status, archived_at: d.archived_at });
  }

  // Pull event max starts_at per deal via project linkage. This mirrors the
  // ops.active_deals logic — anything whose max event start is in the past
  // (or has no events at all and is won/lost/archived) is a past deal.
  const { data: projects } = await supabase
    .schema('ops')
    .from('projects')
    .select('id, deal_id')
    .in('deal_id', dealIds);

  const projectIdsByDeal = new Map<string, string[]>();
  for (const p of (projects ?? []) as Array<{ id: string; deal_id: string | null }>) {
    if (!p.deal_id) continue;
    const arr = projectIdsByDeal.get(p.deal_id) ?? [];
    arr.push(p.id);
    projectIdsByDeal.set(p.deal_id, arr);
  }

  const allProjectIds = Array.from(projectIdsByDeal.values()).flat();
  const { data: events } = allProjectIds.length
    ? await supabase
        .schema('ops')
        .from('events')
        .select('project_id, starts_at')
        .in('project_id', allProjectIds)
    : { data: [] };

  const maxEventByDeal = new Map<string, string>();
  for (const e of (events ?? []) as Array<{ project_id: string; starts_at: string }>) {
    // Map project_id → deal_id
    for (const [dealId, projIds] of projectIdsByDeal.entries()) {
      if (projIds.includes(e.project_id)) {
        const cur = maxEventByDeal.get(dealId);
        if (!cur || new Date(e.starts_at).getTime() > new Date(cur).getTime()) {
          maxEventByDeal.set(dealId, e.starts_at);
        }
      }
    }
  }

  const now = Date.now();
  const rows: ArchiveRow[] = [];

  for (const dealId of dealIds) {
    const deal = dealMap.get(dealId);
    if (!deal) continue;

    const maxEventDate = maxEventByDeal.get(dealId);
    const maxEventMs = maxEventDate ? new Date(maxEventDate).getTime() : null;

    // Past = archived, or lost, or won-with-no-future-events.
    const isPast =
      deal.archived_at !== null ||
      deal.status === 'lost' ||
      (deal.status === 'won' && (maxEventMs === null || maxEventMs < now));

    if (!isPast) continue;

    rows.push({
      dealId,
      title: deal.title ?? 'Untitled deal',
      status: deal.status,
      latestEventDate: maxEventDate ?? null,
      pendingFollowUps: pending
        .filter((p) => p.deal_id === dealId)
        .map((p) => ({
          id: p.id,
          reason: p.reason,
          reason_type: p.reason_type,
          priority_score: p.priority_score,
          created_at: p.created_at,
        })),
    });
  }

  rows.sort((a, b) => {
    const aTop = a.pendingFollowUps[0]?.priority_score ?? 0;
    const bTop = b.pendingFollowUps[0]?.priority_score ?? 0;
    return bTop - aTop;
  });

  return { rows, error: null };
}

export default async function CrmArchivePage() {
  const { rows, error } = await loadArchive();

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl tracking-tight">Archive</h1>
        <p className="text-[var(--stage-text-secondary)] text-sm">
          Past deals with unresolved follow-ups. These do not appear in Today or on the pipeline card.
        </p>
      </header>

      {error && (
        <StagePanel padding="md" stripe="error">
          <p className="text-sm">{error}</p>
        </StagePanel>
      )}

      {!error && rows.length === 0 && (
        <StagePanel padding="md">
          <p className="text-[var(--stage-text-secondary)] text-sm">
            No residual follow-ups on past deals. Clean slate.
          </p>
        </StagePanel>
      )}

      {!error && rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <Link key={row.dealId} href={`/crm/deal/${row.dealId}`} className="block no-underline">
              <StagePanel padding="md" interactive>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-base">{row.title}</span>
                    <span className="text-[var(--stage-text-secondary)] text-xs capitalize">
                      {row.status}
                      {row.latestEventDate
                        ? ` \u00b7 last show ${new Date(row.latestEventDate).toLocaleDateString()}`
                        : ''}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {row.pendingFollowUps.map((fu) => (
                      <span key={fu.id} className="text-xs">
                        {resolveReasonLabel(fu.reason_type)}
                      </span>
                    ))}
                  </div>
                </div>
              </StagePanel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
