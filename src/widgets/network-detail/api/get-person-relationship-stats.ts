/**
 * getPersonRelationshipStats — the canonical read for "who is this person to us."
 *
 * Single source of truth for stats surfaced on the network entity page:
 *   • PromotedMetricsRow  — thin inline row (Shows · Last contact)
 *   • PersonStatsCard     — the role-conditional verdict+tiles card
 *   • PromotedMetricsRow and other consumers should delegate here, not
 *     recompute. See docs/reference/person-stats-card-design.md §5.1, §7.
 *
 * The fetcher returns a typed RelationshipStats object with every input any
 * variant needs. Variants render the subset they care about; no consumer
 * recomputes overlapping numbers in a separate query.
 *
 * Consistency invariants (tested):
 *   1. lastContactAt matches what dormant_client evaluator uses.
 *   2. showsCount / showsLast12MoCount are computed from one aggregation.
 *   3. Earnings-adjacent fields NEVER surface projected rate × hours.
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * The role-conditional layout the UI should render.
 *
 * Derived from the graph — never from a stored `person.kind` field. See
 * docs/reference/person-stats-card-design.md §8.
 *
 * Phase 1 ships `crew` and `unknown` only; the other three variants land in
 * later phases. When a person doesn't fit a shipped variant, the UI falls
 * back to the shared universals.
 */
export type PersonVariantKind = 'crew' | 'client' | 'vendor' | 'employee' | 'unknown';

export type SparklinePoint = {
  /** ISO month start, e.g. '2026-03-01'. Used for tooltip labels. */
  month: string;
  /** Count of shows that started in this month. */
  count: number;
};

export type PersonRelationshipStats = {
  /** Detected variant — drives which tile set the UI renders. */
  variantKind: PersonVariantKind;

  /** Shared universals (rendered on every variant). */
  lastContactAt: string | null;
  /** All-time non-declined crew-assignment count — matches PromotedMetricsRow. */
  showsCountAllTime: number;

  /** Crew-variant fields. Populated for every person, meaningful only when
   *  `variantKind === 'crew'`. */
  crew: {
    /** Shows worked in the last 12 months (confirmed/dispatched, past start). */
    showsLast12MoCount: number;
    /** Last show this person actually worked (past-dated, confirmed). */
    lastWorkedAt: string | null;
    /** Upcoming confirmed/dispatched shows from entity_crew_schedule. */
    activeShowsCount: number;
    /** Default hourly rate from ROSTER_MEMBER/PARTNER edge, null if unset. */
    defaultHourlyRate: number | null;
    /** Accepts in last 12mo (confirmed_at set). */
    acceptsLast12Mo: number;
    /** Total offers in last 12mo (confirmed_at OR declined_at set). */
    offersLast12Mo: number;
    /** Most-frequent department across all assignments, null if no signal. */
    topDepartment: string | null;
    /** 12 months of shows-per-month (oldest first). */
    sparkline: SparklinePoint[];
  };

  /** Client-variant fields. Populated only when the person is a client. */
  client: {
    /** Lifetime collected — SUM(finance.invoices.paid_amount WHERE bill_to = X).
     *  NEVER projected. Only money actually received. */
    lifetimePaid: number;
    /** Total outstanding: SUM(total - paid) across non-void invoices. */
    outstandingBalance: number;
    /** Outstanding amount past due by >30 days (AR aging). */
    arOverdueAmount: number;
    /** Count of deals in in_play + booked bands (not yet past). */
    activeShowsCount: number;
    /** Most recent deal proposed_date or linked event starts_at. */
    lastBookedAt: string | null;
    /** 24 months of bookings-per-month (oldest first). Counts deals by date. */
    sparkline: SparklinePoint[];
  };

  /** Vendor-variant fields. Populated only when the person is a vendor POC. */
  vendor: {
    /** Name of the employer company the vendor role comes from. */
    employerCompanyName: string | null;
    /** Total deals where this person OR their employer company was involved. */
    sharedShowsCount: number;
    /** Most recent shared deal's proposed_date. */
    lastCollabAt: string | null;
    /** Earliest shared deal's proposed_date — "since" read. */
    firstCollabAt: string | null;
    /** Active shared (pre-past) shows — synonym of in_play + booked count. */
    activeSharedCount: number;
    /** 24 months of shared-deals-per-month (oldest first). */
    sparkline: SparklinePoint[];
  };

  /** Employee-variant fields. Populated only when the person is workspace staff.
   *  YTD pay + cert expiries are intentionally OMITTED — both need
   *  infrastructure (actuals-only earnings RPC, compliance_docs table) before
   *  they can ship safely. See design doc §6 and §10 Phase 4. */
  employee: {
    /** Days worked in last 30 days / 30, as a 0–100 percentage. */
    utilizationPct: number;
    /** Past shows worked in last 30 days. */
    worked30dCount: number;
    /** Future confirmed/dispatched shows in next 14 days. */
    upcoming14dCount: number;
    /** Total upcoming non-declined shows (any future horizon). */
    upcomingAllCount: number;
    /** 12 weeks of days-worked-per-week (oldest first). `month` field on each
     *  point is actually the ISO week-start date — reused for simplicity. */
    sparkline: SparklinePoint[];
  };

  /** Aion insight promoted into the verdict sentence — null if none pending. */
  aionInsightText: string | null;
};

