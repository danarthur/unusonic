/**
 * getPersonProductions — every deal/event a person has been involved in,
 * grouped into three bands matching the production-company owner's mental
 * model (per docs/reference/network-page-ia-redesign.md §4.2):
 *
 *   • in_play  — pre-contract (status ∈ inquiry / proposal / contract_sent)
 *   • booked   — signed + future (status ∈ signed / deposit / won, event future)
 *   • past     — completed or lost (event past, or deal status = lost)
 *
 * Involvement = any of:
 *   1. deals.main_contact_id = person
 *   2. deals.organization_id = person        (person-as-client)
 *   3. ops.deal_stakeholders.entity_id = person  (planner, bill-to, venue, vendor)
 *   4. ops.deal_crew.entity_id = person       (crew role on deal/event)
 *   5. ops.events.client_entity_id = person    (event client directly)
 *
 * Plus inherited productions where the person is MEMBER/ROSTER_MEMBER/EMPLOYEE
 * of a company that has any of those same involvements — role shown as
 * "via {Company Name}". Direct involvement wins over inherited when a deal
 * appears in both.
 *
 * Deduplicated by deal_id. When a deal has an event, the event's dates and
 * status take precedence for band classification (post-handover reality).
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type ProductionBand = 'in_play' | 'booked' | 'past';

export type PersonProduction = {
  /** Stable id: the deal_id when a deal exists, else the event_id. */
  id: string;
  dealId: string | null;
  eventId: string | null;
  title: string | null;
  /** ISO date — event.starts_at when handed off, else deals.proposed_date. */
  date: string | null;
  /** The deal's status when present; event.lifecycle_status otherwise. */
  status: string | null;
  band: ProductionBand;
  /** Role(s) the person holds on this production, collapsed to a phrase. */
  role: string | null;
  /** Optional budget estimate (from deals.budget_estimated). */
  amountEstimated: number | null;
  /** Deep-link path back to the production. */
  href: string;
};

export type GetPersonProductionsResult =
  | { ok: true; productions: PersonProduction[]; bands: Record<ProductionBand, number> }
  | { ok: false; error: string };

type DealRow = {
  id: string;
  title: string | null;
  status: string | null;
  proposed_date: string | null;
  event_id: string | null;
  budget_estimated: number | null;
  main_contact_id: string | null;
  organization_id: string | null;
};

type EventRow = {
  id: string;
  title: string | null;
  starts_at: string | null;
  status: string | null;
  lifecycle_status: string | null;
  deal_id: string | null;
  client_entity_id: string | null;
};

type StakeholderRow = { deal_id: string; role: string; entity_id?: string };
type CrewRow = { deal_id: string; role_note: string | null; department: string | null; entity_id?: string };

const DEAL_PRE_CONTRACT = new Set(['inquiry', 'proposal', 'contract_sent']);
const DEAL_BOOKED = new Set([
  'contract_signed', 'deposit_received', 'won',
]);
const DEAL_DEAD = new Set(['lost']);

/**
 * Edge types that mean "person works at / is affiliated with this company."
 * Mirrors the set in get-team-preview.ts so both sides of the graph resolve
 * the same affiliation. Non-existent types just match nothing.
 */
const EMPLOYER_RELATIONSHIP_TYPES = [
  'MEMBER',
  'ROSTER_MEMBER',
  'EMPLOYEE',
  'WORKS_FOR',
  'EMPLOYED_AT',
  'AGENT',
];

function classifyBand(
  dealStatus: string | null,
  eventStatus: string | null,
  eventStartsAt: string | null,
): ProductionBand {
  // Event wins when handed off — its status + date reflect reality.
  if (eventStatus) {
    if (eventStartsAt && new Date(eventStartsAt) < new Date()) {
      return 'past';
    }
    return 'booked';
  }
  if (!dealStatus) return 'in_play';
  if (DEAL_DEAD.has(dealStatus)) return 'past';
  if (DEAL_BOOKED.has(dealStatus)) return 'booked';
  if (DEAL_PRE_CONTRACT.has(dealStatus)) return 'in_play';
  return 'in_play'; // default — pre-contract
}

