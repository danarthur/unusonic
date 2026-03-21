-- Phase 8B: Workspace call time rules
-- Rules define how crew members get assigned call times automatically when assigned to an event.
-- Matching order: entity-specific > role + archetype > role only > default

CREATE TABLE IF NOT EXISTS ops.workspace_call_time_rules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  -- Criteria
  role_patterns        text[] NOT NULL DEFAULT '{}',   -- ILIKE match against crew_item.role
  entity_ids           uuid[] NOT NULL DEFAULT '{}',   -- specific directory.entities — overrides role matching
  event_archetypes     text[] NOT NULL DEFAULT '{}',   -- [] = applies to all archetypes
  -- Action
  action_type          text NOT NULL DEFAULT 'slot' CHECK (action_type IN ('slot', 'offset')),
  slot_label           text,                           -- matches call_time_slots.label (ILIKE)
  offset_minutes       integer,                        -- negative = before event start
  -- Behaviour
  priority             integer NOT NULL DEFAULT 0,     -- higher number = higher priority
  apply_only_when_unset boolean NOT NULL DEFAULT true, -- if false, overwrites existing call time
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ops.workspace_call_time_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY call_time_rules_select ON ops.workspace_call_time_rules
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY call_time_rules_insert ON ops.workspace_call_time_rules
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY call_time_rules_update ON ops.workspace_call_time_rules
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY call_time_rules_delete ON ops.workspace_call_time_rules
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));
