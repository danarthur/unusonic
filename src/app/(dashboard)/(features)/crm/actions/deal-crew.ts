'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

// =============================================================================
// Types
// =============================================================================

export type DealCrewSkill = {
  id: string;
  skill_tag: string;
  proficiency: string | null;
  hourly_rate: number | null;
  verified: boolean;
};

export type DealCrewRow = {
  id: string;
  deal_id: string;
  /** null for role-only rows (e.g. "DJ" slot from a catalog item with no named person) */
  entity_id: string | null;
  role_note: string | null;
  source: 'manual' | 'proposal';
  catalog_item_id: string | null;
  confirmed_at: string | null;
  created_at: string;
  // Resolved entity identity
  entity_name: string | null;
  entity_type: string | null;
  avatar_url: string | null;
  is_ghost: boolean;
  // Person attribute fields (null for open role slots)
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  phone: string | null;
  market: string | null;
  union_status: string | null;
  w9_status: boolean;
  coi_expiry: string | null;
  // Roster edge context (null if person is not on workspace roster)
  employment_status: 'internal_employee' | 'external_contractor' | null;
  roster_rel_id: string | null;
  // Skills
  skills: DealCrewSkill[];
  // Contact
  email: string | null;
  // Package reference
  package_name: string | null;
  // Ops dispatch fields (Phase A — used by Plan tab)
  dispatch_status: 'standby' | 'en_route' | 'on_site' | 'wrapped' | null;
  call_time: string | null;
  call_time_slot_id: string | null;
  arrival_location: string | null;
  day_rate: number | null;
  crew_notes: string | null;
  // Department grouping + confirmation
  department: string | null;
  declined_at: string | null;
};

// =============================================================================
// Internal: syncDealCrewFromProposal
// Diffs proposal line item assignees against existing deal_crew rows.
// - Inserts new unconfirmed rows for newly linked assignees.
// - Deletes stale UNCONFIRMED rows whose package is no longer in the proposal.
// - Never deletes confirmed rows.
// =============================================================================

