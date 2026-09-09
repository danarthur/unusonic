/**
 * What the three detail lines on a contact card say, and in what order.
 *
 * THE PROBLEM THIS SOLVES
 * The card had nine conditionally-rendered slots, so no two cards shared a
 * height and the grid read as broken even when every card was individually
 * fine. That matters more than it sounds: the mode the grid has to serve is
 * shortlist building -- "who can work Saturday" -- which is comparison, and
 * comparison needs the same field in the same physical position on every card.
 * Known-target lookup, the majority of visits, is search's job and search does
 * it better.
 *
 * THE MECHANISM
 * Borrowed from Salesforce compact layouts: an ordered priority list against a
 * FIXED slot count, where a field with no value is skipped and the next
 * candidate takes its place. Every card fills the same three lines. That gives
 * uniform height without reserving blank space for absent fields, so a sparse
 * ghost entity -- most of this directory -- still looks deliberate.
 *
 * WHAT IS DELIBERATELY ABSENT
 * Compliance (W-9, COI, union) is scoped to people we employ and belongs on a
 * record tab, never a scanning surface. Referral count is not here either: no
 * mainstream CRM puts one on a contact row, and doing so asserts that a contact
 * is a producer -- defensible for a coordinator, but a claim to make
 * deliberately rather than a default. Role is not a slot because it is already
 * the line above. Tenure ("since Mar 2024") is a row-creation timestamp, not
 * relationship memory.
 *
 * Design: docs/reference/network-page-ia-redesign.md
 *
 * @module entities/network/model/card-slots
 */

import type { NetworkNode } from './types';

/** One rendered detail line. */
export type CardSlot = {
  /** Stable identity for React keys and for tests. */
  key: string;
  text: string;
  /** Render in the data font with tabular numerals. */
  numeric?: boolean;
  /** Carries consequence -- money owed, a date that constrains a decision. */
  tone?: 'warning';
  /**
   * Names in this line that open their own entity.
   *
   * People at a company often have no direct edge to the workspace, so this
   * line is the only place they appear on the contacts page at all. Rendering
   * them as plain text would leave a planner with real deal history visible but
   * unreachable.
   */
  links?: { entityId: string; name: string }[];
  /** Trailing text after the links, e.g. " +2". */
  suffix?: string;
};

/** Every card renders exactly this many detail lines, or fewer if data runs out. */
export const CARD_SLOT_COUNT = 3;

const MS_PER_DAY = 86_400_000;

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * A show date and how precise it is.
 *
 * The two sources genuinely differ and must be formatted differently.
 * `deals.proposed_date` is a date column -- "2026-11-01" parses to midnight UTC,
 * and formatting that in local time renders "Oct 31" for everyone west of
 * Greenwich, showing every proposed date a day early. `ops.events.starts_at` is
 * a real timestamp: a show at 8pm Pacific is the next day in UTC, so forcing
 * that one to UTC breaks it in the opposite direction. Neither timezone is
 * right for both, so each carries its own.
 */
type ShowDate = { at: Date; calendarOnly: boolean };

function parse(iso: string | null | undefined): ShowDate | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return { at, calendarOnly: /^\d{4}-\d{2}-\d{2}$/.test(iso) };
}

/** The zone a given show date must be read in to name the right day. */
function zoneOf({ calendarOnly }: ShowDate): 'UTC' | undefined {
  return calendarOnly ? 'UTC' : undefined;
}

function yearOf(show: ShowDate): number {
  return show.calendarOnly ? show.at.getUTCFullYear() : show.at.getFullYear();
}

/** "Aug 16", or "Aug 16, 2025" once the year stops being obvious. */
function formatDay(show: ShowDate, now: Date): string {
  const withYear = yearOf(show) !== now.getFullYear();
  return show.at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: zoneOf(show),
  });
}

/**
 * Near-future dates read as weekdays because that is how the question is asked
 * -- "can he do Saturday" -- and "Sat" is shorter and lands faster than a date.
 */
function formatUpcoming(show: ShowDate, now: Date): string {
  const days = (show.at.getTime() - now.getTime()) / MS_PER_DAY;
  if (days > 6) return formatDay(show, now);
  return show.at.toLocaleDateString('en-US', { weekday: 'short', timeZone: zoneOf(show) });
}

/** A candidate line. Returns null when this entity has nothing to say here. */
type SlotProducer = (node: NetworkNode, now: Date) => CardSlot | null;

/**
 * Money runs both ways and is never netted into one signed figure.
 *
 * The same component would otherwise mean opposite things for a client and for
 * a freelancer, with nothing on the card to say which. Two positive numbers
 * with second-person labels is what Xero, Business Central and Zoho Books all
 * ship; QuickBooks cannot hold both, which is why it tells people to enter the
 * same counterparty twice under slightly different names.
 */
