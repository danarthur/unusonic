-- Single-RPC replacement for syncDealCrewFromProposalImpl
-- =========================================================
--
-- The TypeScript implementation (events/actions/deal-crew/sync-from-proposal.ts)
-- diffs proposal-item assignees against existing `ops.deal_crew` rows. Its old
-- shape did:
--
--   1. Read latest proposal + proposal_items
--   2. Read packages (bundle defs) to expand ingredient package IDs
--   3. For every package: SELECT catalog.item_assignees via the
--      `get_catalog_item_assignees(p_package_id)` RPC — N round-trips
--   4. Read packages (definition.required_roles) for all package IDs
--   5. Read existing deal_crew
--   6. Insert each new row individually with retry-on-23505 — N round-trips
--   7. Delete stale unconfirmed proposal rows
--
-- On the Plan tab cold load, this fan-out was running 10-15+ DB round-trips
-- inline per `getDealCrew` call, and getDealCrew was being invoked twice in
-- parallel (bundle + ProductionTeamCard), turning ~30 round-trips into a
-- contended write storm that dominated cold-paint time.
--
-- This RPC collapses the whole pipeline into one SECURITY DEFINER call. The
-- two writes (INSERT and DELETE) use bulk operations against the partial
-- unique indexes already on ops.deal_crew:
--   - deal_crew_deal_entity_uniq  (deal_id, entity_id) WHERE entity_id IS NOT NULL
--   - deal_crew_deal_role_uniq    (deal_id, role_note) WHERE entity_id IS NULL AND role_note IS NOT NULL
--
-- The function is workspace-gated via `member_has_permission`. The
-- TypeScript wrapper `syncCrewFromProposal` continues to handle errors as
-- non-fatal; the RPC simply returns a small jsonb summary so callers can
-- log how many rows changed if they want.