async function syncDealCrewFromProposal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealId: string,
  workspaceId: string,
): Promise<void> {
  try {
    // Get the most recent non-draft proposal for this deal
    const { data: proposal } = await supabase
      .from('proposals')
      .select('id')
      .eq('deal_id', dealId)
      .neq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!proposal) return;

    // Get all proposal items — package reference lives in origin_package_id
    const { data: proposalItems } = await supabase
      .from('proposal_items')
      .select('id, origin_package_id')
      .eq('proposal_id', proposal.id)
      .not('origin_package_id', 'is', null);

    const packageIds = [...new Set((proposalItems ?? []).map((i: { origin_package_id: string | null }) => i.origin_package_id).filter(Boolean) as string[])];

    if (packageIds.length === 0) {
      // No packages — clean up any stale unconfirmed proposal rows
       
      await (supabase as any)
        .schema('ops')
        .from('deal_crew')
        .delete()
        .eq('deal_id', dealId)
        .eq('source', 'proposal')
        .is('confirmed_at', null);
      return;
    }

    // Resolve all package IDs to fetch assignees for — includes bundle ingredient IDs
    const allPackageIds = new Set(packageIds);

    // For bundle packages, also collect their ingredient package IDs
    const { data: bundlePkgs } = await supabase
      .from('packages')
      .select('id, definition, category')
      .in('id', packageIds)
      .eq('category', 'package');

    for (const bundle of (bundlePkgs ?? []) as { id: string; definition: unknown }[]) {
      const def = bundle.definition as { blocks?: { type: string; catalogId?: string }[] } | null;
      for (const block of def?.blocks ?? []) {
        if (block.type === 'line_item' && block.catalogId) {
          allPackageIds.add(block.catalogId);
        }
      }
    }

    // Fetch all assignees via RPC (catalog schema not PostgREST-exposed)
    const assigneeRows: { entity_id: string | null; role_note: string | null; package_id: string }[] = [];
    for (const pkgId of allPackageIds) {
      const { data } = await supabase.rpc('get_catalog_item_assignees', { p_package_id: pkgId });
      if (data) {
        for (const row of data as { id: string; package_id: string; entity_id: string | null; role_note: string | null }[]) {
          assigneeRows.push({ entity_id: row.entity_id, role_note: row.role_note, package_id: row.package_id });
        }
      }
    }

    // Also read required_roles from package definitions (e.g. DJ service with role: "DJ")
    const { data: allPkgs } = await supabase
      .from('packages')
      .select('id, definition')
      .in('id', [...allPackageIds]);
    for (const pkg of (allPkgs ?? []) as { id: string; definition: unknown }[]) {
      const def = pkg.definition as { required_roles?: { role?: string; entity_id?: string | null; quantity?: number }[] } | null;
      for (const r of def?.required_roles ?? []) {
        if (r.role) {
          const qty = r.quantity ?? 1;
          for (let i = 0; i < qty; i++) {
            assigneeRows.push({ entity_id: r.entity_id ?? null, role_note: r.role, package_id: pkg.id });
          }
        }
      }
    }

    // Fetch existing deal_crew rows
     
    const { data: existingCrew } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .select('id, entity_id, role_note, catalog_item_id, confirmed_at, source')
      .eq('deal_id', dealId);

    type ExistingRow = { id: string; entity_id: string | null; role_note: string | null; catalog_item_id: string | null; confirmed_at: string | null; source: string };
    const existing: ExistingRow[] = existingCrew ?? [];
    const existingEntityIds = new Set(existing.filter((r) => r.entity_id).map((r) => r.entity_id as string));
    // Collect role_notes from ALL rows — an assigned row (entity_id set) still
    // "covers" that role; re-inserting an empty slot would duplicate it.
    const existingRoleNotes = new Set(existing.filter((r) => r.role_note).map((r) => r.role_note as string));

    type AssigneeRow = { entity_id: string | null; role_note: string | null; package_id: string };
    const allAssignees: AssigneeRow[] = assigneeRows;

    // Named-person rows: entity_id present, not already in deal_crew
    const namedToInsert = allAssignees.filter(
      (a): a is AssigneeRow & { entity_id: string } => a.entity_id != null && !existingEntityIds.has(a.entity_id)
    );

    // Role-only rows: entity_id null, role_note not already in deal_crew
    const roleToInsert = allAssignees.filter(
      (a) => a.entity_id == null && a.role_note != null && !existingRoleNotes.has(a.role_note)
    );

    const toInsert = [
      ...namedToInsert.map((a) => ({
        deal_id: dealId,
        workspace_id: workspaceId,
        entity_id: a.entity_id,
        role_note: a.role_note ?? null,
        source: 'proposal' as const,
        catalog_item_id: a.package_id,
        confirmed_at: null,
      })),
      ...roleToInsert.map((a) => ({
        deal_id: dealId,
        workspace_id: workspaceId,
        entity_id: null,
        role_note: a.role_note,
        source: 'proposal' as const,
        catalog_item_id: a.package_id,
        confirmed_at: null,
      })),
    ];

    if (toInsert.length > 0) {
       
      await (supabase as any)
        .schema('ops')
        .from('deal_crew')
        .insert(toInsert, { ignoreDuplicates: true });
    }

    // Delete stale unconfirmed proposal rows whose package is no longer in the proposal.
    // Must use allPackageIds (includes bundle ingredient IDs) — ingredient crew rows
    // have catalog_item_id set to the ingredient's ID, not the bundle's top-level ID.
    const activePackageIdSet = new Set(allPackageIds);
    const staleIds = existing
      .filter((r) => r.source === 'proposal' && r.confirmed_at === null && r.catalog_item_id && !activePackageIdSet.has(r.catalog_item_id))
      .map((r) => r.id);

    if (staleIds.length > 0) {
       
      await (supabase as any)
        .schema('ops')
        .from('deal_crew')
        .delete()
        .in('id', staleIds);
    }
  } catch {
    // Non-fatal — sync failure should not break the card load
  }
}

