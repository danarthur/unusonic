-- Phase 1.1: date hold pressure reason type + follow_up_category column
-- Enables the date-conflict follow-up signal and lays groundwork for
-- nurture/ops categorization in Phase 3.5.

-- Expand reason_type CHECK to include 'date_hold_pressure'
ALTER TABLE ops.follow_up_queue
  DROP CONSTRAINT IF EXISTS follow_up_queue_reason_type_check;

ALTER TABLE ops.follow_up_queue
  ADD CONSTRAINT follow_up_queue_reason_type_check
  CHECK (reason_type IN (
    'stall', 'engagement_hot', 'deadline_proximity', 'no_owner', 'no_activity',
    'proposal_unseen', 'proposal_bounced', 'proposal_sent', 'date_hold_pressure'
  ));

-- Add follow_up_category for filtering by follow-up type (sales/ops/nurture)
ALTER TABLE ops.follow_up_queue
  ADD COLUMN IF NOT EXISTS follow_up_category text NOT NULL DEFAULT 'sales';

ALTER TABLE ops.follow_up_queue
  DROP CONSTRAINT IF EXISTS follow_up_queue_category_check;

ALTER TABLE ops.follow_up_queue
  ADD CONSTRAINT follow_up_queue_category_check
  CHECK (follow_up_category IN ('sales', 'ops', 'nurture'));
