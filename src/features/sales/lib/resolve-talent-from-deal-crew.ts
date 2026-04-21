/**
 * Derive client-facing "Featuring X" talent attribution for proposal line items
 * from ops.deal_crew — the single source of truth for crew assignments.
 *
 * Usage pattern for both the production public-proposal reader and the builder
 * preview: build a predicate once with buildTalentRolePredicate, then call
 * resolveTalentForItem per line item.
 *
 * Why this lives here: keeping a single helper lets the builder preview and
 * the client-facing public proposal render identically. Earlier drift between
 * the two surfaced as "assigned crew shows in builder but not on the sent
 * proposal" because the reader was pulling from a stale definition_snapshot
 * instead of deal_crew.
 */

type ProposalItemLike = {
  origin_package_id?: string | null;
  package_id?: string | null;
  definition_snapshot?: unknown;
};

type DealCrewLike = {
  catalog_item_id: string | null;
  role_note: string | null;
  entity_id: string | null;
  entity_name?: string | null;
  avatar_url?: string | null;
};

export type TalentResolution = {
  talentNames: string[] | null;
  talentEntityIds: string[] | null;
  talentAvatarUrl: string | null;
};

/**
 * Build an "(catalog_item_id, role_note) → is required" predicate by walking
 * each item's snapshot. A role is "required" when its role definition sets
 * `required: true` in definition_snapshot.crew_meta.required_roles[].
 *
 * Defaults to NOT required when the flag is missing — this is an explicit
 * opt-in flag. Existing packages without the flag render as neutral (no
 * asterisk, no Send warning contribution), so rolling out the feature
 * doesn't retroactively nag every historical proposal.
 */
export function buildRequiredRolePredicate(
  items: ProposalItemLike[],
): (catalogItemId: string, roleNote: string) => boolean {
  const requiredRolesByCatalogId = new Map<string, Set<string>>();
  for (const item of items) {
    const catalogId = item.origin_package_id ?? item.package_id ?? null;
    if (!catalogId) continue;
    const snap = item.definition_snapshot as
      | { crew_meta?: { required_roles?: Array<{ role?: string; required?: boolean }> } }
      | null
      | undefined;
    const roles = snap?.crew_meta?.required_roles ?? [];
    let set = requiredRolesByCatalogId.get(catalogId);
    for (const r of roles) {
      if (r?.role && r.required === true) {
        if (!set) {
          set = new Set<string>();
          requiredRolesByCatalogId.set(catalogId, set);
        }
        set.add(r.role.toLowerCase());
      }
    }
  }
  return (catalogItemId, roleNote) => {
    const set = requiredRolesByCatalogId.get(catalogItemId);
    if (!set || !roleNote) return false;
    return set.has(roleNote.toLowerCase());
  };
}

/**
 * Build an "(catalog_item_id, role_note) → is talent" predicate by walking
 * each item's snapshot. A role is "talent" when booking_type === 'talent' in
 * the item's definition_snapshot.crew_meta.required_roles[]. Crew (lighting
 * techs, engineers, etc.) are explicitly not surfaced client-side.
 *
 * Takes the raw pre-consolidation item list because bundle children carry
 * the crew_meta — the bundle header itself usually doesn't.
 */
export function buildTalentRolePredicate(
  items: ProposalItemLike[],
): (catalogItemId: string, roleNote: string) => boolean {
  const talentRolesByCatalogId = new Map<string, Set<string>>();
  for (const item of items) {
    const catalogId = item.origin_package_id ?? item.package_id ?? null;
    if (!catalogId) continue;
    const snap = item.definition_snapshot as
      | { crew_meta?: { required_roles?: Array<{ role?: string; booking_type?: string }> } }
      | null
      | undefined;
    const roles = snap?.crew_meta?.required_roles ?? [];
    let set = talentRolesByCatalogId.get(catalogId);
    for (const r of roles) {
      if (r?.role && r.booking_type === 'talent') {
        if (!set) {
          set = new Set<string>();
          talentRolesByCatalogId.set(catalogId, set);
        }
        set.add(r.role.toLowerCase());
      }
    }
  }
  return (catalogItemId, roleNote) => {
    const set = talentRolesByCatalogId.get(catalogItemId);
    if (!set || !roleNote) return false;
    return set.has(roleNote.toLowerCase());
  };
}

/**
 * Resolve "Featuring X" attribution for a single proposal line item.
 *
 * @param catalogIds - Catalog package ids whose crew might land on this card.
 *   For a-la-carte rows: [item.origin_package_id]. For a consolidated bundle
 *   header: [bundle_id, ...child_catalog_ids] — children carry the deal_crew
 *   rows because required_roles are declared on the ingredient catalog row.
 * @param dealCrew - Live deal_crew rows (entity_id must be set for a row to count).
 * @param isTalentRole - Predicate from buildTalentRolePredicate.
 */
export function resolveTalentForItem(
  catalogIds: string[],
  dealCrew: DealCrewLike[],
  isTalentRole: (catalogItemId: string, roleNote: string) => boolean,
): TalentResolution {
  if (catalogIds.length === 0) {
    return { talentNames: null, talentEntityIds: null, talentAvatarUrl: null };
  }
  const idSet = new Set(catalogIds);
  const matches = dealCrew.filter(
    (r) =>
      r.entity_id != null &&
      r.catalog_item_id != null &&
      idSet.has(r.catalog_item_id) &&
      r.role_note != null &&
      isTalentRole(r.catalog_item_id, r.role_note),
  );
  if (matches.length === 0) {
    return { talentNames: null, talentEntityIds: null, talentAvatarUrl: null };
  }
  return {
    talentNames: matches.map((r) => r.entity_name ?? 'Assigned'),
    talentEntityIds: matches.map((r) => r.entity_id) as string[],
    talentAvatarUrl: matches.find((r) => r.avatar_url)?.avatar_url ?? null,
  };
}
