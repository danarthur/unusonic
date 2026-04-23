-- Phase 1: Advanced Access System — add Manager role (foundation for Role Architect).
-- Observer = existing 'restricted' (read-only). Owner, Admin, Member unchanged.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'org_member_role' AND e.enumlabel = 'manager'
  ) THEN
    ALTER TYPE public.org_member_role ADD VALUE 'manager';
  END IF;
END$$;

COMMENT ON TYPE public.org_member_role IS 'Signal Strategy Phase 1: owner (God Mode), admin (Executive), manager (Producer), member (Creative), restricted (Observer/Client). Phase 2: Role Architect will extend.';