const owes: SlotProducer = (node) => {
  const amount = node.meta.outstanding_balance ?? 0;
  if (amount <= 0) return null;
  return { key: 'owes', text: `Owes ${formatUsd(amount)}`, numeric: true, tone: 'warning' };
};

const weOwe: SlotProducer = (node) => {
  const amount = node.meta.payable_balance ?? 0;
  if (amount <= 0) return null;
  return { key: 'we-owe', text: `You owe ${formatUsd(amount)}`, numeric: true, tone: 'warning' };
};

/**
 * The single biggest hole in the old card: it could say what someone's tier
 * was and how complete their profile was, but not whether they can work
 * Saturday -- the question the page is actually opened to answer.
 */
const nextBooked: SlotProducer = (node, now) => {
  const show = parse(node.meta.nextBooked);
  if (!show) return null;
  const when = formatUpcoming(show, now);
  // A proposed date is a guess typed into a pipeline record. Calling it booked
  // would put someone on a show that was never confirmed.
  return node.meta.nextConfirmed
    ? { key: 'next', text: `Booked ${when}`, numeric: true }
    : { key: 'next', text: `Proposed ${when}`, numeric: true };
};

const lastShow: SlotProducer = (node, now) => {
  const show = parse(node.meta.lastWorked);
  return show ? { key: 'last', text: `Last show ${formatDay(show, now)}`, numeric: true } : null;
};

/**
 * What they cost. Second question when staffing, right after "are they free" --
 * and the reason a rate is worth a slot at all is that a scan is where you
 * compare it against everyone else's.
 */
const rate: SlotProducer = (node) => {
  const r = node.meta.rate;
  if (!r) return null;
  const per = r.unit ? ` / ${r.unit}` : '';
  return { key: 'rate', text: `${formatUsd(r.amount)}${per}`, numeric: true };
};

const region: SlotProducer = (node) =>
  node.meta.region ? { key: 'region', text: node.meta.region } : null;

const employer: SlotProducer = (node) =>
  node.employer ? { key: 'employer', text: node.employer.name } : null;

/**
 * People at this company. Many have no direct edge to the workspace, so this is
 * the only place they surface on the contacts page at all -- and for an agency,
 * the planner is the relationship while the company is just the letterhead.
 */
const affiliates: SlotProducer = (node) => {
  const people = node.affiliates ?? [];
  if (people.length === 0) return null;
  // Two names then a count -- the card is a glance, not a roster.
  const shown = people.slice(0, 2);
  const suffix = people.length > 2 ? ` +${people.length - 2}` : '';
  return {
    key: 'affiliates',
    text: `${shown.map((a) => a.name).join(', ')}${suffix}`,
    links: shown.map((a) => ({ entityId: a.entityId, name: a.name })),
    suffix,
  };
};

/**
 * Priority per shape. Order is the design: the first three that have values win.
 *
 * Money leads wherever it appears because it is the one fact that can stop a
 * scan outright, and it self-gates by only existing when non-zero. A venue is
 * the exception -- on a regional circuit, Napa versus Sonoma is the whole
 * decision, so place outranks everything.
 */
const BY_SHAPE: Record<'person' | 'company' | 'venue', SlotProducer[]> = {
  person: [owes, weOwe, nextBooked, lastShow, rate, employer, region],
  company: [owes, weOwe, affiliates, lastShow, region],
  venue: [region, owes, weOwe, lastShow, affiliates],
};

function shapeOf(node: NetworkNode): 'person' | 'company' | 'venue' {
  const t = node.identity.entityType;
  if (t === 'venue') return 'venue';
  if (t === 'company') return 'company';
  // Person, couple, or unknown. A couple is a pair of wedding hosts -- a
  // client, but person-shaped, and it wants the same lines a person does.
  return 'person';
}

/** The detail lines for one card, in render order. */
export function resolveCardSlots(node: NetworkNode, now: Date = new Date()): CardSlot[] {
  const slots: CardSlot[] = [];
  for (const produce of BY_SHAPE[shapeOf(node)]) {
    if (slots.length === CARD_SLOT_COUNT) break;
    const slot = produce(node, now);
    if (slot) slots.push(slot);
  }
  return slots;
}

/**
 * Do-not-rebook, for every relationship rather than only employees.
 *
 * It used to render only when the node was core, so the flag was invisible on
 * vendors, venues and clients -- the relationships where "never again" is the
 * more consequential judgement, and the ones most likely to be re-booked by
 * someone who was not there the first time.
 */
export function isFlagged(node: NetworkNode): boolean {
  return node.meta.doNotRebook === true;
}