/** Pretty phrase for a stakeholder role enum. */
function formatStakeholderRole(role: string): string {
  switch (role) {
    case 'bill_to': return 'Bill-to';
    case 'planner': return 'Planner';
    case 'venue_contact': return 'Venue contact';
    case 'vendor': return 'Vendor';
    default: return role;
  }
}

export async function getPersonProductions(
  workspaceId: string,
  entityId: string,
): Promise<GetPersonProductionsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  // ── 1. Find deals where person is main contact OR client organization ────
  const [{ data: dealsByContact }, { data: dealsByClient }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, title, status, proposed_date, event_id, budget_estimated, main_contact_id, organization_id')
      .eq('workspace_id', workspaceId)
      .eq('main_contact_id', entityId),
    supabase
      .from('deals')
      .select('id, title, status, proposed_date, event_id, budget_estimated, main_contact_id, organization_id')
      .eq('workspace_id', workspaceId)
      .eq('organization_id', entityId),
  ]);

  const dealsById = new Map<string, DealRow>();
  for (const d of (dealsByContact ?? []) as DealRow[]) dealsById.set(d.id, d);
  for (const d of (dealsByClient ?? []) as DealRow[]) dealsById.set(d.id, d);

  // ── 2. Find deals via stakeholder and crew edges ──────────────────────────
  const [{ data: stakeholderRows }, { data: crewRows }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .schema('ops')
      .from('deal_stakeholders')
      .select('deal_id, role')
      .eq('entity_id', entityId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .select('deal_id, role_note, department')
      .eq('entity_id', entityId)
      .eq('workspace_id', workspaceId),
  ]);

  const stakeholderRoleByDeal = new Map<string, string>();
  for (const s of ((stakeholderRows ?? []) as StakeholderRow[])) {
    if (!stakeholderRoleByDeal.has(s.deal_id)) {
      stakeholderRoleByDeal.set(s.deal_id, formatStakeholderRole(s.role));
    }
  }
  const crewRoleByDeal = new Map<string, string>();
  for (const c of ((crewRows ?? []) as CrewRow[])) {
    const phrase = c.role_note ?? c.department ?? 'Crew';
    if (!crewRoleByDeal.has(c.deal_id)) {
      crewRoleByDeal.set(c.deal_id, phrase);
    }
  }

  // Load any extra deals referenced via stakeholder/crew that we haven't seen.
  const extraDealIds = Array.from(
    new Set([
      ...stakeholderRoleByDeal.keys(),
      ...crewRoleByDeal.keys(),
    ]),
  ).filter((id) => !dealsById.has(id));

  if (extraDealIds.length > 0) {
    const { data: extraDeals } = await supabase
      .from('deals')
      .select('id, title, status, proposed_date, event_id, budget_estimated, main_contact_id, organization_id')
      .eq('workspace_id', workspaceId)
      .in('id', extraDealIds);
    for (const d of (extraDeals ?? []) as DealRow[]) dealsById.set(d.id, d);
  }

  // ── 3. Events where person is client directly ────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: eventsByClient } = await (supabase as any)
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, status, lifecycle_status, deal_id, client_entity_id')
    .eq('workspace_id', workspaceId)
    .eq('client_entity_id', entityId);

  const eventsByDealId = new Map<string, EventRow>();
  const orphanEvents: EventRow[] = []; // events with no linked deal
  for (const e of ((eventsByClient ?? []) as EventRow[])) {
    if (e.deal_id) eventsByDealId.set(e.deal_id, e);
    else orphanEvents.push(e);
  }

  // ── 4. For deals that have event_id set, fetch the event ─────────────────
  const dealEventIds = Array.from(dealsById.values())
    .map((d) => d.event_id)
    .filter((id): id is string => !!id && !Array.from(eventsByDealId.values()).some((e) => e.id === id));

  if (dealEventIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: linkedEvents } = await (supabase as any)
      .schema('ops')
      .from('events')
      .select('id, title, starts_at, status, lifecycle_status, deal_id, client_entity_id')
      .in('id', dealEventIds);
    for (const e of ((linkedEvents ?? []) as EventRow[])) {
      if (e.deal_id) eventsByDealId.set(e.deal_id, e);
    }
  }

  // ── 4.5 Inherit productions from employer companies ──────────────────────
  // A person who works at a company should see productions where the company
  // (not just the person) is on the deal — otherwise vendor-coordinator POCs
  // look like they have nothing active. Direct involvement already captured
  // above wins; inherited deals get a "via {Company}" role label.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: employerEdges } = await (supabase as any)
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, target_entity_id, relationship_type')
    .in('relationship_type', EMPLOYER_RELATIONSHIP_TYPES)
    .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`);

  const employerIdSet = new Set<string>();
  for (const e of ((employerEdges ?? []) as { source_entity_id: string; target_entity_id: string }[])) {
    const other = e.source_entity_id === entityId ? e.target_entity_id : e.source_entity_id;
    if (other && other !== entityId) employerIdSet.add(other);
  }

  const viaCompanyByDeal = new Map<string, string>(); // deal_id -> "via {Company Name}"

  if (employerIdSet.size > 0) {
    const employerIds = Array.from(employerIdSet);

    // Resolve company names + filter to type='company' (defence against stray edges).
    const { data: companyRows } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name, type')
      .in('id', employerIds)
      .eq('type', 'company');

    const companyNameById = new Map<string, string>();
    for (const c of ((companyRows ?? []) as { id: string; display_name: string | null }[])) {
      companyNameById.set(c.id, c.display_name ?? 'company');
    }
    const validCompanyIds = Array.from(companyNameById.keys());

    if (validCompanyIds.length > 0) {
      const [
        { data: companyDealsByContact },
        { data: companyDealsByClient },
        { data: companyStakeholderRows },
        { data: companyCrewRows },
        { data: companyEvents },
      ] = await Promise.all([
        supabase
          .from('deals')
          .select('id, title, status, proposed_date, event_id, budget_estimated, main_contact_id, organization_id')
          .eq('workspace_id', workspaceId)
          .in('main_contact_id', validCompanyIds),
        supabase
          .from('deals')
          .select('id, title, status, proposed_date, event_id, budget_estimated, main_contact_id, organization_id')
          .eq('workspace_id', workspaceId)
          .in('organization_id', validCompanyIds),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .schema('ops')
          .from('deal_stakeholders')
          .select('deal_id, role, entity_id')
          .in('entity_id', validCompanyIds),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .schema('ops')
          .from('deal_crew')
          .select('deal_id, role_note, department, entity_id')
          .in('entity_id', validCompanyIds)
          .eq('workspace_id', workspaceId),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .schema('ops')
          .from('events')
          .select('id, title, starts_at, status, lifecycle_status, deal_id, client_entity_id')
          .eq('workspace_id', workspaceId)
          .in('client_entity_id', validCompanyIds),
      ]);

      const annotateVia = (dealId: string, companyId: string) => {
        if (dealsById.has(dealId)) return; // direct involvement wins
        if (viaCompanyByDeal.has(dealId)) return; // first company wins
        const name = companyNameById.get(companyId);
        if (name) viaCompanyByDeal.set(dealId, `via ${name}`);
      };

      // Collect new deals from company paths.
      const companyDealRows = [
        ...((companyDealsByContact ?? []) as DealRow[]),
        ...((companyDealsByClient ?? []) as DealRow[]),
      ];
      const resolveCompanyId = (d: DealRow): string => {
        if (d.organization_id && companyNameById.has(d.organization_id)) return d.organization_id;
        if (d.main_contact_id && companyNameById.has(d.main_contact_id)) return d.main_contact_id;
        return validCompanyIds[0];
      };
      for (const d of companyDealRows) {
        annotateVia(d.id, resolveCompanyId(d));
        if (!dealsById.has(d.id)) dealsById.set(d.id, d);
      }

      for (const s of ((companyStakeholderRows ?? []) as StakeholderRow[])) {
        if (s.entity_id) annotateVia(s.deal_id, s.entity_id);
      }
      for (const c of ((companyCrewRows ?? []) as CrewRow[])) {
        if (c.entity_id) annotateVia(c.deal_id, c.entity_id);
      }

      // Fetch any still-missing deals referenced only via company stakeholder/crew.
      const missingDealIds = Array.from(viaCompanyByDeal.keys()).filter(
        (id) => !dealsById.has(id),
      );
      if (missingDealIds.length > 0) {
        const { data: viaDeals } = await supabase
          .from('deals')
          .select('id, title, status, proposed_date, event_id, budget_estimated, main_contact_id, organization_id')
          .eq('workspace_id', workspaceId)
          .in('id', missingDealIds);
        for (const d of (viaDeals ?? []) as DealRow[]) dealsById.set(d.id, d);
      }

      // Fetch events for any newly-added deals that have event_id set.
      const newDealEventIds = Array.from(dealsById.values())
        .map((d) => d.event_id)
        .filter((id): id is string => !!id && !Array.from(eventsByDealId.values()).some((e) => e.id === id));
      if (newDealEventIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: extraLinked } = await (supabase as any)
          .schema('ops')
          .from('events')
          .select('id, title, starts_at, status, lifecycle_status, deal_id, client_entity_id')
          .in('id', newDealEventIds);
        for (const e of ((extraLinked ?? []) as EventRow[])) {
          if (e.deal_id) eventsByDealId.set(e.deal_id, e);
        }
      }

      // Orphan events for employer companies (company-as-client, no deal).
      const seenOrphanIds = new Set(orphanEvents.map((x) => x.id));
      for (const e of ((companyEvents ?? []) as EventRow[])) {
        if (e.deal_id && !eventsByDealId.has(e.deal_id)) {
          eventsByDealId.set(e.deal_id, e);
          continue;
        }
        if (e.deal_id) continue;
        if (seenOrphanIds.has(e.id)) continue;
        orphanEvents.push(e);
        seenOrphanIds.add(e.id);
        if (e.client_entity_id) annotateVia(e.id, e.client_entity_id);
      }
    }
  }

  // ── 5. Compose productions ───────────────────────────────────────────────
  const productions: PersonProduction[] = [];

  for (const deal of dealsById.values()) {
    const event = eventsByDealId.get(deal.id) ?? null;
    const date = event?.starts_at ?? deal.proposed_date;

    // Collapse role — preference order:
    //   client → main contact → stakeholder → crew → inherited via employer.
    let role: string | null = null;
    if (deal.organization_id === entityId) role = 'Client';
    else if (deal.main_contact_id === entityId) role = 'Main contact';
    else if (stakeholderRoleByDeal.has(deal.id)) role = stakeholderRoleByDeal.get(deal.id) ?? null;
    else if (crewRoleByDeal.has(deal.id)) role = crewRoleByDeal.get(deal.id) ?? null;
    else if (viaCompanyByDeal.has(deal.id)) role = viaCompanyByDeal.get(deal.id) ?? null;

    const band = classifyBand(deal.status, event?.lifecycle_status ?? event?.status ?? null, event?.starts_at ?? null);

    productions.push({
      id: deal.id,
      dealId: deal.id,
      eventId: event?.id ?? null,
      title: event?.title ?? deal.title,
      date: date ?? null,
      status: event?.lifecycle_status ?? event?.status ?? deal.status ?? null,
      band,
      role,
      amountEstimated: deal.budget_estimated ?? null,
      href: event?.id ? `/crm?eventId=${event.id}` : `/crm?dealId=${deal.id}`,
    });
  }

  // Orphan events (person or their employer is client on an event with no deal).
  for (const event of orphanEvents) {
    const viaRole = viaCompanyByDeal.get(event.id);
    productions.push({
      id: event.id,
      dealId: null,
      eventId: event.id,
      title: event.title,
      date: event.starts_at ?? null,
      status: event.lifecycle_status ?? event.status ?? null,
      band: classifyBand(null, event.lifecycle_status ?? event.status ?? null, event.starts_at),
      role: viaRole ?? 'Client',
      amountEstimated: null,
      href: `/crm?eventId=${event.id}`,
    });
  }

  // Sort within each band: in_play + booked descending, past descending.
  productions.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });

  const bands: Record<ProductionBand, number> = {
    in_play: 0,
    booked: 0,
    past: 0,
  };
  for (const p of productions) bands[p.band]++;

  return { ok: true, productions, bands };
}
