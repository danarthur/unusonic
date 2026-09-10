/**
 * getEntityProductions — every production an entity is involved in.
 *
 * THE CANONICAL READER. Two actions used to answer this question and they
 * disagreed. `getPersonProductions` had richer output but only person routes;
 * `getEntityDeals` had the company routes but a flat shape. So a company's
 * deal count depended on which surface asked, and Aion -- which used the
 * flatter one -- reported different totals from the panel sitting next to it.
 * Win rate and average deal size were computed from the short answer.
 *
 * Involvement is any of:
 *   1. deals.main_contact_id                  — the person on the deal
 *   2. deals.organization_id                  — the client, person or company
 *   3. ops.deal_stakeholders.entity_id        — named on the deal
 *   4. ops.deal_stakeholders.organization_id  — their company named on the deal
 *   5. ops.deal_crew.entity_id                — crewed on it
 *   6. ops.events.client_entity_id            — client on an event with no deal
 *   7. through the team                       — a company reaching a deal only
 *                                               via someone who works there
 *
 * Routes 4 and 7 are why a company used to read as having no history: an
 * agency is often never named on the deal at all, and its planner is. Dropping
 * either one makes the company look like a stranger to work it actually did.
 *
 * When a deal has an event, the event's date and status win -- after handover
 * they are what happened, while the proposed date is a guess nobody corrected.
 *
 * @module widgets/network-detail/api/get-entity-productions
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { AFFILIATION_RELATIONSHIP_TYPES } from '@/entities/network/model/affiliation';
import {
  composeProductions,
  formatStakeholderRole,
  DEAL_COLUMNS,
  EVENT_COLUMNS,
  type DealRow,
  type EventRow,
  type EntityProduction,
  type ProductionBand,
} from './entity-productions-shape';

export type { EntityProduction, ProductionBand };

export type GetEntityProductionsResult =
  | { ok: true; productions: EntityProduction[]; bands: Record<ProductionBand, number> }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any -- cross-schema row shapes resolve at runtime; narrowing here would duplicate the generated types. */
type Db = any;

const EMPTY_BANDS: Record<ProductionBand, number> = { in_play: 0, booked: 0, past: 0 };

/** Routes 1 and 2: the entity named directly on the deal. */
async function fetchDirectDeals(db: Db, workspaceId: string, entityId: string): Promise<DealRow[]> {
  const [byContact, byClient] = await Promise.all([
    db.from('deals').select(DEAL_COLUMNS).eq('workspace_id', workspaceId).eq('main_contact_id', entityId),
    db.from('deals').select(DEAL_COLUMNS).eq('workspace_id', workspaceId).eq('organization_id', entityId),
  ]);
  return [...(byContact.data ?? []), ...(byClient.data ?? [])] as DealRow[];
}

/**
 * Routes 3, 4 and 5: the edges that name the entity on a deal without owning it.
 *
 * The organization route is queried separately rather than with `.or()` -- two
 * id lists in one query string is how these URLs get long enough to be
 * truncated, and a silently truncated filter reads as "no history".
 */
async function fetchEdgeRoles(db: Db, workspaceId: string, entityId: string) {
  const [asPerson, asOrg, asCrew] = await Promise.all([
    db.schema('ops').from('deal_stakeholders').select('deal_id, role').eq('entity_id', entityId),
    db.schema('ops').from('deal_stakeholders').select('deal_id, role').eq('organization_id', entityId),
    db.schema('ops').from('deal_crew').select('deal_id, role_note, department')
      .eq('entity_id', entityId).eq('workspace_id', workspaceId),
  ]);

  const stakeholderRoleByDeal = new Map<string, string>();
  for (const r of [...(asPerson.data ?? []), ...(asOrg.data ?? [])] as { deal_id: string; role: string }[]) {
    if (!stakeholderRoleByDeal.has(r.deal_id)) {
      stakeholderRoleByDeal.set(r.deal_id, formatStakeholderRole(r.role));
    }
  }

  const crewRoleByDeal = new Map<string, string>();
  for (const c of (asCrew.data ?? []) as { deal_id: string; role_note: string | null; department: string | null }[]) {
    if (!crewRoleByDeal.has(c.deal_id)) {
      crewRoleByDeal.set(c.deal_id, c.role_note ?? c.department ?? 'Crew');
    }
  }

  return { stakeholderRoleByDeal, crewRoleByDeal };
}

