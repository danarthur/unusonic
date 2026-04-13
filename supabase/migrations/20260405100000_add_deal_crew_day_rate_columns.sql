-- Migration: Version-control deal_crew dispatch and rate columns
-- These columns were added via SQL editor in production but not tracked in migrations.
-- Using ADD COLUMN IF NOT EXISTS so this is safe to run against both fresh and existing databases.

ALTER TABLE ops.deal_crew ADD COLUMN IF NOT EXISTS day_rate numeric;
ALTER TABLE ops.deal_crew ADD COLUMN IF NOT EXISTS dispatch_status text;
ALTER TABLE ops.deal_crew ADD COLUMN IF NOT EXISTS call_time text;
ALTER TABLE ops.deal_crew ADD COLUMN IF NOT EXISTS call_time_slot_id uuid;
ALTER TABLE ops.deal_crew ADD COLUMN IF NOT EXISTS arrival_location text;
ALTER TABLE ops.deal_crew ADD COLUMN IF NOT EXISTS notes text;
