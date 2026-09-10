/**
 * Types and pure logic for entity productions.
 *
 * Split from the server action so the classification and role-collapse rules
 * can be tested directly -- a `'use server'` module may only export async
 * functions, and these are the parts worth asserting on.
 *
 * @module widgets/network-detail/api/entity-productions-shape
 */

export type ProductionBand = 'in_play' | 'booked' | 'past';

export type EntityProduction = {
  /** Stable id: the deal_id when a deal exists, else the event_id. */
  id: string;
  dealId: string | null;
  eventId: string | null;
  title: string | null;
  /** ISO date — event.starts_at when handed off, else deals.proposed_date. */
  date: string | null;
  /**
   * What to show: the event's status once handed off, else the deal's.
   *
   * Use `dealStatus` for anything that counts. After handover this field
   * becomes the event's lifecycle status, so filtering it for 'won' silently
   * drops every deal that actually became a show -- which is the opposite of
   * what a win rate is asking.
   */
  status: string | null;
  /** The raw pipeline status, untouched by handover. For analytics, not display. */
  dealStatus: string | null;
  /** Deal archetype (wedding, corporate, ...), for "what do they usually book". */
  archetype: string | null;
  band: ProductionBand;
  /** Role(s) the entity holds on this production, collapsed to a phrase. */
  role: string | null;
  /** Optional budget estimate (from deals.budget_estimated). */
  amountEstimated: number | null;
  /** Deep-link path back to the production. */
  href: string;
  /**
   * Set when a company reaches this production only through one of its people.
   *
   * Without it the row is unexplained: the company was never named on the deal,
   * so "why is this here" has no answer on screen.
   */
  viaPersonName: string | null;
};

export type DealRow = {
  id: string;
  title: string | null;
  status: string | null;
  proposed_date: string | null;
  event_id: string | null;
  budget_estimated: number | null;
  main_contact_id: string | null;
  organization_id: string | null;
  event_archetype: string | null;
};

export type EventRow = {
  id: string;
  title: string | null;
  starts_at: string | null;
  status: string | null;
  lifecycle_status: string | null;
  deal_id: string | null;
  client_entity_id: string | null;
};

export const DEAL_COLUMNS =
  'id, title, status, proposed_date, event_id, budget_estimated, main_contact_id, organization_id, event_archetype';

export const EVENT_COLUMNS =
  'id, title, starts_at, status, lifecycle_status, deal_id, client_entity_id';
/**
 * `deals.status` holds the stage KIND, not the stage name.
 *
 * Stages are configurable per workspace -- inquiry, proposal, contract_sent and
 * the rest live in ops.pipeline_stages and can be renamed or replaced -- but
 * every stage rolls up to one of three kinds, and those are stable. An earlier
 * version matched hardcoded stage NAMES against a column that only ever holds
 * kinds, and appeared to work purely because "won" and "lost" happen to be both
 * a kind and a stage.
 */
const DEAL_WON = 'won';
const DEAL_LOST = 'lost';

/**
 * Which band a production belongs in.
 *
 * The date decides more than the stage does. A proposal whose date has passed
 * is not still in play -- the show either happened or it did not, and either
 * way it is over. Leaving it under "In play" is how a dead deal from last
 * spring sits at the top of a profile looking like live work.
 *
 * `date` is the event's start when there is one and the proposed date
 * otherwise, so a handed-off show is judged on when it actually happens.
 */
export function classifyBand(
  dealStatus: string | null,
  eventStatus: string | null,
  date: string | null,
  now: Date = new Date(),
): ProductionBand {
  const hasPassed = date ? new Date(date) < now : false;

  if (dealStatus === DEAL_LOST) return 'past';
  // Handed off, or won and awaiting handover: real work either way.
  if (eventStatus || dealStatus === DEAL_WON) return hasPassed ? 'past' : 'booked';
  return hasPassed ? 'past' : 'in_play';
}

/**
 * Whether this production is a show actually worked, rather than one that died.
 *
 * The past band holds both -- a wedding delivered last spring and a proposal
 * that went quiet -- and counting them together would inflate "12 shows" with
 * work that never happened. An event exists only after handover, so its
 * presence is itself proof the show became real.
 */
export function wasWorked(production: EntityProduction): boolean {
  return production.band === 'past'
    && (production.dealStatus === DEAL_WON || production.eventId !== null);
}

