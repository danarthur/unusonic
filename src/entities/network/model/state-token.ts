/**
 * The one thing to know before you do anything else.
 *
 * I-PASS — the only structured-handover format with moderate-certainty evidence
 * behind it (AHRQ systematic review, ten studies) — opens every handover with a
 * single word before any prose: stable, watcher, unstable. The reader gets the
 * triage bit before the narrative, every time, in the same slot.
 *
 * This is that slot. One token, computed, never generated. It is the highest-
 * value byte on the card because it is the only part that can change what you
 * were about to do.
 *
 * Deliberately singular. A row of five chips is a row of five things to read,
 * which is the problem a glance is meant to solve.
 *
 * Design: docs/what-the-brief-should-say.md §B1.
 *
 * @module entities/network/model/state-token
 */

export type StateTone = 'warning' | 'attention' | 'neutral';

export type StateToken = {
  label: string;
  tone: StateTone;
  /** Why this won, for the title attribute. Never rendered inline. */
  because: string;
};

export type StateFacts = {
  /** A standing judgement not to work with them again. */
  doNotRebook?: boolean;
  /** What they owe us. Never netted against what we owe them. */
  theyOweUs?: number;
  /** What we owe them. */
  weOweThem?: number;
  /** ISO date of the next show ahead, if any. */
  nextBooked?: string | null;
  /** ISO date of the most recent show already worked. */
  lastWorked?: string | null;
};

/** A show this close changes the conversation you are about to have. */
const IMMINENT_DAYS = 14;

/**
 * Six months with nothing behind and nothing ahead. Matches the threshold
 * `computeRelationshipStrength` already uses to call a relationship cooling, so
 * the card and the chip cannot disagree about the same person.
 */
const DORMANT_MONTHS = 6;

const DAY = 24 * 60 * 60 * 1000;

function daysFromNow(iso: string, now: Date): number {
  // Date-only values are calendar dates, not instants. Parsing them as UTC and
  // comparing whole days keeps a show from reading a day early west of London.
  const then = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return Math.round((then.getTime() - today.getTime()) / DAY);
}

function usd(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function inDays(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/**
 * The single most consequential fact, or null when there is nothing to say.
 *
 * Ordered by what would change the next thing you do, not by severity in the
 * abstract:
 *
 *   1. Do not rebook -- you may be about to book them.
 *   2. A show inside a fortnight -- imminence beats the ledger.
 *   3. Money outstanding, either direction.
 *   4. A show further out.
 *   5. Nothing behind and nothing ahead for six months.
 *
 * Null is a real answer. A new contact with no history has nothing worth a
 * chip, and inventing one ("no activity") trains people to stop reading it.
 */
type Rule = (facts: StateFacts, now: Date) => StateToken | null;

/** A show already booked and still ahead, in days. Null when there is none. */
function daysToNextShow(facts: StateFacts, now: Date): number | null {
  if (!facts.nextBooked) return null;
  const days = daysFromNow(facts.nextBooked, now);
  return days >= 0 ? days : null;
}

/**
 * Ordered by what would change the next thing you do, not by severity in the
 * abstract. Written as a list because the order IS the design, and a nest of
 * conditions hides it.
 */
const RULES: Rule[] = [
  // You may be about to book them. Everything else can wait.
  (facts) =>
    facts.doNotRebook
      ? { label: 'Do not rebook', tone: 'warning', because: 'Flagged do not rebook' }
      : null,

  // Imminence beats the ledger: the show changes the conversation you are
  // about to have, the invoice will still be there afterwards.
  (facts, now) => {
    const days = daysToNextShow(facts, now);
    if (days === null || days > IMMINENT_DAYS) return null;
    return { label: `Next show ${inDays(days)}`, tone: 'attention', because: facts.nextBooked! };
  },

  // Never netted. Two directions are two facts, and one number for both would
  // hide whichever is smaller.
  (facts) =>
    facts.theyOweUs && facts.theyOweUs > 0
      ? { label: `${usd(facts.theyOweUs)} outstanding`, tone: 'attention', because: 'Unpaid invoices' }
      : null,
  (facts) =>
    facts.weOweThem && facts.weOweThem > 0
      ? { label: `${usd(facts.weOweThem)} to pay`, tone: 'attention', because: 'Owed to them' }
      : null,

  (facts, now) => {
    const days = daysToNextShow(facts, now);
    if (days === null) return null;
    return { label: `Next show in ${days} days`, tone: 'neutral', because: facts.nextBooked! };
  },

  (facts, now) => {
    if (!facts.lastWorked) return null;
    const since = -daysFromNow(facts.lastWorked, now);
    if (since < DORMANT_MONTHS * 30) return null;
    return {
      label: `Quiet ${Math.floor(since / 30)} months`,
      tone: 'neutral',
      because: `Last worked ${facts.lastWorked}`,
    };
  },
];

/**
 * The single most consequential fact, or null when there is nothing to say.
 *
 * Null is a real answer. A new contact with no history has nothing worth a
 * chip, and inventing one ("no activity") trains people to stop reading it.
 */
export function entityStateToken(facts: StateFacts, now: Date = new Date()): StateToken | null {
  for (const rule of RULES) {
    const token = rule(facts, now);
    if (token) return token;
  }
  return null;
}

/**
 * Next and last, read off the productions list rather than queried again.
 *
 * The panel and the record page both already fetch productions on the same
 * query key, so the chip costs nothing extra -- and it cannot disagree with the
 * list underneath it, which a second reader eventually would.
 */
export function showDatesFromProductions(
  productions: { date: string | null; band: 'in_play' | 'booked' | 'past' }[],
): { nextBooked: string | null; lastWorked: string | null } {
  let nextBooked: string | null = null;
  let lastWorked: string | null = null;

  for (const production of productions) {
    if (!production.date) continue;
    // Booked means signed and still ahead; the band already decided that.
    if (production.band === 'booked' && (!nextBooked || production.date < nextBooked)) {
      nextBooked = production.date;
    }
    // In play is a proposal, not a commitment, so it is not a show you have.
    if (production.band === 'past' && (!lastWorked || production.date > lastWorked)) {
      lastWorked = production.date;
    }
  }

  return { nextBooked, lastWorked };
}