// =============================================================================
// syncCrewFromProposal — public sync-only action (no full crew fetch)
// Call after saving a proposal to keep deal_crew in sync.
// =============================================================================

export async function syncCrewFromProposal(dealId: string): Promise<void> {
  const parsed = z.string().uuid().safeParse(dealId);
  if (!parsed.success) return;

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return;

  try {
    const supabase = await createClient();
    await syncDealCrewFromProposal(supabase, dealId, workspaceId);
  } catch (err) {
    console.error('[syncCrewFromProposal] Failed:', err);
  }
}

// =============================================================================
// getDealCrew — public action; runs sync then returns full crew list
// =============================================================================

export async function getDealCrew(dealId: string): Promise<DealCrewRow[]> {
  const parsed = z.string().uuid().safeParse(dealId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();

    // Sync suggestions from proposal before fetching
    await syncDealCrewFromProposal(supabase, dealId, workspaceId);

    const { data, error } = await supabase.rpc('get_deal_crew_enriched', {
      p_deal_id: dealId,
      p_workspace_id: workspaceId,
    });

    if (error || !data) return [];

    // RPC returns a JSONB array — PostgREST may return it as a single object or array
    const rows = Array.isArray(data) ? data : [data];

    // Fetch emails from directory.entities separately (RPC doesn't return email)
    const entityIds = (rows as Record<string, unknown>[])
      .map((r) => r.entity_id as string | null)
      .filter((id): id is string => !!id);

    const emailMap = new Map<string, string | null>();
    if (entityIds.length > 0) {
      const { data: entities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, type, attributes')
        .in('id', entityIds);
      for (const e of (entities ?? []) as { id: string; type: string | null; attributes: unknown }[]) {
        const t = e.type ?? 'person';
        let email: string | null = null;
        if (t === 'person') {
          email = readEntityAttrs(e.attributes, 'person').email ?? null;
        } else if (t === 'individual') {
          email = readEntityAttrs(e.attributes, 'individual').email ?? null;
        } else if (t === 'company') {
          email = readEntityAttrs(e.attributes, 'company').support_email ?? null;
        }
        emailMap.set(e.id, email);
      }
    }

    return (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      deal_id: r.deal_id as string,
      entity_id: (r.entity_id as string | null) ?? null,
      role_note: (r.role_note as string | null) ?? null,
      source: r.source as 'manual' | 'proposal',
      catalog_item_id: (r.catalog_item_id as string | null) ?? null,
      confirmed_at: (r.confirmed_at as string | null) ?? null,
      created_at: r.created_at as string,
      entity_name: (r.entity_name as string | null) ?? null,
      entity_type: (r.entity_type as string | null) ?? null,
      avatar_url: (r.avatar_url as string | null) ?? null,
      is_ghost: Boolean(r.is_ghost),
      first_name: (r.first_name as string | null) ?? null,
      last_name: (r.last_name as string | null) ?? null,
      job_title: (r.job_title as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      market: (r.market as string | null) ?? null,
      union_status: (r.union_status as string | null) ?? null,
      w9_status: Boolean(r.w9_status),
      coi_expiry: (r.coi_expiry as string | null) ?? null,
      employment_status: (r.employment_status as 'internal_employee' | 'external_contractor' | null) ?? null,
      roster_rel_id: (r.roster_rel_id as string | null) ?? null,
      skills: Array.isArray(r.skills)
        ? (r.skills as Record<string, unknown>[]).map((s) => ({
            id: s.id as string,
            skill_tag: s.skill_tag as string,
            proficiency: (s.proficiency as string | null) ?? null,
            hourly_rate: (s.hourly_rate as number | null) ?? null,
            verified: Boolean(s.verified),
          }))
        : [],
      email: r.entity_id ? (emailMap.get(r.entity_id as string) ?? null) : null,
      package_name: (r.package_name as string | null) ?? null,
      dispatch_status: (r.dispatch_status as DealCrewRow['dispatch_status']) ?? null,
      call_time: (r.call_time as string | null) ?? null,
      call_time_slot_id: (r.call_time_slot_id as string | null) ?? null,
      arrival_location: (r.arrival_location as string | null) ?? null,
      day_rate: r.day_rate != null ? Number(r.day_rate) : null,
      crew_notes: (r.notes as string | null) ?? null,
      department: (r.department as string | null) ?? null,
      declined_at: (r.declined_at as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

// =============================================================================
// addManualDealCrew
// Assigns a person to the deal crew. They are NOT confirmed — confirmation
// happens when the crew member accepts the assignment. ON CONFLICT upgrades
// an existing suggestion to manual-assigned rather than erroring.
// =============================================================================

export async function addManualDealCrew(
  dealId: string,
  entityId: string,
  roleNote?: string,
): Promise<{ success: true; id: string; conflict?: string } | { success: false; error: string }> {
  const parsed = z.object({ dealId: z.string().uuid(), entityId: z.string().uuid() }).safeParse({ dealId, entityId });
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  try {
    const supabase = await createClient();

    // Check for scheduling conflicts before assigning
    const conflict = await checkCrewConflict(supabase, dealId, entityId, workspaceId);

    const { data, error } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .upsert(
        {
          deal_id: dealId,
          workspace_id: workspaceId,
          entity_id: entityId,
          role_note: roleNote ?? null,
          source: 'manual',
          // Do NOT set confirmed_at — crew must confirm availability
        },
        { onConflict: 'deal_id,entity_id' }
      )
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, id: (data as { id: string }).id, conflict: conflict ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// =============================================================================
// confirmDealCrew — promotes a suggestion to confirmed crew
// =============================================================================

export async function confirmDealCrew(
  dealCrewRowId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = z.string().uuid().safeParse(dealCrewRowId);
  if (!parsed.success) return { success: false, error: 'Invalid ID' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  try {
    const supabase = await createClient();

    const { error, count } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .update({ confirmed_at: new Date().toISOString() }, { count: 'exact' })
      .eq('id', dealCrewRowId)
      .eq('workspace_id', workspaceId)
      .is('confirmed_at', null);

    if (error) return { success: false, error: error.message };
    if (count === 0) return { success: false, error: 'Already confirmed or not found' };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// =============================================================================
// removeDealCrew
// =============================================================================

export async function removeDealCrew(
  dealCrewRowId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = z.string().uuid().safeParse(dealCrewRowId);
  if (!parsed.success) return { success: false, error: 'Invalid ID' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  try {
    const supabase = await createClient();

    const { error, count } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .delete({ count: 'exact' })
      .eq('id', dealCrewRowId)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };
    if (count === 0) return { success: false, error: 'Not found' };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// =============================================================================
// addManualOpenRole — creates a role-only slot with no named person
// =============================================================================

export async function addManualOpenRole(
  dealId: string,
  roleNote: string,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const parsed = z.object({
    dealId: z.string().uuid(),
    roleNote: z.string().min(1).max(100),
  }).safeParse({ dealId, roleNote });
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  try {
    const supabase = await createClient();
     
    const { data, error } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .insert({
        deal_id: dealId,
        workspace_id: workspaceId,
        entity_id: null,
        role_note: roleNote.trim(),
        source: 'manual',
        confirmed_at: null,
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, id: (data as { id: string }).id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// =============================================================================
// assignDealCrewEntity — fills an open role slot with a named entity
// Sets entity_id on the row but does NOT confirm. Confirmation happens when
// the crew member accepts the assignment.
// The row must belong to the caller's active workspace (verified via deal join).
// =============================================================================

export async function assignDealCrewEntity(
  dealCrewRowId: string,
  entityId: string,
): Promise<{ success: true; conflict?: string } | { success: false; error: string }> {
  const parsed = z.object({
    dealCrewRowId: z.string().uuid(),
    entityId: z.string().uuid(),
  }).safeParse({ dealCrewRowId, entityId });
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  try {
    const supabase = await createClient();

    // Verify the row belongs to a deal in the caller's workspace before mutating.
     
    const { data: row } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .select('id, deal_id, workspace_id')
      .eq('id', dealCrewRowId)
      .single();

    if (!row || row.workspace_id !== workspaceId) {
      return { success: false, error: 'Not authorised' };
    }

    // Check for scheduling conflicts
    const conflict = await checkCrewConflict(supabase, row.deal_id, entityId, workspaceId);

     
    const { error, count } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .update(
        { entity_id: entityId },
        { count: 'exact' },
      )
      .eq('id', dealCrewRowId)
      .is('entity_id', null); // only fills truly open slots; won't overwrite assigned rows

    if (error) return { success: false, error: error.message };
    if (count === 0) return { success: false, error: 'Slot already filled or not found' };
    return { success: true, conflict: conflict ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// =============================================================================
// checkCrewConflict — checks if entity is already assigned to another deal/event
// on the same date. Returns a warning string or null.
// =============================================================================

async function checkCrewConflict(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealId: string,
  entityId: string,
  workspaceId: string,
): Promise<string | null> {
  try {
    // Get the deal's proposed date
    const { data: deal } = await supabase
      .from('deals')
      .select('proposed_date')
      .eq('id', dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    const proposedDate = (deal as { proposed_date?: string | null } | null)?.proposed_date;
    if (!proposedDate) return null;

    // Check other deal_crew assignments on the same date (excluding this deal), scoped to workspace
    const { data: otherDealCrew } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .select('deal_id')
      .eq('entity_id', entityId)
      .eq('workspace_id', workspaceId)
      .neq('deal_id', dealId);

    if (!otherDealCrew?.length) {
      // Also check ops.events for same-day events with this entity in crew
      const dayStart = `${proposedDate}T00:00:00.000Z`;
      const dayEnd = `${proposedDate}T23:59:59.999Z`;

      const { data: events } = await (supabase as any)
        .schema('ops')
        .from('events')
        .select('id, title, starts_at')
        .eq('workspace_id', workspaceId)
        .gte('starts_at', dayStart)
        .lte('starts_at', dayEnd);

      if (events?.length) {
        for (const evt of events as { id: string; title: string | null }[]) {
          const { count } = await (supabase as any)
            .schema('ops')
            .from('crew_assignments')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', evt.id)
            .eq('entity_id', entityId);
          if (count && count > 0) {
            return `Already assigned to "${evt.title ?? 'an event'}" on this date`;
          }
        }
      }
      return null;
    }

    // Check if any of those other deals are on the same date
    const otherDealIds = (otherDealCrew as { deal_id: string }[]).map((r) => r.deal_id);
    const { data: conflictingDeals } = await supabase
      .from('deals')
      .select('id, title, proposed_date')
      .in('id', otherDealIds)
      .eq('proposed_date', proposedDate)
      .eq('workspace_id', workspaceId)
      .is('archived_at', null);

    if (conflictingDeals?.length) {
      const d = conflictingDeals[0] as { title?: string | null };
      return `Already on "${d.title ?? 'another deal'}" on this date`;
    }

    return null;
  } catch {
    return null; // Non-fatal — don't block assignment on conflict check failure
  }
}

// =============================================================================
// searchCrewMembers
// Crew-specific search: surfaces ROSTER_MEMBER person entities first ("Your team"),
// then falls back to the broader workspace entity graph ("Network").
//
// Use this for the "Add crew" picker in ProductionTeamCard.
// Do NOT use searchNetworkOrgs for crew — it excludes ROSTER_MEMBER entities.
// =============================================================================

export type CrewSearchResult = {
  entity_id: string;
  name: string;
  job_title: string | null;
  avatar_url: string | null;
  is_ghost: boolean;
  employment_status: 'internal_employee' | 'external_contractor' | null;
  skills: string[];        // denormalized tag array for display only
  _section: 'team' | 'network';
};

/**
 * Crew-specific search: surfaces ROSTER_MEMBER person entities first ("Your team"),
 * then falls back to the broader workspace entity graph ("Network").
 *
 * Use this for the "Add crew" picker in ProductionTeamCard.
 * Do NOT use searchNetworkOrgs for crew — it excludes ROSTER_MEMBER entities.
 */
export async function searchCrewMembers(
  orgId: string,
  query: string,
  /** When set, returns crew whose job_title or skills match this role — even if query is empty. */
  roleFilter?: string | null,
): Promise<CrewSearchResult[]> {
  const parsed = z.object({
    orgId: z.string().uuid(),
    query: z.string().max(200),
  }).safeParse({ orgId, query });
  if (!parsed.success) return [];
  const hasRoleFilter = !!roleFilter?.trim();

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const q = query.trim();
  const roleLower = roleFilter?.trim().toLowerCase() ?? '';
  // When no text query and no role filter, nothing to search
  if (!q && !hasRoleFilter) return [];

  // ── 1. Resolve the workspace's company entity ────────────────────────────
  const { data: orgEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('legacy_org_id', orgId)
    .maybeSingle();
  if (!orgEnt?.id) return [];

  // ── 2. Team: ROSTER_MEMBER edges targeting the org entity ────────────────
  const { data: rosterRels } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, context_data')
    .eq('target_entity_id', orgEnt.id)
    .eq('relationship_type', 'ROSTER_MEMBER');

  const activeRosterRels = (rosterRels ?? []).filter(
    (r) => !(r.context_data as Record<string, unknown>)?.deleted_at
  );
  const rosterEntityIds = activeRosterRels.map((r) => r.source_entity_id);
  const rosterCtxById = new Map(activeRosterRels.map((r) => [r.source_entity_id, r.context_data as Record<string, unknown>]));

  let teamResults: CrewSearchResult[] = [];
  // rosterUserIds: claimed_by_user_id for every roster member, used to deduplicate
  // network results (a user may have multiple directory entities with different names).
  const rosterUserIds = new Set<string>();

  // Fetch crew skills from ops.crew_skills (source of truth) — keyed by entity_id
  const crewSkillsByEntityId = new Map<string, string[]>();
  if (rosterEntityIds.length > 0) {
    // Fetch roster entities and crew skills in parallel
    const [rosterEntResult, crewSkillsResult] = await Promise.all([
      supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name, avatar_url, attributes, claimed_by_user_id')
        .in('id', rosterEntityIds),
      supabase
        .schema('ops')
        .from('crew_skills')
        .select('entity_id, skill_tag')
        .in('entity_id', rosterEntityIds)
        .eq('workspace_id', workspaceId),
    ]);

    const allRosterEntities = rosterEntResult.data ?? [];

    for (const row of crewSkillsResult.data ?? []) {
      const list = crewSkillsByEntityId.get(row.entity_id) ?? [];
      list.push(row.skill_tag);
      crewSkillsByEntityId.set(row.entity_id, list);
    }

    for (const e of allRosterEntities) {
      if (e.claimed_by_user_id) rosterUserIds.add(e.claimed_by_user_id);
    }

    const qLower = q.toLowerCase();

    const teamEntities = allRosterEntities.filter((e) => {
      const ctx = rosterCtxById.get(e.id) ?? {};
      const jobTitle = ((ctx.job_title as string | null) ?? '').toLowerCase();
      const skills = (crewSkillsByEntityId.get(e.id) ?? []).map((s) => s.toLowerCase());

      // Role filter: match skills only — title is org identity, skills qualify for event roles
      if (hasRoleFilter) {
        const roleMatch = skills.some((s) => s.includes(roleLower) || roleLower.includes(s));
        if (q) {
          return roleMatch && (e.display_name?.toLowerCase().includes(qLower) ?? false);
        }
        return roleMatch;
      }
      // Text query only: name match
      return e.display_name?.toLowerCase().includes(qLower) ?? false;
    });

    teamResults = teamEntities.map((e) => {
      const attrs = readEntityAttrs(e.attributes, 'person');
      const ctx = rosterCtxById.get(e.id) ?? {};
      const name =
        [attrs.first_name, attrs.last_name].filter(Boolean).join(' ').trim() ||
        e.display_name;
      return {
        entity_id: e.id,
        name,
        job_title: attrs.job_title ?? (ctx.job_title as string | null) ?? null,
        avatar_url: e.avatar_url ?? null,
        is_ghost: e.claimed_by_user_id == null,
        employment_status: (ctx.employment_status as 'internal_employee' | 'external_contractor' | null) ?? null,
        skills: crewSkillsByEntityId.get(e.id) ?? [],
        _section: 'team' as const,
      };
    });
  }

  const teamEntityIdSet = new Set(rosterEntityIds);

  // ── 3. Workspace member user IDs — for network deduplication ─────────────
  // A person entity claimed by an existing workspace member should never appear
  // under "Network" — they're already part of the team in some capacity.
  // This handles the case where a roster ghost entity and a separately claimed
  // account entity belong to the same real person (ghost has no claimed_by_user_id
  // so rosterUserIds alone can't catch the duplicate).
  const { data: wsMemberRows } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId);

  const workspaceMemberUserIds = new Set<string>(
    (wsMemberRows ?? []).map((m) => m.user_id).filter(Boolean) as string[]
  );

  // ── 4. Inner-circle: PARTNER/VENDOR/CLIENT edges from org with tier='preferred' ──
  // Only show people the workspace has explicitly flagged as preferred partners —
  // not the full workspace person graph (which contains clients, venues, etc.).
  const { data: partnerRels } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('target_entity_id, context_data')
    .eq('source_entity_id', orgEnt.id)
    .in('relationship_type', ['PARTNER', 'VENDOR', 'CLIENT']);

  const innerCircleEntityIds = (partnerRels ?? [])
    .filter((r) => {
      const ctx = (r.context_data as Record<string, unknown>) ?? {};
      return ctx.tier === 'preferred' && !ctx.deleted_at;
    })
    .map((r) => r.target_entity_id)
    .filter((id) => !teamEntityIdSet.has(id));

  let networkResults: CrewSearchResult[] = [];
  if (innerCircleEntityIds.length > 0) {
    // Fetch entities and their crew skills in parallel
    let networkEntitiesQuery = supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name, avatar_url, attributes, claimed_by_user_id')
      .in('id', innerCircleEntityIds)
      .eq('type', 'person');
    if (q) networkEntitiesQuery = networkEntitiesQuery.ilike('display_name', `%${q}%`);

    const [networkEntResult, networkSkillsResult] = await Promise.all([
      networkEntitiesQuery.limit(20),
      supabase
        .schema('ops')
        .from('crew_skills')
        .select('entity_id, skill_tag')
        .in('entity_id', innerCircleEntityIds)
        .eq('workspace_id', workspaceId),
    ]);

    const networkSkillsByEntityId = new Map<string, string[]>();
    for (const row of networkSkillsResult.data ?? []) {
      const list = networkSkillsByEntityId.get(row.entity_id) ?? [];
      list.push(row.skill_tag);
      networkSkillsByEntityId.set(row.entity_id, list);
    }

    networkResults = (networkEntResult.data ?? [])
      .filter((e) => {
        if (e.claimed_by_user_id && workspaceMemberUserIds.has(e.claimed_by_user_id)) return false;
        if (!hasRoleFilter) return true;
        const skills = (networkSkillsByEntityId.get(e.id) ?? []).map((s) => s.toLowerCase());
        return skills.some((s) => s.includes(roleLower) || roleLower.includes(s));
      })
      .slice(0, 5)
      .map((e) => {
        const attrs = readEntityAttrs(e.attributes, 'person');
        const name =
          [attrs.first_name, attrs.last_name].filter(Boolean).join(' ').trim() ||
          e.display_name;
        return {
          entity_id: e.id,
          name,
          job_title: attrs.job_title ?? null,
          avatar_url: e.avatar_url ?? null,
          is_ghost: e.claimed_by_user_id == null,
          employment_status: null,
          skills: networkSkillsByEntityId.get(e.id) ?? [],
          _section: 'network' as const,
        };
      });
  }

  return [...teamResults.slice(0, 10), ...networkResults];
}

// =============================================================================
// remindAllUnconfirmed — batch remind all pending (unconfirmed, not declined) crew
// Returns counts for toast display. Actual email sending to be wired once
// deal_crew has its own confirmation token flow (currently crew_assignments only).
// =============================================================================

export async function remindAllUnconfirmed(
  dealId: string,
): Promise<{ sent: number; skipped: number }> {
  const parsed = z.string().uuid().safeParse(dealId);
  if (!parsed.success) return { sent: 0, skipped: 0 };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { sent: 0, skipped: 0 };

  try {
    const supabase = await createClient();

    // Fetch all pending crew (assigned but not confirmed, not declined)
    const { data: pendingRows } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .select('id, entity_id')
      .eq('deal_id', dealId)
      .eq('workspace_id', workspaceId)
      .not('entity_id', 'is', null)
      .is('confirmed_at', null)
      .is('declined_at', null);

    if (!pendingRows?.length) return { sent: 0, skipped: 0 };

    // Resolve emails from directory.entities
    const entityIds = (pendingRows as { id: string; entity_id: string }[]).map((r) => r.entity_id);
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, type, attributes')
      .in('id', entityIds);

    const emailMap = new Map<string, string | null>();
    for (const e of (entities ?? []) as { id: string; type: string | null; attributes: unknown }[]) {
      const t = e.type ?? 'person';
      let email: string | null = null;
      if (t === 'person') {
        email = readEntityAttrs(e.attributes, 'person').email ?? null;
      } else if (t === 'individual') {
        email = readEntityAttrs(e.attributes, 'individual').email ?? null;
      } else if (t === 'company') {
        email = readEntityAttrs(e.attributes, 'company').support_email ?? null;
      }
      emailMap.set(e.id, email);
    }

    let sent = 0;
    let skipped = 0;
    for (const row of pendingRows as { id: string; entity_id: string }[]) {
      const email = emailMap.get(row.entity_id);
      if (email) {
        // TODO: Wire to actual deal_crew reminder email when token flow is ready
        sent++;
      } else {
        skipped++;
      }
    }

    return { sent, skipped };
  } catch {
    return { sent: 0, skipped: 0 };
  }
}

// =============================================================================
// getDealCrewForEvent — resolve event_id → deal_id → getDealCrew
// Used by Plan tab to read crew from the single source of truth.
// =============================================================================

export async function getDealCrewForEvent(eventId: string): Promise<DealCrewRow[]> {
  const parsed = z.string().uuid().safeParse(eventId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  // Resolve deal_id from the event's back-reference
  const { data: evt } = await (supabase as any)
    .schema('ops')
    .from('events')
    .select('deal_id')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const dealId = (evt?.deal_id as string) ?? null;
  if (!dealId) return [];

  return getDealCrew(dealId);
}

// =============================================================================
// updateCrewDispatch — update ops-specific fields on a deal_crew row
// Used by Plan tab CrewFlightCheck for dispatch status, call times, etc.
// =============================================================================

export async function updateCrewDispatch(
  dealCrewRowId: string,
  updates: {
    dispatch_status?: 'standby' | 'en_route' | 'on_site' | 'wrapped' | null;
    call_time?: string | null;
    call_time_slot_id?: string | null;
    arrival_location?: string | null;
    day_rate?: number | null;
    notes?: string | null;
  },
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = z.string().uuid().safeParse(dealCrewRowId);
  if (!parsed.success) return { success: false, error: 'Invalid ID' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  // Validate dispatch_status if provided
  if (updates.dispatch_status !== undefined && updates.dispatch_status !== null) {
    const valid = ['standby', 'en_route', 'on_site', 'wrapped'];
    if (!valid.includes(updates.dispatch_status)) {
      return { success: false, error: 'Invalid dispatch status' };
    }
  }

  try {
    const supabase = await createClient();

    const { error, count } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .update(updates, { count: 'exact' })
      .eq('id', dealCrewRowId)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };
    if (count === 0) return { success: false, error: 'Not found' };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
