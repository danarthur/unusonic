import { z } from 'zod';

// ── Document type (text + Zod, not a Postgres enum) ─────────────────────────

export const DOCUMENT_TYPES = [
  'coi',
  'w9',
  'rider',
  'contract',
  'license',
  'stage_plot',
  'tech_spec',
  'other',
] as const;

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  coi: 'Certificate of Insurance',
  w9: 'W-9',
  rider: 'Rider',
  contract: 'Contract',
  license: 'License / Permit',
  stage_plot: 'Stage Plot',
  tech_spec: 'Tech Specs',
  other: 'Other',
};

// ── Document status ─────────────────────────────────────────────────────────

export const DOCUMENT_STATUSES = ['active', 'superseded', 'archived'] as const;

export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

// ── Row shape (matches directory.entity_documents) ──────────────────────────

export type EntityDocumentRow = {
  id: string;
  entity_id: string;
  workspace_id: string;
  document_type: string;
  status: DocumentStatus;
  display_name: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  expires_at: string | null; // date string (YYYY-MM-DD)
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

// ── Content-type allowlist (enforced server-side) ───────────────────────────

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
