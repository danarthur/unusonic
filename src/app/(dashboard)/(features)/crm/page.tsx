import { Suspense } from 'react';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { computePaymentStatus, paymentStatusLabel, paymentStatusColor } from '@/features/sales/lib/compute-payment-status';
import { NetworkDetailSheetWithSuspense } from '@/widgets/network-detail';
import { ProductionGridShell } from './components/production-grid-shell';
import type { StreamCardItem } from './components/stream-card';
import { AionPageContextSetter } from '@/shared/ui/providers/AionPageContextSetter';

/** CRM queue item: deal or event row mapped for Production Grid UI. */
export type CRMQueueItem = {
  id: string;
  title: string | null;
  status: string | null;
  event_date: string | null;
  location: string | null;
  client_name: string | null;
  source: 'deal' | 'event';
  lifecycle_status?: string | null;
};

const STREAM_MODES = ['inquiry', 'active', 'past'] as const;
export type StreamMode = (typeof STREAM_MODES)[number];

function parseStreamMode(value: string | undefined): StreamMode {
  if (value === 'inquiry' || value === 'active' || value === 'past') return value;
  return 'inquiry';
}

function CRMSkeleton() {
  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      <div className="w-full lg:w-[380px] shrink-0 p-4 space-y-3">
        <div className="h-8 w-48 rounded-lg stage-skeleton" />
        <div className="h-10 w-full rounded-xl stage-skeleton" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 w-full rounded-xl stage-skeleton" />
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0" />
    </div>
  );
}

export default async function CRMPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string; stream?: string; nodeId?: string; kind?: string }>;
}) {
  const params = await searchParams;
  const selectedId = params.selected ?? null;
  const streamMode = parseStreamMode(params.stream);
  const nodeId = params.nodeId ?? null;
  const kind =
    params.kind === 'external_partner' || params.kind === 'internal_employee' || params.kind === 'extended_team'
      ? params.kind
      : null;

  return (
    <>
      <AionPageContextSetter type="crm" entityId={selectedId} label={null} />
      <Suspense fallback={<CRMSkeleton />}>
        <CRMDataShell selectedId={selectedId} streamMode={streamMode} />
      </Suspense>
      {nodeId && kind && (
        <CRMNetworkSheet nodeId={nodeId} kind={kind} selectedId={selectedId} streamMode={streamMode} />
      )}
    </>
  );
}

async function CRMNetworkSheet({ nodeId, kind, selectedId, streamMode }: { nodeId: string; kind: 'internal_employee' | 'extended_team' | 'external_partner'; selectedId: string | null; streamMode: StreamMode }) {
  const currentOrgId = await getCurrentOrgId();
  if (!currentOrgId) return null;
  return (
    <NetworkDetailSheetWithSuspense
      nodeId={nodeId}
      kind={kind}
      sourceOrgId={currentOrgId}
      returnPath={`/crm${selectedId ? `?selected=${selectedId}&stream=${streamMode}` : ''}`}
    />
  );
}

