-- Phase A: Aion voice foundation
-- Adds workspace-level Aion configuration (voice, kill switch)
-- and structured edit tracking columns on the follow-up log.

-- 1. Workspace Aion config (voice, rules, kill switch)
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS aion_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Structured edit tracking on follow_up_log
ALTER TABLE ops.follow_up_log
  ADD COLUMN IF NOT EXISTS draft_original text;

ALTER TABLE ops.follow_up_log
  ADD COLUMN IF NOT EXISTS edit_classification text;

ALTER TABLE ops.follow_up_log
  DROP CONSTRAINT IF EXISTS follow_up_log_edit_classification_check;

ALTER TABLE ops.follow_up_log
  ADD CONSTRAINT follow_up_log_edit_classification_check
  CHECK (edit_classification IN ('approved_unchanged', 'light_edit', 'heavy_edit', 'rejected'));

ALTER TABLE ops.follow_up_log
  ADD COLUMN IF NOT EXISTS edit_distance numeric;
