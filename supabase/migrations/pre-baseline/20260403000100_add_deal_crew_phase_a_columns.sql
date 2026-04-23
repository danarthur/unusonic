-- Phase A: Add department grouping + declined_at to deal_crew
ALTER TABLE ops.deal_crew
  ADD COLUMN IF NOT EXISTS department   text,
  ADD COLUMN IF NOT EXISTS declined_at  timestamptz;

CREATE INDEX IF NOT EXISTS deal_crew_department_idx ON ops.deal_crew (department) WHERE department IS NOT NULL;
