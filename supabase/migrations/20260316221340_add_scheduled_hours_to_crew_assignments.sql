-- Add scheduled_hours to ops.crew_assignments
-- Enables correct cost calculation for hourly-rate crew members.
-- NULL means not set (treated as flat rate in getEventLedger).

ALTER TABLE ops.crew_assignments
  ADD COLUMN IF NOT EXISTS scheduled_hours numeric(6,2);

COMMENT ON COLUMN ops.crew_assignments.scheduled_hours
  IS 'For hourly pay_rate_type: number of hours scheduled. NULL = use flat rate fallback.';