/**
 * Route 7: deals this company reaches only through the people who work there.
 *
 * A no-op for a person, who has no one working for them. Live edges only --
 * a departed employee's later work is not their old employer's history.
 */
async function fetchViaTeam(db: Db, entityId: string): Promise<Map<string, string>> {
  const { data: edges } = await db
    .schema('cortex').from('relationships')
    .select('source_entity_id')
    .eq('target_entity_id', entityId)
    .is('ended_at', null)
    .in('relationship_type', AFFILIATION_RELATIONSHIP_TYPES);

  const personIds = [...new Set(
    ((edges ?? []) as { source_entity_id: string }[]).map((e) => e.source_entity_id),
  )].filter((id) => id !== entityId);

  if (personIds.length === 0) return new Map();

  const [{ data: rows }, { data: people }] = await Promise.all([
    db.schema('ops').from('deal_stakeholders').select('deal_id, entity_id').in('entity_id', personIds),
    db.schema('directory').from('entities').select('id, display_name').in('id', personIds),
  ]);

  const nameById = new Map(
    ((people ?? []) as { id: string; display_name: string | null }[])
      .map((p) => [p.id, p.display_name ?? 'a colleague'] as const),
  );

  const viaPersonByDeal = new Map<string, string>();
  for (const r of (rows ?? []) as { deal_id: string; entity_id: string }[]) {
    if (!viaPersonByDeal.has(r.deal_id)) {
      viaPersonByDeal.set(r.deal_id, nameById.get(r.entity_id) ?? 'a colleague');
    }
  }
  return viaPersonByDeal;
}

/** Route 6, plus the events belonging to deals we already have. */
async function fetchEvents(db: Db, workspaceId: string, entityId: string, deals: Map<string, DealRow>) {
  const { data: asClient } = await db
    .schema('ops').from('events').select(EVENT_COLUMNS)
    .eq('workspace_id', workspaceId).eq('client_entity_id', entityId);

  const eventsByDealId = new Map<string, EventRow>();
  const orphanEvents: EventRow[] = [];
  for (const e of (asClient ?? []) as EventRow[]) {
    if (e.deal_id) eventsByDealId.set(e.deal_id, e);
    else orphanEvents.push(e);
  }

  const missing = [...deals.values()]
    .map((d) => d.event_id)
    .filter((id): id is string => Boolean(id));

  if (missing.length > 0) {
    const { data: linked } = await db
      .schema('ops').from('events').select(EVENT_COLUMNS).in('id', missing);
    for (const e of (linked ?? []) as EventRow[]) {
      if (e.deal_id) eventsByDealId.set(e.deal_id, e);
    }
  }

  return { eventsByDealId, orphanEvents };
}

export async function getEntityProductions(
  workspaceId: string,
  entityId: string,
): Promise<GetEntityProductionsResult> {
  if (!workspaceId || !entityId) {
    return { ok: true, productions: [], bands: EMPTY_BANDS };
  }

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  const [direct, edges, viaPersonByDeal] = await Promise.all([
    fetchDirectDeals(db, workspaceId, entityId),
    fetchEdgeRoles(db, workspaceId, entityId),
    fetchViaTeam(db, entityId),
  ]);

  const dealsById = new Map<string, DealRow>();
  for (const d of direct) dealsById.set(d.id, d);

  // Deals reached only by an edge still need their row loading.
  const referenced = [
    ...edges.stakeholderRoleByDeal.keys(),
    ...edges.crewRoleByDeal.keys(),
    ...viaPersonByDeal.keys(),
  ].filter((id) => !dealsById.has(id));

  if (referenced.length > 0) {
    const { data: extra } = await db
      .from('deals').select(DEAL_COLUMNS)
      .eq('workspace_id', workspaceId)
      .in('id', [...new Set(referenced)]);
    for (const d of (extra ?? []) as DealRow[]) dealsById.set(d.id, d);
  }

  const { eventsByDealId, orphanEvents } = await fetchEvents(db, workspaceId, entityId, dealsById);

  const { productions, bands } = composeProductions({
    entityId,
    deals: dealsById.values(),
    eventsByDealId,
    orphanEvents,
    stakeholderRoleByDeal: edges.stakeholderRoleByDeal,
    crewRoleByDeal: edges.crewRoleByDeal,
    viaPersonByDeal,
  });

  return { ok: true, productions, bands };
}
