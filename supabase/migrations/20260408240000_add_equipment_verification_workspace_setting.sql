-- Verified Kit System Layer 1.5: Add workspace toggle for equipment verification.
-- When enabled, new crew equipment items start as 'pending' instead of 'approved'.

ALTER TABLE public.workspaces
  ADD COLUMN require_equipment_verification boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspaces.require_equipment_verification IS 'When true, new crew equipment items start as pending and require admin approval.';
