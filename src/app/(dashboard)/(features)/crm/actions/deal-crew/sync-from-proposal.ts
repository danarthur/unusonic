'use server';

/**
 * Proposal → deal-crew sync helpers.
 *
 * Extracted from deal-crew.ts (Phase 0.5-style split, 2026-04-29).
 *
 * `syncDealCrewFromProposalImpl` is the workhorse: diffs proposal line-item
 * assignees against existing `ops.deal_crew` rows, inserts new unconfirmed
 * suggestions, and culls stale unconfirmed proposal rows whose package is
 * no longer in the proposal. Confirmed rows are never touched.
 *
 * `syncCrewFromProposal` is the public wrapper used after saving a proposal
 * to keep `deal_crew` in sync without paying for a full crew refetch.
 *
 * `getDealCrew` (in the parent file) calls the impl directly via this
 * module's internal export so the sync runs inline before the read.
 */

import { z } from 'zod/v4';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { instrument } from '@/shared/lib/instrumentation';

export async function syncDealCrewFromProposalImpl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealId: string,
  workspaceId: string,
): Promise<void> {
  try {
    // Get the most recent proposal for this deal (including drafts — user assigns crew while drafting)
    const { data: proposal } = await supabase
      .from('proposals')
      .select('id')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!proposal) return;

    // Get all proposal items — include definition_snapshot for proposal-level crew overrides
    const { data: proposalItems } = await supabase
      .from('proposal_items')
      .select('id, origin_package_id, definition_snapshot')
      .eq('proposal_id', proposal.id)
      .not('origin_package_id', 'is', null);

    const packageIds = [...new Set((proposalItems ?? []).map((i: { origin_package_id: string | null }) => i.origin_package_id).filter(Boolean) as string[])];

    if (packageIds.length === 0) {
      // No packages — clean up any stale unconfirmed proposal rows

      await supabase
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

    // Read crew assignments from proposal-level definition_snapshot first (user overrides).
    // These take priority over catalog defaults — if a proposal item has crew_meta.required_roles
    // with entity_id set, that's the user's explicit assignment (e.g. assigned a specific DJ).
    const proposalCrewPackageIds = new Set<string>();
    for (const item of (proposalItems ?? []) as { id: string; origin_package_id: string | null; definition_snapshot: unknown }[]) {
      const snap = item.definition_snapshot as { crew_meta?: { required_roles?: { role?: string; entity_id?: string | null; assignee_name?: string | null; quantity?: number }[] } } | null;
      const roles = snap?.crew_meta?.required_roles;
      if (roles?.length && item.origin_package_id) {
        proposalCrewPackageIds.add(item.origin_package_id);
        for (const r of roles) {
          if (r.role) {
            const qty = r.quantity ?? 1;
            for (let i = 0; i < qty; i++) {
              assigneeRows.push({ entity_id: r.entity_id ?? null, role_note: r.role, package_id: item.origin_package_id });
            }
          }
        }
      }
    }

    // Also read required_roles from package definitions — but skip packages already handled
    // by proposal-level overrides above (proposal assignments take priority)
    const { data: allPkgs } = await supabase
      .from('packages')
      .select('id, definition')
      .in('id', [...allPackageIds]);
    for (const pkg of (allPkgs ?? []) as { id: string; definition: unknown }[]) {
      if (proposalCrewPackageIds.has(pkg.id)) continue; // proposal override takes priority
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
    const { data: existingCrew, error: existingError } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('id, entity_id, role_note, catalog_item_id, confirmed_at, source')
      .eq('deal_id', dealId);
    if (existingError) return; // Can't sync without existing state

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

    // Deduplicate: one row per entity_id (named) and one per role_note (open slots)
    const seenEntities = new Set<string>();
    const dedupedNamed = namedToInsert.filter((a) => {
      if (seenEntities.has(a.entity_id)) return false;
      seenEntities.add(a.entity_id);
      return true;
    });
    const seenRoles = new Set<string>();
    const dedupedRoles = roleToInsert.filter((a) => {
      const key = a.role_note!;
      if (seenRoles.has(key)) return false;
      seenRoles.add(key);
      return true;
    });

    const toInsert = [
      ...dedupedNamed.map((a) => ({
        deal_id: dealId,
        workspace_id: workspaceId,
        entity_id: a.entity_id,
        role_note: a.role_note ?? null,
        source: 'proposal' as const,
        catalog_item_id: a.package_id,
        confirmed_at: null,
      })),
      ...dedupedRoles.map((a) => ({
        deal_id: dealId,
        workspace_id: workspaceId,
        entity_id: null,
        role_note: a.role_note,
        source: 'proposal' as const,
        catalog_item_id: a.package_id,
        confirmed_at: null,
      })),
    ];

    // Insert one at a time to handle partial unique constraints gracefully
    for (const row of toInsert) {
      const { error: insertError } = await supabase
        .schema('ops')
        .from('deal_crew')
        .insert(row);
      if (insertError && insertError.code !== '23505') {
        // Log non-duplicate errors; 23505 = unique violation (already exists, skip)
        console.error('[syncDealCrew] INSERT failed:', insertError.message, insertError.code);
      }
    }

    // Delete stale unconfirmed proposal rows whose package is no longer in the proposal.
    // Must use allPackageIds (includes bundle ingredient IDs) — ingredient crew rows
    // have catalog_item_id set to the ingredient's ID, not the bundle's top-level ID.
    const activePackageIdSet = new Set(allPackageIds);
    const staleIds = existing
      .filter((r) => r.source === 'proposal' && r.confirmed_at === null && r.catalog_item_id && !activePackageIdSet.has(r.catalog_item_id))
      .map((r) => r.id);

    if (staleIds.length > 0) {
      // Audit finding: stale-row culling was previously silent — owners saw
      // crew vanish after a proposal edit with no explanation. Escalate the
      // count to Sentry as a warning so the pattern is visible across sessions.
      // Row-level visibility in the UI needs a separate "X roles removed from
      // proposal sync" toast on the Production Team Card load path.
      Sentry.captureMessage('syncDealCrewFromProposal: culled stale unconfirmed rows', {
        level: 'warning',
        extra: {
          dealId,
          workspaceId,
          culledCount: staleIds.length,
          staleIds,
          activePackageIds: [...activePackageIdSet],
        },
        tags: { area: 'crm.crew-sync' },
      });
      await supabase
        .schema('ops')
        .from('deal_crew')
        .delete()
        .in('id', staleIds);
    }
  } catch (err) {
    // Non-fatal — sync failure should not break the card load
    console.error('[syncDealCrewFromProposal] Error:', err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'syncDealCrewFromProposal' } });
  }
}

export async function syncCrewFromProposal(dealId: string): Promise<void> {
  return instrument('syncCrewFromProposal', async () => {
    const parsed = z.string().uuid().safeParse(dealId);
    if (!parsed.success) return;

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return;

    try {
      const supabase = await createClient();
      await syncDealCrewFromProposalImpl(supabase, dealId, workspaceId);
    } catch (err) {
      console.error('[syncCrewFromProposal] Failed:', err);
    }
  });
}