async function CRMDataShell({ selectedId, streamMode }: { selectedId: string | null; streamMode: StreamMode }) {
  let currentOrgId: string | null = null;
  let gigs: StreamCardItem[] = [];

  try {
    currentOrgId = await getCurrentOrgId();
    const supabase = await createClient();
    const workspaceId = await getActiveWorkspaceId();

    const [dealsRes, eventsRes] = await Promise.all([
    workspaceId
      ? supabase
          .from('deals')
          .select('id, title, status, proposed_date, organization_id, venue_id, event_archetype, lead_source, owner_entity_id, created_at')
          .eq('workspace_id', workspaceId)
          .is('archived_at', null)
          .order('proposed_date', { ascending: true })
      : { data: [] as Record<string, unknown>[] },
    workspaceId
      ? supabase
          .schema('ops')
          .from('events')
          .select('id, title, starts_at, lifecycle_status, archived_at, created_at, client_entity_id, venue_entity_id, deal_id')
          .eq('workspace_id', workspaceId)
          .order('starts_at', { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

    const dealIds = (dealsRes.data ?? []).map((d: Record<string, unknown>) => d.id as string);
    const venueByDealId = new Map<string, string>();
    const clientByDealId = new Map<string, string>();

    // Stakeholders + proposals in parallel (proposals only needs dealIds, not stakeholder results)
    type ProposalPaymentRow = {
      deal_id: string; status: string | null; signed_at: string | null; accepted_at: string | null;
      deposit_percent: number | null; deposit_paid_at: string | null; deposit_deadline_days: number | null; payment_due_days: number | null;
    };
    const proposalByDealId = new Map<string, ProposalPaymentRow>();

    if (dealIds.length > 0) {
      const [stakeholdersRes, proposalsRes] = await Promise.all([
        (supabase as any)
          .schema('ops')
          .from('deal_stakeholders')
          .select('deal_id, role, organization_id')
          .in('deal_id', dealIds)
          .in('role', ['venue_contact', 'bill_to']),
        supabase
          .from('proposals')
          .select('deal_id, status, signed_at, accepted_at, deposit_percent, deposit_paid_at, deposit_deadline_days, payment_due_days')
          .in('deal_id', dealIds)
          .neq('status', 'draft')
          .order('created_at', { ascending: false }),
      ]);

      for (const s of (stakeholdersRes.data ?? []) as { deal_id: string; role: string; organization_id: string | null }[]) {
        if (s.role === 'venue_contact' && s.organization_id) venueByDealId.set(s.deal_id, s.organization_id);
        if (s.role === 'bill_to' && s.organization_id) clientByDealId.set(s.deal_id, s.organization_id);
      }

      for (const p of (proposalsRes.data ?? []) as ProposalPaymentRow[]) {
        if (!proposalByDealId.has(p.deal_id)) proposalByDealId.set(p.deal_id, p);
      }
    }

    // Resolve entity display names (depends on stakeholder results for org IDs)
    const entityIds = new Set<string>();
    for (const d of (dealsRes.data ?? [])) {
      const dealId = d.id as string;
      const clientId = clientByDealId.get(dealId) ?? (d.organization_id as string | null);
      const venueId = venueByDealId.get(dealId) ?? (d.venue_id as string | null);
      const ownerId = d.owner_entity_id as string | null;
      if (clientId) entityIds.add(clientId);
      if (venueId) entityIds.add(venueId);
      if (ownerId) entityIds.add(ownerId);
    }
    for (const e of (eventsRes.data ?? [])) {
      const clientId = e.client_entity_id as string | null;
      const venueId = e.venue_entity_id as string | null;
      if (clientId) entityIds.add(clientId);
      if (venueId) entityIds.add(venueId);
    }
    let entityNameMap = new Map<string, string>();
    if (entityIds.size > 0) {
      const { data: entities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name')
        .in('id', [...entityIds]);
      entityNameMap = new Map(
        (entities ?? []).map((e) => [e.id as string, (e.display_name as string) ?? ''])
      );
    }

    const dealGigs: StreamCardItem[] = (dealsRes.data ?? []).map((d: Record<string, unknown>) => {
      const dealId = d.id as string;
      const proposal = proposalByDealId.get(dealId);
      const pStatus = proposal
        ? computePaymentStatus({
            proposalStatus: proposal.status,
            signedAt: proposal.signed_at,
            acceptedAt: proposal.accepted_at,
            depositPercent: proposal.deposit_percent,
            depositPaidAt: proposal.deposit_paid_at,
            depositDeadlineDays: proposal.deposit_deadline_days,
            paymentDueDays: proposal.payment_due_days,
            proposedDate: d.proposed_date ? String(d.proposed_date) : null,
          })
        : null;
      const venueId = venueByDealId.get(dealId) ?? (d.venue_id as string | null);
      const clientId = clientByDealId.get(dealId) ?? (d.organization_id as string | null);
      const ownerId = d.owner_entity_id as string | null;
      return {
        id: dealId,
        title: (d.title as string) ?? null,
        status: (d.status as string) ?? null,
        event_date: d.proposed_date ? String(d.proposed_date) : null,
        location: venueId ? (entityNameMap.get(venueId) ?? null) : null,
        client_name: clientId ? (entityNameMap.get(clientId) ?? null) : null,
        source: 'deal' as const,
        paymentStatus: pStatus,
        paymentStatusLabel: paymentStatusLabel(pStatus),
        paymentStatusColor: paymentStatusColor(pStatus),
        event_archetype: (d.event_archetype as string) ?? null,
        lead_source: (d.lead_source as string) ?? null,
        owner_name: ownerId ? (entityNameMap.get(ownerId) ?? null) : null,
        created_at: (d.created_at as string) ?? null,
      };
    });

    // Filter out events that already have a deal card — avoids duplicate cards for won deals
    const dealIdSet = new Set(dealIds);
    const filteredEvents = (eventsRes.data ?? []).filter((e: Record<string, unknown>) => {
      const eDealId = e.deal_id as string | null;
      return !eDealId || !dealIdSet.has(eDealId);
    });

    const eventGigs: StreamCardItem[] = filteredEvents.map((e: Record<string, unknown>) => {
      const clientId = e.client_entity_id as string | null;
      const venueId = e.venue_entity_id as string | null;
      return {
        id: e.id as string,
        title: (e.title as string) ?? null,
        status: null,
        event_date: e.starts_at ? String((e.starts_at as string).slice(0, 10)) : null,
        location: venueId ? (entityNameMap.get(venueId) ?? null) : null,
        client_name: clientId ? (entityNameMap.get(clientId) ?? null) : null,
        source: 'event' as const,
        lifecycle_status: (e.lifecycle_status as string) ?? null,
        archived_at: (e.archived_at as string | null) ?? null,
        created_at: (e.created_at as string) ?? null,
      };
    });

    gigs = [...dealGigs, ...eventGigs].sort((a, b) => {
      const da = a.event_date ?? '';
      const db = b.event_date ?? '';
      return da.localeCompare(db);
    });

    // Merge follow-up queue signals into stream items
    if (workspaceId) {
      const { data: queueItems } = await (supabase as any)
        .schema('ops')
        .from('follow_up_queue')
        .select('deal_id, reason, priority_score, status')
        .eq('workspace_id', workspaceId)
        .in('status', ['pending', 'snoozed']);

      if (queueItems && queueItems.length > 0) {
        const followUpMap = new Map<string, { reason: string; priority_score: number; status: string }>();
        for (const q of queueItems as { deal_id: string; reason: string; priority_score: number; status: string }[]) {
          const existing = followUpMap.get(q.deal_id);
          if (!existing || q.priority_score > existing.priority_score) {
            followUpMap.set(q.deal_id, q);
          }
        }
        for (const gig of gigs) {
          const fu = followUpMap.get(gig.id);
          if (fu) {
            gig.followUpReason = fu.reason;
            gig.followUpPriority = fu.priority_score;
            gig.followUpStatus = fu.status as 'pending' | 'snoozed';
          }
        }
      }
    }
  } catch (err) {
    // The CRM page wraps its entire data load (currentOrg, deals, events,
    // stakeholders, directory lookups, follow-up queue) in one try/catch. On
    // failure the user sees an empty grid with no indication anything went
    // wrong — "no deals yet" is indistinguishable from "workspace_id null" or
    // "RLS rejected my query". Surface the failure to Sentry so the team can
    // diagnose. (Fully fixing the UX — showing an inline error in
    // ProductionGridShell — is still tracked separately.)
    const message = err instanceof Error ? err.message : String(err);
    Sentry.logger.error('crm.page.dataLoadFailed', {
      selectedId,
      streamMode,
      error: message,
    });
    Sentry.captureException(err);
  }

  const effectiveSelectedId =
    selectedId && (gigs.some((g) => g.id === selectedId) || gigs.length === 0)
      ? selectedId
      : null;

  return (
    <ProductionGridShell
      gigs={gigs}
      selectedId={effectiveSelectedId}
      streamMode={streamMode}
      currentOrgId={currentOrgId}
    />
  );
}
