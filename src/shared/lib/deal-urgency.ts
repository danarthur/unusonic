/**
 * Days-out urgency signal (Ext A) — resolves the event date that drives a
 * deal's priority multiplier and situates the card's voice paragraph.
 *
 * See docs/reference/aion-deal-card-unified-design.md §20.3.
 *
 * Date source precedence (per Signal Navigator):
 *   - Post-handoff, non-series:    ops.events.starts_at (single row, upcoming)
 *   - Post-handoff, series:        MIN(starts_at) WHERE starts_at >= now()
 *                                  from ops.events for the deal's project
 *   - Post-handoff, all past:      suppress (return null date)
 *   - Pre-handoff (no events):     fallback to public.deals.proposed_date
 *   - Neither:                     null
 *
 * Multiplier ramp (Critic's numbers, r3 §20.3):
 *   NULL   → 1.0   no signal
 *   > 90d  → 0.8   plenty of runway
 *   30–90  → 1.0   baseline
 *   14–29  → 1.2   approaching
 *   7–13   → 1.5   near-term
 *   < 7    → 2.0   urgent
 *   past   → 'suppress' (caller must not surface the card)
 *
 * Voice paragraph guidance: render "{N} days out" only when days_out <= 30
 * and not null. >30 or NULL = omit from voice.
 */

export type DealUrgency = {
  date: string | null;                         // ISO date of the driving event, or null
  source: 'event_next' | 'deal_proposed_date' | null;
  isSeries: boolean;
  totalShows: number;                          // non-archived events for this deal
  daysOut: number | null;                      // whole days from today; null if no date
  multiplier: number;                          // 0.8..2.0 per ramp; 1.0 when NULL
  suppress: boolean;                           // true = all events past, don't show card
};

/**
 * Pure computation given raw event+deal data. Separate from the DB read so
 * unit tests can cover the ramp + edge cases without mocking Supabase.
 */
export function computeDealUrgency(params: {
  upcomingEventStartsAt: string[];  // ISO, already filtered to archived_at IS NULL, sorted ascending
  pastEventStartsAt: string[];      // ISO, archived_at IS NULL but starts_at < now()
  dealProposedDate: string | null;
  now?: Date;
}): DealUrgency {
  const now = params.now ?? new Date();
  const todayMs = now.getTime();

  const totalShows = params.upcomingEventStartsAt.length + params.pastEventStartsAt.length;
  const hasUpcoming = params.upcomingEventStartsAt.length > 0;
  const hasPastOnly = !hasUpcoming && params.pastEventStartsAt.length > 0;

  // All events are past → suppress (card shouldn't surface stall/advance here)
  if (hasPastOnly) {
    return {
      date: null,
      source: 'event_next',
      isSeries: totalShows > 1,
      totalShows,
      daysOut: null,
      multiplier: 1.0,
      suppress: true,
    };
  }

  let date: string | null = null;
  let source: DealUrgency['source'] = null;

  if (hasUpcoming) {
    date = params.upcomingEventStartsAt[0] ?? null;
    source = 'event_next';
  } else if (params.dealProposedDate) {
    date = params.dealProposedDate;
    source = 'deal_proposed_date';
  }

  let daysOut: number | null = null;
  if (date) {
    const targetMs = new Date(date).getTime();
    if (Number.isFinite(targetMs)) {
      // Ceil so a date later today still reads as "1 day out", not 0.
      daysOut = Math.ceil((targetMs - todayMs) / 86_400_000);
      if (daysOut < 0) daysOut = null; // defensive — shouldn't hit with upcoming filter
    }
  }

  let multiplier = 1.0;
  if (daysOut !== null) {
    if (daysOut > 90) multiplier = 0.8;
    else if (daysOut >= 30) multiplier = 1.0;
    else if (daysOut >= 14) multiplier = 1.2;
    else if (daysOut >= 7) multiplier = 1.5;
    else multiplier = 2.0;
  }

  return {
    date,
    source,
    isSeries: totalShows > 1,
    totalShows,
    daysOut,
    multiplier,
    suppress: false,
  };
}

/**
 * Returns true when the voice paragraph should include a "{N} days out"
 * phrase. Policy: only near-term events surface in copy (days_out <= 30).
 * Far-out events stop being a trigger and become filler.
 */
export function shouldSurfaceDaysOutInVoice(urgency: DealUrgency): boolean {
  return urgency.daysOut !== null && urgency.daysOut <= 30;
}
