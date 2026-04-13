'use server';

import 'server-only';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  documentTypeSchema,
  type EntityDocumentRow,
} from '@/entities/directory/model/entity-document-types';

// ── Helpers ─────────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid();

/** Sanitize a filename for storage paths — strip problematic characters. */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 200);
}

function isAllowedMimeType(contentType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(contentType);
}

// ── createDocumentUploadUrl ─────────────────────────────────────────────────

const uploadUrlSchema = z.object({
  entityId: uuidSchema,
  workspaceId: uuidSchema,
  fileName: z.string().min(1).max(300),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
  contentType: z.string().min(1),
});

export async function createDocumentUploadUrl(input: {
  entityId: string;
  workspaceId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}): Promise<{ ok: true; signedUrl: string; token: string; path: string } | { ok: false; error: string }> {
  const parsed = uploadUrlSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input: ' + parsed.error.issues.map((i) => i.message).join(', ') };
  }
  const { entityId, workspaceId, fileName, fileSize, contentType } = parsed.data;

  // Validate content type
  if (!isAllowedMimeType(contentType)) {
    return { ok: false, error: `File type "${contentType}" is not allowed. Upload PDF, images, Word documents, or plain text.` };
  }

  const supabase = await createClient();

  // Validate workspace membership (RLS will enforce, but fail early with a clear message)
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { ok: false, error: 'You do not have access to this workspace.' };
  }

  // Validate entity belongs to workspace
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('id', entityId)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();

  if (!entity) {
    return { ok: false, error: 'Entity not found in this workspace.' };
  }

  // Construct storage path (server-side only — never trust client path segments)
  const timestamp = Date.now();
  const sanitized = sanitizeFileName(fileName);
  const path = `${workspaceId}/entities/${entityId}/documents/${timestamp}-${sanitized}`;

  // Generate presigned upload URL
  const { data, error } = await supabase.storage
    .from('workspace-files')
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error('[entity-documents] createSignedUploadUrl failed:', error?.message);
    return { ok: false, error: 'Failed to generate upload URL. Try again.' };
  }

  return { ok: true, signedUrl: data.signedUrl, token: data.token, path };
}

// ── createEntityDocument ────────────────────────────────────────────────────

const createDocSchema = z.object({
  entityId: uuidSchema,
  workspaceId: uuidSchema,
  documentType: documentTypeSchema,
  displayName: z.string().min(1).max(500),
  storagePath: z.string().min(1),
  fileSize: z.number().int().nonnegative().nullable(),
  mimeType: z.string().nullable(),
  expiresAt: z.string().nullable(), // ISO date string or null
  notes: z.string().max(2000).nullable(),
});

export async function createEntityDocument(input: {
  entityId: string;
  workspaceId: string;
  documentType: string;
  displayName: string;
  storagePath: string;
  fileSize: number | null;
  mimeType: string | null;
  expiresAt: string | null;
  notes: string | null;
}): Promise<{ ok: true; document: EntityDocumentRow } | { ok: false; error: string }> {
  const parsed = createDocSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input: ' + parsed.error.issues.map((i) => i.message).join(', ') };
  }
  const { entityId, workspaceId, documentType, displayName, storagePath, fileSize, mimeType, expiresAt, notes } = parsed.data;

  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  // If document type is COI, auto-supersede previous active COIs for this entity
  if (documentType === 'coi') {
    const { error: supersededErr } = await supabase
      .schema('directory')
      .from('entity_documents')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('entity_id', entityId)
      .eq('document_type', 'coi')
      .eq('status', 'active');

    if (supersededErr) {
      console.error('[entity-documents] Failed to supersede old COIs:', supersededErr.message);
      // Non-fatal — continue with insert
    }
  }

  const { data, error } = await supabase
    .schema('directory')
    .from('entity_documents')
    .insert({
      entity_id: entityId,
      workspace_id: workspaceId,
      document_type: documentType,
      display_name: displayName,
      storage_path: storagePath,
      file_size: fileSize,
      mime_type: mimeType,
      expires_at: expiresAt,
      notes,
      uploaded_by: user?.id ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('[entity-documents] insert failed:', error?.message);
    return { ok: false, error: 'Failed to save document metadata.' };
  }

  return { ok: true, document: data as EntityDocumentRow };
}

// ── deleteEntityDocument (soft delete) ──────────────────────────────────────

export async function deleteEntityDocument(
  documentId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = uuidSchema.safeParse(documentId);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid document ID.' };
  }

  const supabase = await createClient();

  // Fetch the document to get storage path
  const { data: doc } = await supabase
    .schema('directory')
    .from('entity_documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .maybeSingle();

  if (!doc) {
    return { ok: false, error: 'Document not found.' };
  }

  // Soft delete: set status to archived
  const { error } = await supabase
    .schema('directory')
    .from('entity_documents')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', documentId);

  if (error) {
    console.error('[entity-documents] archive failed:', error.message);
    return { ok: false, error: 'Failed to delete document.' };
  }

  // Optionally remove storage object (non-fatal if it fails)
  try {
    await supabase.storage.from('workspace-files').remove([doc.storage_path]);
  } catch (e) {
    console.warn('[entity-documents] storage cleanup failed (non-fatal):', e);
  }

  return { ok: true };
}

// ── getEntityDocuments ──────────────────────────────────────────────────────

export async function getEntityDocuments(
  entityId: string
): Promise<EntityDocumentRow[]> {
  const parsed = uuidSchema.safeParse(entityId);
  if (!parsed.success) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('directory')
    .from('entity_documents')
    .select('*')
    .eq('entity_id', entityId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[entity-documents] getEntityDocuments failed:', error.message);
    return [];
  }

  return (data ?? []) as EntityDocumentRow[];
}

// ── getCoiStatus ────────────────────────────────────────────────────────────

export type CoiStatus = {
  hasDocument: boolean;
  expiresAt: string | null; // ISO date string
};

export async function getCoiStatus(entityId: string): Promise<CoiStatus> {
  const parsed = uuidSchema.safeParse(entityId);
  if (!parsed.success) return { hasDocument: false, expiresAt: null };

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('directory')
    .from('entity_documents')
    .select('expires_at')
    .eq('entity_id', entityId)
    .eq('document_type', 'coi')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { hasDocument: false, expiresAt: null };
  }

  return { hasDocument: true, expiresAt: data.expires_at };
}

// ── getDocumentDownloadUrl ──────────────────────────────────────────────────

export async function getDocumentDownloadUrl(
  storagePath: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!storagePath) return { ok: false, error: 'No storage path.' };

  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from('workspace-files')
    .createSignedUrl(storagePath, 60 * 5); // 5 minute expiry

  if (error || !data?.signedUrl) {
    console.error('[entity-documents] download URL failed:', error?.message);
    return { ok: false, error: 'Failed to generate download link.' };
  }

  return { ok: true, url: data.signedUrl };
}
