-- Phase A: Advancing checklist JSONB column on ops.events
ALTER TABLE ops.events
  ADD COLUMN IF NOT EXISTS advancing_checklist jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN ops.events.advancing_checklist IS
  'Advancing checklist items. Each: {id, label, done, done_by, done_at, auto_key, sort_order}';
