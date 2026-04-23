-- Enrich ops.entity_crew_schedule with venue address, deal_id, and pay rate
-- for the employee portal hero card and gig detail page.
-- Must drop + recreate because new columns change the column order.

DROP VIEW IF EXISTS ops.entity_crew_schedule;

CREATE VIEW ops.entity_crew_schedule
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
    ca.pay_rate,
    ca.pay_rate_type,
    ca.scheduled_hours,
    e.title            AS event_title,
    e.starts_at,
    e.ends_at,
    e.venue_name,
    e.venue_address,
    e.location_address,
    e.deal_id,
    e.event_archetype
  FROM ops.crew_assignments ca
  JOIN ops.events e ON e.id = ca.event_id;

GRANT SELECT ON ops.entity_crew_schedule TO authenticated;
