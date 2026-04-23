ALTER TABLE ops.events
  ADD COLUMN IF NOT EXISTS show_day_contacts jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN ops.events.show_day_contacts IS
  'Show-day contacts: [{role, name, phone, email}]. Edited inline on Plan tab.';
