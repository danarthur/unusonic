/**
 * Crew profile utilities: completeness scoring, COI status, proficiency display.
 *
 * Used by:
 *   - NetworkCard (entity layer) — completeness pill on person nodes
 *   - ProductionTeamCard / ConfirmedCrewRow (CRM) — completeness pill, COI dot, proficiency chips
 *   - EmployeeEntityForm — COI status dot next to expiry input
 *   - MemberDetailSheet — proficiency label on skill rows
 */

// =============================================================================
// crewCompleteness
// =============================================================================

/**
 * Normalised input — accepts either DealCrewRow shape or NetworkNode.meta shape.
 * All fields are optional so callers can pass a partial subset without casting.
 */
type CrewCompletenessInput = {
  first_name?: string | null;
  phone?: string | null;
  job_title?: string | null;
  skills?: Array<string | { skill_tag: string }>;
  market?: string | null;
  union_status?: string | null;
  w9_status?: boolean | null;
  coi_expiry?: string | null;
};

export type CrewCompletenessLevel = 'incomplete' | 'core' | 'ready' | 'compliant';

/**
 * Score a crew member's profile completeness.
 *
 * Level   │ Gate
 * ───────────────────────────────────────────────────────────
 * incomplete │ Missing name, phone, or job title
 * core       │ Has identity but missing skills, market, or union status
 * ready      │ Has professional context but missing W-9 or valid COI
 * compliant  │ All gates cleared
 */
export function crewCompleteness(input: CrewCompletenessInput): CrewCompletenessLevel {
  const hasName = !!input.first_name?.trim();
  const hasPhone = !!input.phone?.trim();
  const hasJobTitle = !!input.job_title?.trim();
  if (!hasName || !hasPhone || !hasJobTitle) return 'incomplete';

  const hasSkills = (input.skills?.length ?? 0) > 0;
  const hasMarket = !!input.market?.trim();
  const hasUnion = !!input.union_status?.trim();
  if (!hasSkills || !hasMarket || !hasUnion) return 'core';

  const hasW9 = input.w9_status === true;
  const hasValidCoi = !!input.coi_expiry && new Date(input.coi_expiry) > new Date();
  if (!hasW9 || !hasValidCoi) return 'ready';

  return 'compliant';
}

// =============================================================================
// coiStatus
// =============================================================================

export type CoiStatusLevel = 'none' | 'green' | 'amber' | 'red';

/**
 * Derive the traffic-light status for a COI expiry date string.
 *
 * - 'none'  — no expiry date stored
 * - 'red'   — expired (past today)
 * - 'amber' — expires within 30 days
 * - 'green' — valid, more than 30 days out
 *
 * Parses as a local date (YYYY-MM-DD) to avoid UTC midnight shift —
 * a date of "2026-04-01" should read as April 1 in the user's timezone,
 * not as March 31 at 19:00 PDT.
 */
export function coiStatus(expiry: string | null | undefined): CoiStatusLevel {
  if (!expiry) return 'none';
  const parts = expiry.split('-').map(Number);
  const [year, month, day] = parts;
  if (!year || !month || !day) return 'none';
  const expiryDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysOut = new Date(today);
  thirtyDaysOut.setDate(today.getDate() + 30);
  if (expiryDate < today) return 'red';
  if (expiryDate <= thirtyDaysOut) return 'amber';
  return 'green';
}

// =============================================================================
// proficiencyAbbr
// =============================================================================

const PROFICIENCY_ABBR: Record<string, string> = {
  junior: 'J',
  mid: 'M',
  senior: 'S',
  lead: 'L',
};

/**
 * Single-character abbreviation for a proficiency level, for use in
 * space-constrained skill chip contexts (e.g. ConfirmedCrewRow).
 * Returns null when the level is unknown or absent — callers should
 * conditionally render to avoid an orphaned "·" separator.
 */
export function proficiencyAbbr(level: string | null | undefined): string | null {
  if (!level) return null;
  return PROFICIENCY_ABBR[level] ?? null;
}