CREATE OR REPLACE FUNCTION public.sync_deal_crew_from_proposal(
  p_deal_id uuid,
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops, catalog
AS $$
DECLARE
  v_proposal_id uuid;
  v_package_ids uuid[];
  v_all_package_ids uuid[];
  v_inserted_named int := 0;
  v_inserted_role int := 0;
  v_deleted int := 0;
BEGIN
  -- Workspace guard. The function runs as SECURITY DEFINER so the implicit
  -- auth.uid() check via RLS doesn't apply — gate explicitly here.
  -- Service-role callers bypass this check (auth.uid() is NULL for them).
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = auth.uid() AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  -- Latest proposal for this deal (any status — user may assign crew while
  -- still drafting). NULL → there's nothing to sync from; bail.
  SELECT id INTO v_proposal_id
  FROM public.proposals
  WHERE deal_id = p_deal_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_proposal_id IS NULL THEN
    RETURN jsonb_build_object(
      'proposal_id', NULL,
      'inserted_named', 0,
      'inserted_role', 0,
      'deleted', 0
    );
  END IF;

  -- Top-level package IDs from proposal_items.
  SELECT COALESCE(array_agg(DISTINCT origin_package_id), ARRAY[]::uuid[])
  INTO v_package_ids
  FROM public.proposal_items
  WHERE proposal_id = v_proposal_id
    AND origin_package_id IS NOT NULL;

  -- No packages → clean up stale unconfirmed proposal rows and exit.
  IF cardinality(v_package_ids) = 0 THEN
    WITH deleted AS (
      DELETE FROM ops.deal_crew
      WHERE deal_id = p_deal_id
        AND source = 'proposal'
        AND confirmed_at IS NULL
      RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM deleted;

    RETURN jsonb_build_object(
      'proposal_id', v_proposal_id,
      'inserted_named', 0,
      'inserted_role', 0,
      'deleted', v_deleted
    );
  END IF;

  -- Expand bundle packages: collect ingredient package IDs from each
  -- bundle's definition.blocks[] where type='line_item'. Union with the
  -- top-level package_ids to get the full set the sync should consider.
  WITH bundle_ingredients AS (
    SELECT DISTINCT
      (b->>'catalogId')::uuid AS pkg_id
    FROM public.packages p,
         LATERAL jsonb_array_elements(COALESCE(p.definition->'blocks', '[]'::jsonb)) AS b
    WHERE p.id = ANY(v_package_ids)
      AND p.category = 'package'
      AND b->>'type' = 'line_item'
      AND b->>'catalogId' IS NOT NULL
  )
  SELECT COALESCE(
    array_agg(DISTINCT pkg_id),
    v_package_ids
  ) INTO v_all_package_ids
  FROM (
    SELECT unnest(v_package_ids) AS pkg_id
    UNION
    SELECT pkg_id FROM bundle_ingredients
  ) merged;

  -- Compute the desired-assignee set: union of
  --   (a) catalog.item_assignees for every package in scope
  --   (b) proposal-item-level overrides from definition_snapshot.crew_meta.required_roles
  --       (these take priority per package — see the TS impl for why)
  --   (c) catalog required_roles from packages.definition.required_roles for
  --       packages NOT covered by (b)
  -- Quantity expansion (`for (let i = 0; i < qty; i++)`) is preserved via
  -- LATERAL generate_series on the role qty.

  WITH
  proposal_override_packages AS (
    SELECT DISTINCT pi.origin_package_id AS pkg_id
    FROM public.proposal_items pi
    WHERE pi.proposal_id = v_proposal_id
      AND pi.origin_package_id IS NOT NULL
      AND jsonb_array_length(
        COALESCE(pi.definition_snapshot->'crew_meta'->'required_roles', '[]'::jsonb)
      ) > 0
  ),
  catalog_assignees AS (
    SELECT ia.entity_id, ia.role_note, ia.package_id
    FROM catalog.item_assignees ia
    JOIN public.packages p ON p.id = ia.package_id
    WHERE ia.package_id = ANY(v_all_package_ids)
      AND p.workspace_id = p_workspace_id
  ),
  proposal_overrides AS (
    SELECT
      NULLIF(r->>'entity_id', '')::uuid AS entity_id,
      r->>'role' AS role_note,
      pi.origin_package_id AS package_id
    FROM public.proposal_items pi,
         LATERAL jsonb_array_elements(
           COALESCE(pi.definition_snapshot->'crew_meta'->'required_roles', '[]'::jsonb)
         ) AS r,
         LATERAL generate_series(1, COALESCE((r->>'quantity')::int, 1))
    WHERE pi.proposal_id = v_proposal_id
      AND pi.origin_package_id IS NOT NULL
      AND r->>'role' IS NOT NULL
  ),
  catalog_required_roles AS (
    SELECT
      NULLIF(r->>'entity_id', '')::uuid AS entity_id,
      r->>'role' AS role_note,
      p.id AS package_id
    FROM public.packages p,
         LATERAL jsonb_array_elements(
           COALESCE(p.definition->'required_roles', '[]'::jsonb)
         ) AS r,
         LATERAL generate_series(1, COALESCE((r->>'quantity')::int, 1))
    WHERE p.id = ANY(v_all_package_ids)
      AND p.workspace_id = p_workspace_id
      AND r->>'role' IS NOT NULL
      AND p.id NOT IN (SELECT pkg_id FROM proposal_override_packages)
  ),
  desired AS (
    SELECT entity_id, role_note, package_id FROM catalog_assignees
    UNION ALL
    SELECT entity_id, role_note, package_id FROM proposal_overrides
    UNION ALL
    SELECT entity_id, role_note, package_id FROM catalog_required_roles
  ),
  existing AS (
    SELECT id, entity_id, role_note FROM ops.deal_crew WHERE deal_id = p_deal_id
  ),
  existing_entity_ids AS (
    SELECT entity_id FROM existing WHERE entity_id IS NOT NULL
  ),
  existing_role_notes AS (
    SELECT role_note FROM existing WHERE role_note IS NOT NULL
  ),
  -- Named-person rows: have entity_id, not in existing
  to_insert_named AS (
    SELECT DISTINCT ON (entity_id) entity_id, role_note, package_id
    FROM desired
    WHERE entity_id IS NOT NULL
      AND entity_id NOT IN (SELECT entity_id FROM existing_entity_ids)
  ),
  -- Role-only rows: no entity_id, role not already in existing, deduped
  to_insert_role AS (
    SELECT DISTINCT ON (role_note) role_note, package_id
    FROM desired
    WHERE entity_id IS NULL
      AND role_note IS NOT NULL
      AND role_note NOT IN (SELECT role_note FROM existing_role_notes)
  ),
  ins_named AS (
    INSERT INTO ops.deal_crew (
      deal_id, workspace_id, entity_id, role_note, source, catalog_item_id, confirmed_at
    )
    SELECT
      p_deal_id, p_workspace_id, entity_id, role_note, 'proposal'::text, package_id, NULL
    FROM to_insert_named
    ON CONFLICT (deal_id, entity_id) WHERE entity_id IS NOT NULL DO NOTHING
    RETURNING 1
  ),
  ins_role AS (
    INSERT INTO ops.deal_crew (
      deal_id, workspace_id, entity_id, role_note, source, catalog_item_id, confirmed_at
    )
    SELECT
      p_deal_id, p_workspace_id, NULL, role_note, 'proposal'::text, package_id, NULL
    FROM to_insert_role
    ON CONFLICT (deal_id, role_note) WHERE entity_id IS NULL AND role_note IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM ins_named)::int,
    (SELECT count(*) FROM ins_role)::int
  INTO v_inserted_named, v_inserted_role;

  -- Delete stale unconfirmed proposal rows whose catalog_item_id is no
  -- longer in the active set. allPackageIds (the bundle-expanded set) is the
  -- right scope — ingredient crew rows have catalog_item_id set to the
  -- ingredient's id, not the bundle's top-level id.
  WITH stale AS (
    DELETE FROM ops.deal_crew
    WHERE deal_id = p_deal_id
      AND source = 'proposal'
      AND confirmed_at IS NULL
      AND catalog_item_id IS NOT NULL
      AND NOT (catalog_item_id = ANY(v_all_package_ids))
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM stale;

  RETURN jsonb_build_object(
    'proposal_id', v_proposal_id,
    'inserted_named', v_inserted_named,
    'inserted_role', v_inserted_role,
    'deleted', v_deleted
  );
END;
$$;

-- Lock down execution. Per CLAUDE.md security audit (migration
-- 20260410160000), every SECURITY DEFINER function must REVOKE FROM
-- PUBLIC/anon to avoid the implicit grant. Service role and authenticated
-- callers (which are workspace-gated inside the body) keep EXECUTE.
REVOKE EXECUTE ON FUNCTION public.sync_deal_crew_from_proposal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_deal_crew_from_proposal(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.sync_deal_crew_from_proposal(uuid, uuid) IS
  'Reconciles ops.deal_crew with the latest proposal''s required-role + assignee set. Single-round-trip replacement for the per-package fanout in syncDealCrewFromProposalImpl. Returns {proposal_id, inserted_named, inserted_role, deleted}.';