/** Pretty phrase for a stakeholder role enum. */
export function formatStakeholderRole(role: string): string {
  switch (role) {
    case 'bill_to': return 'Bill-to';
    case 'planner': return 'Planner';
    case 'venue_contact': return 'Venue contact';
    case 'vendor': return 'Vendor';
    default: return role;
  }
}

export type ComposeInput = {
  entityId: string;
  deals: Iterable<DealRow>;
  eventsByDealId: Map<string, EventRow>;
  orphanEvents: EventRow[];
  stakeholderRoleByDeal: Map<string, string>;
  crewRoleByDeal: Map<string, string>;
  /** deal id → the person's name, for productions reached through the team. */
  viaPersonByDeal: Map<string, string>;
  now?: Date;
};

/**
 * How the entity is involved, collapsed to one phrase.
 *
 * Ordered most-direct first. Being the client outranks being named on it, which
 * outranks being crewed on it; reaching it only through an employee comes last
 * because it is the weakest claim and the one that most needs explaining.
 */
function collapseRole(deal: DealRow, input: ComposeInput): string | null {
  const { entityId } = input;
  if (deal.organization_id === entityId) return 'Client';
  if (deal.main_contact_id === entityId) return 'Main contact';
  return (
    input.stakeholderRoleByDeal.get(deal.id)
    ?? input.crewRoleByDeal.get(deal.id)
    ?? (input.viaPersonByDeal.has(deal.id) ? `via ${input.viaPersonByDeal.get(deal.id)}` : null)
  );
}

/** An event flattened to the four fields a production actually reads. */
type ResolvedEvent = {
  id: string | null;
  title: string | null;
  startsAt: string | null;
  status: string | null;
};

const NO_EVENT: ResolvedEvent = { id: null, title: null, startsAt: null, status: null };

function resolveEvent(dealId: string, events: Map<string, EventRow>): ResolvedEvent {
  const e = events.get(dealId);
  if (!e) return NO_EVENT;
  return {
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    status: e.lifecycle_status ?? e.status,
  };
}

function productionFromDeal(deal: DealRow, input: ComposeInput, now: Date): EntityProduction {
  const event = resolveEvent(deal.id, input.eventsByDealId);

  return {
    id: deal.id,
    dealId: deal.id,
    eventId: event.id,
    title: event.title ?? deal.title,
    date: event.startsAt ?? deal.proposed_date,
    status: event.status ?? deal.status,
    dealStatus: deal.status,
    archetype: deal.event_archetype,
    band: classifyBand(deal.status, event.status, event.startsAt ?? deal.proposed_date, now),
    role: collapseRole(deal, input),
    amountEstimated: deal.budget_estimated,
    href: event.id ? `/events?eventId=${event.id}` : `/events?dealId=${deal.id}`,
    viaPersonName: input.viaPersonByDeal.get(deal.id) ?? null,
  };
}

/**
 * The entity is the client on an event that never had a deal. Rare, but the
 * show still happened and dropping it would understate the history.
 */
function productionFromEvent(event: EventRow, now: Date): EntityProduction {
  const eventStatus = event.lifecycle_status ?? event.status ?? null;
  return {
    id: event.id,
    dealId: null,
    eventId: event.id,
    title: event.title,
    date: event.starts_at ?? null,
    status: eventStatus,
    dealStatus: null,
    archetype: null,
    band: classifyBand(null, eventStatus, event.starts_at, now),
    role: 'Client',
    amountEstimated: null,
    href: `/events?eventId=${event.id}`,
    viaPersonName: null,
  };
}

function byDateDescending(a: EntityProduction, b: EntityProduction): number {
  return (b.date ? new Date(b.date).getTime() : 0) - (a.date ? new Date(a.date).getTime() : 0);
}

/** Build the rendered list, newest first, plus a count per band. */
export function composeProductions(input: ComposeInput): {
  productions: EntityProduction[];
  bands: Record<ProductionBand, number>;
} {
  const now = input.now ?? new Date();

  const productions = [
    ...[...input.deals].map((deal) => productionFromDeal(deal, input, now)),
    ...input.orphanEvents.map((event) => productionFromEvent(event, now)),
  ].sort(byDateDescending);

  const bands: Record<ProductionBand, number> = { in_play: 0, booked: 0, past: 0 };
  for (const p of productions) bands[p.band] += 1;

  return { productions, bands };
}
