-- Verified Kit System Layer 1: Add verification columns to ops.crew_equipment.
-- Default verification_status = 'approved' so existing items and new items
-- in workspaces without verification enabled are immediately usable.

ALTER TABLE ops.crew_equipment
  ADD COLUMN verification_status text NOT NULL DEFAULT 'approved'
    CHECK (verification_status IN ('pending', 'approved', 'rejected', 'expired')),
  ADD COLUMN photo_url text,
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verified_by uuid,
  ADD COLUMN rejection_reason text;

COMMENT ON COLUMN ops.crew_equipment.verification_status IS 'pending/approved/rejected/expired. Default approved (zero friction). Workspaces with require_equipment_verification flip new items to pending.';
COMMENT ON COLUMN ops.crew_equipment.photo_url IS 'Supabase Storage path to equipment condition photo. Optional.';
COMMENT ON COLUMN ops.crew_equipment.verified_at IS 'When this item was last approved by an admin.';
COMMENT ON COLUMN ops.crew_equipment.verified_by IS 'User ID of the admin who approved this item.';
COMMENT ON COLUMN ops.crew_equipment.rejection_reason IS 'Why the item was rejected (shown to crew member in portal).';

-- Index for the review queue (pending items per workspace)
CREATE INDEX crew_equipment_verification_idx ON ops.crew_equipment (workspace_id, verification_status)
  WHERE verification_status = 'pending';
