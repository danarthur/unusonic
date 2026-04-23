-- Migration: create_catalog_item_assignees
-- Creates catalog.item_assignees junction table linking catalog packages to default assignee entities.
-- RLS is join-based through public.packages (no workspace_id column on this table).

CREATE SCHEMA IF NOT EXISTS catalog;
GRANT USAGE ON SCHEMA catalog TO authenticated;

CREATE TABLE catalog.item_assignees (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  uuid        NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  entity_id   uuid        NOT NULL, -- soft ref to directory.entities (ghost protocol — no FK)
  role_note   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX item_assignees_package_id_idx ON catalog.item_assignees (package_id);
CREATE INDEX item_assignees_entity_id_idx  ON catalog.item_assignees (entity_id);
CREATE UNIQUE INDEX item_assignees_package_entity_uniq ON catalog.item_assignees (package_id, entity_id);

ALTER TABLE catalog.item_assignees ENABLE ROW LEVEL SECURITY;

-- workspace scoped indirectly via public.packages.workspace_id
CREATE POLICY item_assignees_select ON catalog.item_assignees
  FOR SELECT USING (
    package_id IN (
      SELECT id FROM public.packages
      WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

CREATE POLICY item_assignees_insert ON catalog.item_assignees
  FOR INSERT WITH CHECK (
    package_id IN (
      SELECT id FROM public.packages
      WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

CREATE POLICY item_assignees_delete ON catalog.item_assignees
  FOR DELETE USING (
    package_id IN (
      SELECT id FROM public.packages
      WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

GRANT SELECT, INSERT, DELETE ON catalog.item_assignees TO authenticated;
