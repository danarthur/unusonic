-- Phase 2.1 Sprint 3 — seed archetype role-mix defaults + workspace trigger.
--
-- Seeds 41 default rows across the 10 system archetypes for every existing
-- workspace, and installs an AFTER INSERT trigger so future workspaces get
-- the same defaults on creation.
--
-- The role mixes are conservative best-guesses tuned to the User Advocate's
-- production-owner archetype: most "required" roles are the bare minimum
-- the system would warn about if missing; "optional" roles are scale-driven
-- and depend on owner's typical setup. Owners can edit per workspace.
--
-- Vocabulary check (User Advocate's smell-test list):
--   * Roles use the canonical ops.workspace_job_titles labels (DJ, Audio A1,
--     Lighting Director, etc.) — no slang, no SaaS-speak.

-- ─────────────────────────────────────────────────────────────────────────
-- Seed function — idempotent. Inserts the canonical role mix for one
-- workspace. ON CONFLICT preserves any owner edits.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops.seed_archetype_role_requirements_for_workspace(
  p_workspace_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'pg_catalog', 'ops', 'public'
AS $function$
BEGIN
  INSERT INTO ops.archetype_role_requirements
    (workspace_id, archetype_slug, role_tag, qty_required, is_optional)
  VALUES
    -- Wedding: DJ-led, optional sound + lighting depending on scale
    (p_workspace_id, 'wedding',         'DJ',                 1, false),
    (p_workspace_id, 'wedding',         'Audio A1',           1, true),
    (p_workspace_id, 'wedding',         'Lighting Tech',      1, true),

    -- Corporate gala: AV-led, full crew on big rooms
    (p_workspace_id, 'corporate_gala',  'Audio A1',           1, false),
    (p_workspace_id, 'corporate_gala',  'Lighting Director',  1, false),
    (p_workspace_id, 'corporate_gala',  'Audio A2',           1, true),
    (p_workspace_id, 'corporate_gala',  'Stage Manager',      1, true),
    (p_workspace_id, 'corporate_gala',  'Camera Operator',    1, true),

    -- Product launch: AV + video coverage
    (p_workspace_id, 'product_launch',  'Audio A1',           1, false),
    (p_workspace_id, 'product_launch',  'Lighting Director',  1, false),
    (p_workspace_id, 'product_launch',  'Video Director',     1, true),
    (p_workspace_id, 'product_launch',  'Camera Operator',    1, true),

    -- Private dinner: small footprint, pick one of DJ or Audio
    (p_workspace_id, 'private_dinner',  'DJ',                 1, true),
    (p_workspace_id, 'private_dinner',  'Audio A1',           1, true),

    -- Concert: full audio + lighting + SM is hard-required
    (p_workspace_id, 'concert',         'Audio A1',           1, false),
    (p_workspace_id, 'concert',         'Audio A2',           1, false),
    (p_workspace_id, 'concert',         'Lighting Director',  1, false),
    (p_workspace_id, 'concert',         'Stage Manager',      1, false),
    (p_workspace_id, 'concert',         'Backline Tech',      1, true),

    -- Festival: largest crew, multiple cameras, production manager + tour
    (p_workspace_id, 'festival',        'Audio A1',           1, false),
    (p_workspace_id, 'festival',        'Audio A2',           1, false),
    (p_workspace_id, 'festival',        'Lighting Director',  1, false),
    (p_workspace_id, 'festival',        'Stage Manager',      1, false),
    (p_workspace_id, 'festival',        'Production Manager', 1, false),
    (p_workspace_id, 'festival',        'Backline Tech',      1, true),
    (p_workspace_id, 'festival',        'Camera Operator',    2, true),
    (p_workspace_id, 'festival',        'Rigger',             1, true),
    (p_workspace_id, 'festival',        'Tour Manager',       1, true),
    (p_workspace_id, 'festival',        'Video Director',     1, true),

    -- Awards show: AV + video coverage
    (p_workspace_id, 'awards_show',     'Audio A1',           1, false),
    (p_workspace_id, 'awards_show',     'Lighting Director',  1, false),
    (p_workspace_id, 'awards_show',     'Stage Manager',      1, false),
    (p_workspace_id, 'awards_show',     'Video Director',     1, true),
    (p_workspace_id, 'awards_show',     'Camera Operator',    2, true),

    -- Conference: lighter AV, video for keynote
    (p_workspace_id, 'conference',      'Audio A1',           1, false),
    (p_workspace_id, 'conference',      'Lighting Tech',      1, false),
    (p_workspace_id, 'conference',      'Video Director',     1, true),
    (p_workspace_id, 'conference',      'Stage Manager',      1, true),

    -- Birthday: simple, DJ-led
    (p_workspace_id, 'birthday',        'DJ',                 1, true),
    (p_workspace_id, 'birthday',        'Lighting Tech',      1, true),

    -- Charity gala: AV-led, optional DJ for cocktails
    (p_workspace_id, 'charity_gala',    'Audio A1',           1, false),
    (p_workspace_id, 'charity_gala',    'Lighting Tech',      1, false),
    (p_workspace_id, 'charity_gala',    'DJ',                 1, true),
    (p_workspace_id, 'charity_gala',    'Stage Manager',      1, true)
  ON CONFLICT (workspace_id, archetype_slug, role_tag) DO NOTHING;
END;
$function$;

COMMENT ON FUNCTION ops.seed_archetype_role_requirements_for_workspace(uuid) IS
  'Phase 2.1 Sprint 3 — idempotent seed of the canonical role mix for one workspace. Called by both backfill and the AFTER INSERT trigger on public.workspaces. ON CONFLICT preserves owner edits.';

REVOKE EXECUTE ON FUNCTION ops.seed_archetype_role_requirements_for_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ops.seed_archetype_role_requirements_for_workspace(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- AFTER INSERT trigger on public.workspaces — auto-seed new workspaces
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops.handle_workspace_insert_seed_archetype_roles()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'pg_catalog', 'ops', 'public'
AS $function$
BEGIN
  PERFORM ops.seed_archetype_role_requirements_for_workspace(NEW.id);
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION ops.handle_workspace_insert_seed_archetype_roles() IS
  'AFTER INSERT trigger on public.workspaces — seeds the archetype role-mix matrix with canonical defaults. SECURITY DEFINER so seeds bypass RLS during workspace creation.';

REVOKE EXECUTE ON FUNCTION ops.handle_workspace_insert_seed_archetype_roles() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ops.handle_workspace_insert_seed_archetype_roles() TO service_role;

CREATE TRIGGER trg_workspace_seed_archetype_roles
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION ops.handle_workspace_insert_seed_archetype_roles();

-- ─────────────────────────────────────────────────────────────────────────
-- Backfill existing workspaces
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_workspace_id uuid;
  v_count int := 0;
BEGIN
  FOR v_workspace_id IN
    SELECT id FROM public.workspaces ORDER BY created_at
  LOOP
    PERFORM ops.seed_archetype_role_requirements_for_workspace(v_workspace_id);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Seeded archetype role-mix for % workspaces', v_count;
END $$;

-- Audit
DO $$
DECLARE
  v_total_rows int;
  v_workspace_count int;
  v_min_per_workspace int;
BEGIN
  SELECT COUNT(*) INTO v_total_rows FROM ops.archetype_role_requirements;
  SELECT COUNT(DISTINCT workspace_id) INTO v_workspace_count FROM ops.archetype_role_requirements;
  SELECT MIN(c) INTO v_min_per_workspace FROM (
    SELECT COUNT(*) AS c FROM ops.archetype_role_requirements GROUP BY workspace_id
  ) sub;

  IF v_total_rows = 0 THEN
    RAISE EXCEPTION 'Safety audit: archetype_role_requirements empty after seed';
  END IF;
  IF v_min_per_workspace < 41 THEN
    RAISE EXCEPTION 'Safety audit: workspace seeded with only % rows (expected ≥41)', v_min_per_workspace;
  END IF;
  RAISE NOTICE 'Audit: % rows across % workspaces (min % per workspace)',
    v_total_rows, v_workspace_count, v_min_per_workspace;
END $$;