export type GetPersonRelationshipStatsResult =
  | { ok: true; stats: PersonRelationshipStats }
  | { ok: false; error: string };

// ── Config ───────────────────────────────────────────────────────────────────

const AFFILIATION_RELATIONSHIP_TYPES = [
  'MEMBER',
  'ROSTER_MEMBER',
  'PARTNER',
  'EMPLOYEE',
  'WORKS_FOR',
  'EMPLOYED_AT',
  'AGENT',
];

/** Person-to-company edges that mean "employed by / member of." */
const EMPLOYER_EDGE_TYPES = [
  'MEMBER',
  'ROSTER_MEMBER',
  'EMPLOYEE',
  'WORKS_FOR',
  'EMPLOYED_AT',
  'AGENT',
];

/** Company-level edges that mean "this company is our external partner." */
const VENDOR_EDGE_TYPES = ['VENDOR', 'PARTNER', 'AGENT'];

/** Status values on ops.deal_crew that count as a working show (non-declined). */
const WORKED_CREW_STATUSES = ['confirmed', 'dispatched', 'assigned'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

function startOfMonthIso(iso: string): string {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10) + 'T00:00:00.000Z';
}

/** Build N month buckets from oldest → current; zero-fill gaps. */
function buildSparkline(dateList: string[], months: number): SparklinePoint[] {
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.set(d.toISOString().slice(0, 10) + 'T00:00:00.000Z', 0);
  }
  for (const iso of dateList) {
    const key = startOfMonthIso(iso);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([month, count]) => ({ month, count }));
}

