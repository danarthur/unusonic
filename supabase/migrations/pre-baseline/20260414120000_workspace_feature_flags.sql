-- Workspace-scoped feature flag overrides.
--
-- Lightweight Phase 0 infrastructure for the reports & analytics initiative.
-- Lets us ship Phase 2/3 surfaces dark and enable per-workspace for beta users
-- without code changes or env var redeploys.
--
-- Convention: flag keys are namespaced strings, e.g. 'reports.modular_lobby',
-- 'reports.aion_pin', 'reports.reconciliation'. Stored as a JSONB object on
-- public.workspaces. Read via src/shared/lib/feature-flags.ts.
--
-- Sits BELOW the tier-gate (src/shared/lib/tier-gate.ts) and the billing-gate
-- (src/shared/lib/billing-gate.ts) — feature flags can't override paywalls.
-- A flag turning a feature ON does not bypass tier checks; it only allows the
-- caller to render/use a gated feature within their existing tier.
--
-- RLS: feature_flags is read via the existing workspaces SELECT policy
-- (workspace membership). No new policy needed.

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.workspaces.feature_flags IS
  'Per-workspace feature flag overrides. Namespaced keys (e.g. reports.modular_lobby) → boolean. Read via shared/lib/feature-flags.ts. Does not bypass tier or billing gates.';
