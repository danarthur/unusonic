-- Fix ops.entity_crew_schedule: recreate with security_invoker = true so the view
-- respects the querying user's RLS context (ops.crew_assignments + ops.events policies)
-- instead of running as the view creator.

CREATE OR REPLACE VIEW ops.entity_crew_schedule
  WITH (security_invoker = true)
AS
  SELECT
    ca.id              AS assignment_id,
    ca.entity_id,
    ca.event_id,
    ca.role,
    ca.status,
    ca.assignee_name,
    ca.call_time_slot_id,
    ca.call_time_override,
    ca.workspace_id,
    e.title            AS event_title,
    e.starts_at,
    e.ends_at,
    e.venue_name,
    e.event_archetype
  FROM ops.crew_assignments ca
  JOIN ops.events e ON e.id = ca.event_id;

GRANT SELECT ON ops.entity_crew_schedule TO authenticated;