/** Snap a date to Monday 00:00 UTC (ISO week start). */
function startOfIsoWeekIso(d: Date): string {
  const copy = new Date(d);
  const dow = (copy.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun
  copy.setUTCDate(copy.getUTCDate() - dow);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString();
}

/** Build N week buckets from oldest → current; zero-fill gaps. */
function buildWeeklySparkline(dateList: string[], weeks: number): SparklinePoint[] {
  const now = new Date();
  const thisWeekStart = startOfIsoWeekIso(now);
  const buckets = new Map<string, number>();
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisWeekStart);
    d.setUTCDate(d.getUTCDate() - i * 7);
    buckets.set(d.toISOString(), 0);
  }
  for (const iso of dateList) {
    const key = startOfIsoWeekIso(new Date(iso));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([month, count]) => ({ month, count }));
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function getPersonRelationshipStats(
  workspaceId: string,
  entityId: string,
): Promise<GetPersonRelationshipStatsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  const since12mo = monthsAgoIso(12);
  const since24mo = monthsAgoIso(24);
  const nowIso = new Date().toISOString();
  const thirtyDaysAgoDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Parallelize all independent reads.
  const [
    { count: allTimeCrewCount },
    { data: lastCapture },
    { data: schedRowsRaw },
    { data: dealCrewRows },
    { data: edgeRows },
    { data: aionInsight },
    { data: clientDealRows },
    { data: clientInvoiceRows },
    { data: entityRow },
  ] = await Promise.all([
    // All-time non-declined crew count (matches PromotedMetricsRow semantics).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema not in generated types
    (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('entity_id', entityId)
      .not('status', 'eq', 'declined'),

    // Last confirmed capture (canonical "last contact" signal).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema not in generated types
    (supabase as any)
      .schema('cortex')
      .from('capture_events')
      .select('created_at')
      .eq('workspace_id', workspaceId)
      .eq('resolved_entity_id', entityId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // 12mo of entity_crew_schedule rows (UNION of deal_crew + crew_assignments).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema not in generated types
    (supabase as any)
      .schema('ops')
      .from('entity_crew_schedule')
      .select('starts_at, status, role')
      .eq('workspace_id', workspaceId)
      .eq('entity_id', entityId)
      .gte('starts_at', since12mo)
      .order('starts_at', { ascending: true }),

    // Last 12mo of deal_crew rows for accept/offer ratio + top department.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema not in generated types
    (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .select('confirmed_at, declined_at, department, role_note')
      .eq('workspace_id', workspaceId)
      .eq('entity_id', entityId)
      .gte('created_at', since12mo),

    // Relationship edges — used for variant detection + default rate lookup.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema not in generated types
    (supabase as any)
      .schema('cortex')
      .from('relationships')
      .select('source_entity_id, target_entity_id, relationship_type, context_data')
      .in('relationship_type', AFFILIATION_RELATIONSHIP_TYPES)
      .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`),

    // Highest-priority pending Aion insight about this person — drives the
    // verdict sentence when available. No fresh LLM call per page view.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema not in generated types
    (supabase as any)
      .schema('cortex')
      .from('aion_insights')
      .select('title, priority, status, expires_at')
      .eq('workspace_id', workspaceId)
      .eq('entity_id', entityId)
      .in('status', ['pending', 'surfaced'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Client-side deals: person is either organization_id (person-as-client)
    // or main_contact_id. 24mo window powers the booking sparkline; we also
    // need all-time for the client-variant detection + last-booked date.
    supabase
      .from('deals')
      .select('id, status, proposed_date, event_id, organization_id, main_contact_id, created_at')
      .eq('workspace_id', workspaceId)
      .or(`organization_id.eq.${entityId},main_contact_id.eq.${entityId}`)
      .order('proposed_date', { ascending: false }),

    // Invoices where this person is the bill-to — lifetime paid, outstanding,
    // AR aging. No join through payments needed: paid_amount is denormalized
    // on the invoice row (see finance-schema.md §2.1).
    supabase
      .schema('finance')
      .from('invoices')
      .select('total_amount, paid_amount, status, due_date, paid_at, voided_at')
      .eq('workspace_id', workspaceId)
      .eq('bill_to_entity_id', entityId),

    // Entity row — used for employee detection (claimed_by_user_id bridge).
    supabase
      .schema('directory')
      .from('entities')
      .select('claimed_by_user_id')
      .eq('id', entityId)
      .maybeSingle(),
  ]);

  // ── Crew: sparkline + last-worked + shows_last_12mo from schedule ────────
  const schedRows = (schedRowsRaw ?? []) as { starts_at: string; status: string | null; role: string | null }[];
  const workedRows = schedRows.filter(
    (r) => r.starts_at && WORKED_CREW_STATUSES.includes((r.status ?? '').toLowerCase()) && r.starts_at <= nowIso,
  );
  const crewSparkline = buildSparkline(workedRows.map((r) => r.starts_at), 12);
  const showsLast12MoCount = workedRows.length;
  const lastWorkedAt = workedRows.length > 0
    ? workedRows[workedRows.length - 1].starts_at
    : null;
  const crewActiveShowsCount = schedRows.filter(
    (r) => r.starts_at && r.starts_at > nowIso && (r.status ?? '').toLowerCase() !== 'declined',
  ).length;

  // ── Accepts / offers / top department from deal_crew ─────────────────────
  const crewRows = (dealCrewRows ?? []) as {
    confirmed_at: string | null;
    declined_at: string | null;
    department: string | null;
    role_note: string | null;
  }[];
  const acceptsLast12Mo = crewRows.filter((r) => r.confirmed_at).length;
  const offersLast12Mo = crewRows.filter((r) => r.confirmed_at || r.declined_at).length;

  const deptCounts = new Map<string, number>();
  for (const r of crewRows) {
    const key = r.department ?? r.role_note;
    if (!key) continue;
    deptCounts.set(key, (deptCounts.get(key) ?? 0) + 1);
  }
  const topDepartment = deptCounts.size > 0
    ? Array.from(deptCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  // ── Default rate + variant detection from relationship edges ─────────────
  const edges = (edgeRows ?? []) as {
    source_entity_id: string;
    target_entity_id: string;
    relationship_type: string;
    context_data: Record<string, unknown> | null;
  }[];

  const readRate = (ctx: Record<string, unknown>): number | null => {
    if (typeof ctx.default_hourly_rate === 'number') return ctx.default_hourly_rate;
    if (typeof ctx.day_rate === 'number') return ctx.day_rate;
    return null;
  };
  let defaultHourlyRate: number | null = null;
  for (const e of edges) {
    const rate = readRate(e.context_data ?? {});
    if (rate && rate > 0) {
      defaultHourlyRate = rate;
      break;
    }
  }

  // Employer company IDs — any company the person has an employer edge to.
  const employerCompanyIds = new Set<string>();
  for (const e of edges) {
    if (!EMPLOYER_EDGE_TYPES.includes(e.relationship_type)) continue;
    const other = e.source_entity_id === entityId ? e.target_entity_id : e.source_entity_id;
    if (other && other !== entityId) employerCompanyIds.add(other);
  }

  // ── Vendor: deals touching employer companies ────────────────────────────
  // Mirror of the viaCompanyByDeal path in get-person-productions.ts. Runs
  // only when we have employer companies to query — otherwise zero work.
  let vendorEmployerName: string | null = null;
  const vendorDealsById = new Map<string, {
    id: string;
    status: string | null;
    proposed_date: string | null;
    created_at: string;
  }>();
  if (employerCompanyIds.size > 0) {
    const companyIds = Array.from(employerCompanyIds);
    const [
      { data: companyVendorEdges },
      { data: companyRows },
      { data: companyDeals },
      { data: companyStakeholderRows },
      { data: companyCrewRows },
    ] = await Promise.all([
      // Confirm at least one employer company has a VENDOR/PARTNER/AGENT edge —
      // that's what qualifies the person as a vendor POC (vs. a plain member).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema not in generated types
      (supabase as any)
        .schema('cortex')
        .from('relationships')
        .select('source_entity_id, target_entity_id, relationship_type')
        .in('relationship_type', VENDOR_EDGE_TYPES)
        .or(
          `source_entity_id.in.(${companyIds.join(',')}),target_entity_id.in.(${companyIds.join(',')})`,
        ),

      // Company names — for "via Brandi Jane Events" copy in tiles/verdict.
      supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name, type')
        .in('id', companyIds)
        .eq('type', 'company'),

      // Deals where a company is the client or main contact.
      supabase
        .from('deals')
        .select('id, status, proposed_date, created_at')
        .eq('workspace_id', workspaceId)
        .or(
          `organization_id.in.(${companyIds.join(',')}),main_contact_id.in.(${companyIds.join(',')})`,
        ),

      // Deals where a company is a stakeholder (planner/vendor/bill-to/venue).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema not in generated types
      (supabase as any)
        .schema('ops')
        .from('deal_stakeholders')
        .select('deal_id')
        .in('entity_id', companyIds),

      // Deals where a company is on crew (rare but possible).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema not in generated types
      (supabase as any)
        .schema('ops')
        .from('deal_crew')
        .select('deal_id')
        .eq('workspace_id', workspaceId)
        .in('entity_id', companyIds),
    ]);

    const vendorCompanyIds = new Set<string>();
    for (const row of ((companyVendorEdges ?? []) as {
      source_entity_id: string;
      target_entity_id: string;
    }[])) {
      if (employerCompanyIds.has(row.source_entity_id)) vendorCompanyIds.add(row.source_entity_id);
      if (employerCompanyIds.has(row.target_entity_id)) vendorCompanyIds.add(row.target_entity_id);
    }

    // Pick a display name from the qualifying vendor company, else any employer.
    const companyNames = new Map<string, string>();
    for (const c of ((companyRows ?? []) as { id: string; display_name: string | null }[])) {
      if (c.display_name) companyNames.set(c.id, c.display_name);
    }
    const preferredCompanyId = Array.from(vendorCompanyIds)[0] ?? companyIds[0];
    vendorEmployerName = preferredCompanyId ? companyNames.get(preferredCompanyId) ?? null : null;

    // Collect unique deal rows across all three paths.
    for (const d of ((companyDeals ?? []) as {
      id: string;
      status: string | null;
      proposed_date: string | null;
      created_at: string;
    }[])) {
      if (!vendorDealsById.has(d.id)) vendorDealsById.set(d.id, d);
    }
    const extraIds = new Set<string>();
    for (const s of ((companyStakeholderRows ?? []) as { deal_id: string }[])) {
      if (!vendorDealsById.has(s.deal_id)) extraIds.add(s.deal_id);
    }
    for (const c of ((companyCrewRows ?? []) as { deal_id: string }[])) {
      if (!vendorDealsById.has(c.deal_id)) extraIds.add(c.deal_id);
    }
    if (extraIds.size > 0) {
      const { data: extraDealRows } = await supabase
        .from('deals')
        .select('id, status, proposed_date, created_at')
        .eq('workspace_id', workspaceId)
        .in('id', Array.from(extraIds));
      for (const d of ((extraDealRows ?? []) as {
        id: string;
        status: string | null;
        proposed_date: string | null;
        created_at: string;
      }[])) {
        if (!vendorDealsById.has(d.id)) vendorDealsById.set(d.id, d);
      }
    }

    // If no employer company actually has a vendor-class edge, null out the
    // vendor name so detection below falls back to 'unknown' for this person.
    if (vendorCompanyIds.size === 0) vendorEmployerName = null;
  }

  // ── Employee: detect via claimed user + workspace role ───────────────────
  const claimedUserId = (entityRow as { claimed_by_user_id: string | null } | null)
    ?.claimed_by_user_id ?? null;
  let isEmployee = false;
  if (claimedUserId) {
    // Fetch this user's workspace_members row with the role slug joined.
    // Two-step (member row → role slug) keeps us off cross-schema embeds.
    const { data: memberRow } = await supabase
      .from('workspace_members')
      .select('role_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', claimedUserId)
      .maybeSingle();
    const roleId = (memberRow as { role_id: string | null } | null)?.role_id ?? null;
    if (roleId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cross-schema lookup
      const { data: roleRow } = await (supabase as any)
        .schema('ops')
        .from('workspace_roles')
        .select('slug')
        .eq('id', roleId)
        .maybeSingle();
      isEmployee = (roleRow as { slug: string | null } | null)?.slug === 'employee';
    }
  }

  // ── Employee stats: utilization, worked, upcoming, weekly sparkline ──────
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAheadIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const worked30dList = workedRows
    .map((r) => r.starts_at)
    .filter((s) => s >= thirtyDaysAgoIso);
  const upcoming14dCount = schedRows.filter(
    (r) =>
      r.starts_at &&
      r.starts_at > nowIso &&
      r.starts_at <= fourteenDaysAheadIso &&
      (r.status ?? '').toLowerCase() !== 'declined',
  ).length;
  const upcomingAllCount = crewActiveShowsCount; // same upstream compute
  // Utilization: distinct days worked in last 30 / 30. Using a Set on the
  // calendar-day of starts_at so a two-call day counts once.
  const worked30dDays = new Set(
    worked30dList.map((iso) => iso.slice(0, 10)),
  );
  const utilizationPct = Math.min(100, Math.round((worked30dDays.size / 30) * 100));

  // Weekly sparkline — 12 weeks of distinct days-worked-per-week.
  // We pass the raw starts_at timestamps; the helper snaps each to its ISO
  // week. Distinct days per week is "close enough" for a sparkline signal.
  const employeeSparkline = buildWeeklySparkline(
    workedRows
      .map((r) => r.starts_at)
      .filter((iso) => {
        const twelveWeeksAgoMs = Date.now() - 12 * 7 * 24 * 60 * 60 * 1000;
        return new Date(iso).getTime() >= twelveWeeksAgoMs;
      }),
    12,
  );

  const vendorDeals = Array.from(vendorDealsById.values());
  const vendorSharedShowsCount = vendorDeals.length;
  const vendorActiveSharedCount = vendorDeals.filter((d) => {
    if (d.status === 'lost') return false;
    if (!d.proposed_date) return true;
    return d.proposed_date >= nowIso.slice(0, 10);
  }).length;
  const vendorDates = vendorDeals
    .map((d) => d.proposed_date)
    .filter((s): s is string => s !== null)
    .sort();
  const vendorLastCollabAt = vendorDates.length > 0 ? vendorDates[vendorDates.length - 1] : null;
  const vendorFirstCollabAt = vendorDates.length > 0 ? vendorDates[0] : null;
  const vendorSparkline = buildSparkline(
    vendorDeals.map((d) => d.created_at).filter((s) => s >= since24mo),
    24,
  );

  // ── Client: deals + invoice rollups ──────────────────────────────────────
  const clientDeals = (clientDealRows ?? []) as {
    id: string;
    status: string | null;
    proposed_date: string | null;
    event_id: string | null;
    organization_id: string | null;
    main_contact_id: string | null;
    created_at: string;
  }[];
  const invoices = (clientInvoiceRows ?? []) as {
    total_amount: number | null;
    paid_amount: number | null;
    status: string | null;
    due_date: string | null;
    paid_at: string | null;
    voided_at: string | null;
  }[];

  let lifetimePaid = 0;
  let outstandingBalance = 0;
  let arOverdueAmount = 0;
  for (const inv of invoices) {
    if (inv.voided_at) continue;
    const total = Number(inv.total_amount ?? 0);
    const paid = Number(inv.paid_amount ?? 0);
    lifetimePaid += paid;
    const remaining = Math.max(0, total - paid);
    if (remaining > 0) {
      outstandingBalance += remaining;
      if (inv.due_date && inv.due_date < thirtyDaysAgoDate) {
        arOverdueAmount += remaining;
      }
    }
  }

  // Booking cadence: count deals by when they were *created* (not event date).
  // Sales rhythm beats event rhythm for this signal — a client who booked
  // three weddings this spring shows as three spring bars, even if the events
  // are months away.
  const clientBookingDates = clientDeals
    .map((d) => d.created_at)
    .filter((s): s is string => s !== null && s >= since24mo);
  const clientSparkline = buildSparkline(clientBookingDates, 24);

  // Active deals = pre-past bands (in_play + booked). Mirror the band logic
  // in get-person-productions.ts but simplified: any deal that is not 'lost'
  // AND whose proposed_date is future OR null counts as active.
  const clientActiveShowsCount = clientDeals.filter((d) => {
    if (d.status === 'lost') return false;
    if (!d.proposed_date) return true; // no date yet → pre-contract, in play
    return d.proposed_date >= nowIso.slice(0, 10);
  }).length;

  const lastBookedAt = clientDeals.length > 0
    ? clientDeals[0].proposed_date // query already sorted desc
    : null;

  // ── Variant detection (priority order per design §8) ─────────────────────
  //   1. employee — claimed user + workspace role 'employee' (owner's staff)
  //   2. crew     — has any non-declined deal_crew row
  //   3. client   — has client-side deal OR has an invoice
  //   4. vendor   — affiliated with a company that has a vendor-class edge
  //   5. unknown  — everything else
  //
  // Employee wins over crew because an in-house crew member is viewed through
  // the admin lens (utilization, payroll) — not the freelancer lens (rate,
  // decline rate).
  let variantKind: PersonVariantKind;
  if (isEmployee) {
    variantKind = 'employee';
  } else if ((allTimeCrewCount ?? 0) > 0) {
    variantKind = 'crew';
  } else if (clientDeals.length > 0 || invoices.length > 0) {
    variantKind = 'client';
  } else if (vendorEmployerName !== null) {
    variantKind = 'vendor';
  } else {
    variantKind = 'unknown';
  }

  // ── Compose ──────────────────────────────────────────────────────────────
  return {
    ok: true,
    stats: {
      variantKind,
      lastContactAt:
        (lastCapture as { created_at: string } | null)?.created_at ?? null,
      showsCountAllTime: (allTimeCrewCount as number | null) ?? 0,
      crew: {
        showsLast12MoCount,
        lastWorkedAt,
        activeShowsCount: crewActiveShowsCount,
        defaultHourlyRate,
        acceptsLast12Mo,
        offersLast12Mo,
        topDepartment,
        sparkline: crewSparkline,
      },
      client: {
        lifetimePaid,
        outstandingBalance,
        arOverdueAmount,
        activeShowsCount: clientActiveShowsCount,
        lastBookedAt,
        sparkline: clientSparkline,
      },
      vendor: {
        employerCompanyName: vendorEmployerName,
        sharedShowsCount: vendorSharedShowsCount,
        lastCollabAt: vendorLastCollabAt,
        firstCollabAt: vendorFirstCollabAt,
        activeSharedCount: vendorActiveSharedCount,
        sparkline: vendorSparkline,
      },
      employee: {
        utilizationPct,
        worked30dCount: worked30dDays.size,
        upcoming14dCount,
        upcomingAllCount,
        sparkline: employeeSparkline,
      },
      aionInsightText: (aionInsight as { title: string } | null)?.title ?? null,
    },
  };
}
