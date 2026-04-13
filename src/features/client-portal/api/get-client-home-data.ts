/**
 * Aggregate data loader for the client portal home page.
 *
 * Walks the client entity graph once on the server and returns a stable
 * DTO the home page can render without further DB reads:
 *
 *   entity ─► ops.events (client_entity_id match, most relevant one)
 *          ├─► public.workspaces → portal theme summary
 *          ├─► public.deals (where event_id = event.id)
 *          │     ├─► public.proposals (latest viewable per deal)
 *          │     └─► resolveDealContact — PM card
 *          └─► finance.invoices (via bill_to_entity_id = entity.id)
 *
 * "Most relevant" event = soonest upcoming (ends_at >= now); falls back to
 * most recent past event if no upcoming event exists. The portal stays
 * useful after the show (see the "post-event stickiness" research gap).
 *
 * Invoices link to the client via `bill_to_entity_id`, not via the event —
 * finance.invoices has no event_id column. Verified against live DB on
 * 2026-04-10 after the getClientHomeData first-pass assumption was wrong.
 *
 * Returns null when the entity has no events linked — the home page
 * renders an empty-state in that case.
 *
 * Runs under the system client because the caller is a client-portal
 * session (not a workspace member), so RLS would exclude everything.
 * Every query is scoped by the entity's owner_workspace_id, which is the
 * workspace isolation boundary for clients.
 *
 * @module features/client-portal/api/get-client-home-data
 */
import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';
import {
  computeEventLock,
  resolveDealContact,
  resolveEventDj,
  type EventLockReason,
  type ResolvedDealContact,
} from '@/shared/lib/client-portal';
import { pickRelevantEvent } from '@/shared/lib/client-portal/pick-relevant-event';
import { isSongsEnabledForArchetype } from '@/features/client-portal/api/get-client-songs-page-data';
import type { PortalThemeConfig } from '@/shared/lib/portal-theme';

import type { ClientPortalWorkspaceSummary } from '../ui/client-portal-shell';

export type ClientHomeEvent = {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  venueName: string | null;
  venueAddress: string | null;
  status: string | null;
};

export type ClientHomeDeal = {
  id: string;
  title: string | null;
  status: string;
};

export type ClientHomeProposal = {
  id: string;
  publicToken: string;
  status: string;
  signedAt: string | null;
};

export type ClientHomeInvoice = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  totalAmount: number;
  dueDate: string | null;
};

/**
 * Songs summary for the home dock.
 *
 * Null when the archetype gate (§0 A9) is closed — the home card
 * renders nothing for corporate / conference / concert events. Non-null
 * for wedding / social / generic archetypes regardless of the current
 * `count`.
 *
 * `lastSongRequestAt` is the follow-up-engine signal (B5). A couple who
 * hasn't added any songs 30 days before their wedding is a follow-up
 * trigger — the engine reads this field and scores "30 days to show,
 * last_song_request_at is null" as a nudge-worthy state. Exposed here
 * so the engine doesn't have to re-read JSONB.
 */
export type ClientHomeSongs = {
  count: number;
  acknowledgedCount: number;
  isLocked: boolean;
  lockReason: EventLockReason;
  lastSongRequestAt: string | null;
};

export type ClientHomeData = {
  workspace: ClientPortalWorkspaceSummary;
  entity: {
    id: string;
    displayName: string;
  };
  event: ClientHomeEvent;
  deal: ClientHomeDeal | null;
  proposal: ClientHomeProposal | null;
  invoice: ClientHomeInvoice | null;
  /** PM / sales owner card contact — the "one visible human" for most
   *  of the home page (attributed warmth principle). Resolved via
   *  `resolveDealContact`, which prefers deal.owner_entity_id → profiles
   *  → crew DJ fallback. */
  contact: ResolvedDealContact | null;
  /** DJ-specific contact for song attribution. Separate from `contact`
   *  to prevent the A10 failure mode where "Priya has seen this" would
   *  attribute to the PM instead of the actual DJ. Resolved via
   *  `resolveEventDj` which walks event → deal → deal_crew (DJ role only)
   *  and NEVER falls back to the PM. Null if no DJ assigned yet. */
  dj: ResolvedDealContact | null;
  /** Null when archetype gate is closed — home omits the Songs card entirely. */
  songs: ClientHomeSongs | null;
};

type EntityRow = {
  id: string;
  display_name: string | null;
  owner_workspace_id: string;
};

type EventRow = {
  id: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  status: string | null;
  workspace_id: string | null;
  event_archetype: string | null;
  run_of_show_data: Record<string, unknown> | null;
};

type DealRow = {
  id: string;
  title: string | null;
  status: string;
  event_id: string | null;
  workspace_id: string;
};

type ProposalRow = {
  id: string;
  public_token: string;
  status: string;
  signed_at: string | null;
  created_at: string;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string | null;
  total_amount: number | string;
  due_date: string | null;
  created_at: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string | null;
  logo_url: string | null;
  portal_theme_preset: string | null;
  portal_theme_config: Record<string, unknown> | null;
};

