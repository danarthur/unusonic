-- Add 'proposal_sent' to the follow_up_queue reason_type CHECK constraint.
-- This enables immediate follow-up queue items when a proposal is sent,
-- rather than waiting for the daily cron to detect unseen proposals.

ALTER TABLE ops.follow_up_queue
  DROP CONSTRAINT IF EXISTS follow_up_queue_reason_type_check;

ALTER TABLE ops.follow_up_queue
  ADD CONSTRAINT follow_up_queue_reason_type_check
  CHECK (reason_type IN (
    'stall', 'engagement_hot', 'deadline_proximity', 'no_owner', 'no_activity',
    'proposal_unseen', 'proposal_bounced', 'proposal_sent'
  ));
