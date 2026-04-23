-- Entity Documents table
-- Stores compliance documents (COIs, W-9s, riders, contracts, etc.) for any entity.
-- Single source of truth for COI expiry — no dual-write to entity attributes.

CREATE TABLE directory.entity_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       uuid NOT NULL REFERENCES directory.entities(id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_type   text NOT NULL DEFAULT 'other',      -- Validated in app layer via Zod
  status          text NOT NULL DEFAULT 'active',     -- 'active', 'superseded', 'archived'
  display_name    text NOT NULL,                      -- User-facing label
  storage_path    text NOT NULL,                      -- Full path in workspace-files bucket
  file_size       bigint,                             -- Bytes, for UI display
  mime_type       text,                               -- e.g. 'application/pdf'
  expires_at      date,                               -- Relevant for COIs, licenses
  notes           text,                               -- Optional user notes
  uploaded_by     uuid REFERENCES auth.users(id),     -- Who uploaded it
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_status CHECK (status IN ('active', 'superseded', 'archived'))
);

-- Indexes
CREATE INDEX idx_entity_documents_entity ON directory.entity_documents(entity_id);
CREATE INDEX idx_entity_documents_workspace ON directory.entity_documents(workspace_id);
CREATE INDEX idx_entity_documents_expiry ON directory.entity_documents(expires_at)
  WHERE expires_at IS NOT NULL AND status = 'active';
CREATE INDEX idx_entity_documents_type ON directory.entity_documents(workspace_id, document_type)
  WHERE status = 'active';
CREATE INDEX idx_entity_documents_active ON directory.entity_documents(entity_id, document_type)
  WHERE status = 'active';

-- RLS
ALTER TABLE directory.entity_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY entity_documents_select ON directory.entity_documents
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY entity_documents_insert ON directory.entity_documents
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY entity_documents_update ON directory.entity_documents
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY entity_documents_delete ON directory.entity_documents
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));
