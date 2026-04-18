import { z } from 'zod';
import { SeriesRuleSchema, SERIES_ARCHETYPES } from '@/shared/lib/series-rule';
import { eventArchetypeSlugSchema } from '@/shared/lib/event-archetype';

/**
 * Legacy archetype slugs. Retained for (a) fallback label rendering when the
 * workspace archetype table is unavailable, (b) seed data in tests / fixtures.
 * After the 2026-04-18 workspace-event-types feature these live as is_system
 * rows in ops.workspace_event_archetypes; owners can extend with any custom
 * slug via the EventTypeCombobox.
 */
export const DEAL_ARCHETYPES = [
  'wedding',
  'corporate_gala',
  'product_launch',
  'private_dinner',
  'concert',
  'festival',
  'awards_show',
  'conference',
  'birthday',
  'charity_gala',
] as const;

export type DealArchetype = typeof DEAL_ARCHETYPES[number];

export const DEAL_ARCHETYPE_LABELS: Record<DealArchetype, string> = {
  wedding: 'Wedding',
  corporate_gala: 'Corporate gala',
  product_launch: 'Product launch',
  private_dinner: 'Private dinner',
  concert: 'Concert',
  festival: 'Festival',
  awards_show: 'Awards show',
  conference: 'Conference',
  birthday: 'Birthday',
  charity_gala: 'Charity gala',
};

/**
 * P0 client-field redesign: a deal is created with a *cast* of stakeholders.
 * The UI translates its Q1/Q2 answers into this shape, the server action
 * forwards it to public.create_deal_complete (which is the only writer).
 *
 * - hostKind = 'individual' → 1 person host
 * - hostKind = 'couple'     → 2 person hosts (CO_HOST edge auto-written)
 * - hostKind = 'company'    → 1 company host
 * - hostKind = 'venue_concert' → 1 host (company OR person — performer playing
 *   a venue/promoter contract). Ships as 'company' shape; venue itself is
 *   captured separately in venueId/venueName.
 */
export const HOST_KINDS = ['individual', 'couple', 'company', 'venue_concert'] as const;
export type HostKind = (typeof HOST_KINDS)[number];

const personHostSchema = z.object({
  existingId: z.string().uuid().optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
});
export type PersonHostInput = z.infer<typeof personHostSchema>;

const companyHostSchema = z.object({
  existingId: z.string().uuid().optional(),
  name: z.string().max(300).optional(),
  /** Optional contact-person ghost id (legacy mainContactId path). */
  mainContactId: z.string().uuid().nullable().optional(),
});
export type CompanyHostInput = z.infer<typeof companyHostSchema>;

const pocSchema = z.object({
  /** When set, POC reuses an existing entity (e.g. one of the hosts). */
  existingId: z.string().uuid().optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
});
export type PocInput = z.infer<typeof pocSchema>;

const plannerSchema = z.object({
  existingId: z.string().uuid().optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  email: z.string().email().nullable().optional(),
});
export type PlannerInput = z.infer<typeof plannerSchema>;

/**
 * Date shape for a new deal — one of three:
 *   - single:    one show, proposedDate carries the day
 *   - multi_day: contiguous envelope (Fri–Sun), proposedEndDate required
 *   - series:    N independent shows sharing a contract (residency, tour, run)
 *
 * The UI's Stage 1 three-tab control selects dateKind; the server action
 * translates this into the RPC's (p_date_kind, p_date) pair.
 */
export const DATE_KINDS = ['single', 'multi_day', 'series'] as const;
export type DateKind = (typeof DATE_KINDS)[number];

export const createDealSchema = z.object({
  proposedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be yyyy-MM-dd'),
  /** When dateKind = 'multi_day', the inclusive end date (yyyy-MM-dd, >= proposedDate). */
  proposedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** Date shape. Defaults to 'single'. 'series' requires `seriesRule`. */
  dateKind: z.enum(DATE_KINDS).default('single'),
  /** Required when dateKind = 'series'. rdates is the authoritative list. */
  seriesRule: SeriesRuleSchema.nullable().optional(),
  /** Optional archetype label for series (residency/tour/run/weekend/custom). */
  seriesArchetype: z.enum(SERIES_ARCHETYPES).nullable().optional(),
  /**
   * Event archetype slug. Not bounded to the legacy enum any more — may be a
   * system slug (`wedding`, `concert`, ...) OR a workspace-custom slug minted
   * via `upsert_workspace_event_archetype` through the EventTypeCombobox.
   */
  eventArchetype: eventArchetypeSlugSchema.nullable().optional(),
  title: z.string().max(500).nullable().optional(),

  // ── Host cast ───────────────────────────────────────────────────────────
  hostKind: z.enum(HOST_KINDS),
  /** When hostKind = 'couple', exactly 2 entries; otherwise 1. */
  personHosts: z.array(personHostSchema).optional(),
  /** When hostKind = 'company' or 'venue_concert', a single entry. */
  companyHost: companyHostSchema.optional(),
  /** Couple pairing — only meaningful when hostKind = 'couple'. */
  pairing: z.enum(['romantic', 'co_host', 'family']).default('romantic'),
  /** Couple display name (auto-derived if absent). */
  coupleDisplayName: z.string().max(300).nullable().optional(),

  // ── Point of contact ────────────────────────────────────────────────────
  /** When set, identifies which host is the day_of_poc by display_order (1-based). */
  pocFromHostIndex: z.number().int().min(1).nullable().optional(),
  /** Otherwise, an independent person becomes day_of_poc. */
  poc: pocSchema.optional(),

  // ── Additive planner ────────────────────────────────────────────────────
  /** Independent of POC. Hidden by UX when POC is already a planner. */
  planner: plannerSchema.optional(),

  status: z.enum(['inquiry', 'proposal', 'contract_sent', 'won', 'lost']).default('inquiry'),
  budgetEstimated: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  venueId: z.string().uuid().nullable().optional(),
  venueName: z.string().max(300).nullable().optional(),

  /** How this inquiry arrived (legacy text enum). */
  leadSource: z.enum(['referral', 'repeat_client', 'website', 'social', 'direct']).nullable().optional(),
  leadSourceId: z.string().uuid().nullable().optional(),
  leadSourceDetail: z.string().max(500).nullable().optional(),
  referrerEntityId: z.string().uuid().nullable().optional(),

  /** Event start / end in HH:MM. */
  eventStartTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  eventEndTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

// Use z.input so callers can omit fields that have schema-level defaults
// (status, pairing). Without this the inferred type requires every defaulted
// field, defeating the purpose of providing defaults.
export type CreateDealInput = z.input<typeof createDealSchema>;
export type CreateDealResult =
  | { success: true; dealId: string; warning?: 'approaching_show_limit' }
  | { success: false; error: string }
  | { success: false; error: 'show_limit_reached'; current: number; limit: number | null };