export async function getClientHomeData(
  entityId: string,
): Promise<ClientHomeData | null> {
  if (!entityId) return null;

  const supabase = getSystemClient();
  // directory + ops schemas aren't in the public Database type surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crossSchema = supabase;

  // --- 1. Entity ---
  const { data: entityData } = await crossSchema
    .schema('directory')
    .from('entities')
    .select('id, display_name, owner_workspace_id')
    .eq('id', entityId)
    .maybeSingle();
  const entity = entityData as EntityRow | null;
  if (!entity) return null;

  const workspaceId = entity.owner_workspace_id;

  // --- 2. Workspace (name + logo + theme) ---
  const { data: workspaceData } = await supabase
    .from('workspaces')
    .select('id, name, logo_url, portal_theme_preset, portal_theme_config')
    .eq('id', workspaceId)
    .maybeSingle<WorkspaceRow>();

  const workspace: ClientPortalWorkspaceSummary = workspaceData
    ? {
        id: workspaceData.id,
        name: workspaceData.name ?? '',
        logoUrl: workspaceData.logo_url,
        portalThemePreset: workspaceData.portal_theme_preset,
        portalThemeConfig: (workspaceData.portal_theme_config as PortalThemeConfig | null) ?? null,
      }
    : {
        id: workspaceId,
        name: '',
        logoUrl: null,
        portalThemePreset: null,
        portalThemeConfig: null,
      };

  // --- 3. Events linked to this entity ---
  const { data: eventRows } = await crossSchema
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, venue_name, venue_address, status, workspace_id, event_archetype, run_of_show_data')
    .eq('client_entity_id', entityId)
    .eq('workspace_id', workspaceId);

  const events = (eventRows ?? []) as EventRow[];
  const eventRow = pickRelevantEvent(events);
  if (!eventRow) {
    // No events linked yet — home has nothing to render.
    return null;
  }

  const event: ClientHomeEvent = {
    id: eventRow.id,
    title: eventRow.title ?? 'Your show',
    startsAt: eventRow.starts_at,
    endsAt: eventRow.ends_at,
    venueName: eventRow.venue_name,
    venueAddress: eventRow.venue_address,
    status: eventRow.status,
  };

  // --- 4. Deal linked to this event ---
  const { data: dealData } = await supabase
    .from('deals')
    .select('id, title, status, event_id, workspace_id')
    .eq('event_id', eventRow.id)
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle<DealRow>();

  let deal: ClientHomeDeal | null = null;
  let proposal: ClientHomeProposal | null = null;
  let contact: ResolvedDealContact | null = null;

  if (dealData) {
    deal = {
      id: dealData.id,
      title: dealData.title,
      status: dealData.status,
    };

    // --- 5. Latest client-viewable proposal for this deal ---
    // Matches VIEWABLE_PROPOSAL_STATUSES in resolveClientEntityForProposal:
    // drafts and rejected proposals must never surface to the client, even
    // as the "latest" one when a newer draft exists alongside a viewed one.
    const { data: proposalData } = await supabase
      .from('proposals')
      .select('id, public_token, status, signed_at, created_at')
      .eq('deal_id', dealData.id)
      .eq('workspace_id', workspaceId)
      .in('status', ['sent', 'viewed', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<ProposalRow>();

    if (proposalData) {
      proposal = {
        id: proposalData.id,
        publicToken: proposalData.public_token,
        status: proposalData.status,
        signedAt: proposalData.signed_at,
      };
    }

    // --- 6. PM card contact (hybrid resolution) ---
    contact = await resolveDealContact(dealData.id, workspaceId);
  }

  // --- 7. Latest invoice for this client entity ---
  // finance.invoices links to the client via bill_to_entity_id, NOT event_id.
  // Schema has: workspace_id, bill_to_entity_id, project_id, invoice_number,
  // total_amount, status, due_date, created_at — no event_id, no issue_date.
  // (finance schema isn't on the generated public type surface.)
  const { data: invoiceData } = await crossSchema
    .schema('finance')
    .from('invoices')
    .select('id, invoice_number, status, total_amount, due_date, created_at')
    .eq('bill_to_entity_id', entityId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const invoiceRow = invoiceData as InvoiceRow | null;
  const invoice: ClientHomeInvoice | null = invoiceRow
    ? {
        id: invoiceRow.id,
        invoiceNumber: invoiceRow.invoice_number,
        status: invoiceRow.status ?? 'draft',
        totalAmount: Number(invoiceRow.total_amount) || 0,
        dueDate: invoiceRow.due_date,
      }
    : null;

  // --- 8. DJ-specific contact for song attribution (§0 A10) ---
  // Only resolve when the archetype supports songs — saves a DB round
  // trip on corporate events where we wouldn't render the Songs card
  // anyway. Null return propagates to the Songs card sublabel as
  // "your DJ" instead of a mis-attributed PM name.
  let dj: ResolvedDealContact | null = null;
  if (isSongsEnabledForArchetype(eventRow.event_archetype)) {
    dj = await resolveEventDj(eventRow.id);
  }

  // --- 9. Songs summary (§0 A9 archetype gate + B5 follow-up signal) ---
  // Null return means "omit the Songs card from the dock" — the page
  // reads `data.songs === null` as the "don't render" signal.
  let songs: ClientHomeSongs | null = null;
  if (isSongsEnabledForArchetype(eventRow.event_archetype)) {
    const ros = (eventRow.run_of_show_data ?? {}) as Record<string, unknown>;
    const rawRequests = ros.client_song_requests;
    const requests = Array.isArray(rawRequests) ? rawRequests : [];
    const lock = computeEventLock(eventRow.starts_at, eventRow.status);

    let acknowledgedCount = 0;
    let lastRequestedAt: string | null = null;
    for (const raw of requests) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      if (r.acknowledged_at) acknowledgedCount += 1;
      const requestedAt = typeof r.requested_at === 'string' ? r.requested_at : null;
      if (requestedAt && (!lastRequestedAt || requestedAt > lastRequestedAt)) {
        lastRequestedAt = requestedAt;
      }
    }

    songs = {
      count: requests.length,
      acknowledgedCount,
      isLocked: lock.locked,
      lockReason: lock.reason,
      lastSongRequestAt: lastRequestedAt,
    };
  }

  return {
    workspace,
    entity: {
      id: entity.id,
      displayName: entity.display_name ?? 'Welcome',
    },
    event,
    deal,
    proposal,
    invoice,
    contact,
    dj,
    songs,
  };
}
