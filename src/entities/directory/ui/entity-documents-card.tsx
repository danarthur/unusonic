'use client';

import * as React from 'react';
import { useState, useEffect, useTransition, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Upload,
  Download,
  Trash2,
  ShieldCheck,
  FileImage,
  FileType,
  File,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
} from 'lucide-react';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { toast } from 'sonner';
import {
  getEntityDocuments,
  createDocumentUploadUrl,
  createEntityDocument,
  deleteEntityDocument,
  getDocumentDownloadUrl,
} from '@/features/network-data/api/entity-document-actions';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  type DocumentType,
  type EntityDocumentRow,
} from '@/entities/directory/model/entity-document-types';

// ── Props ───────────────────────────────────────────────────────────────────

type EntityDocumentsCardProps = {
  entityId: string;
  entityType: 'person' | 'company' | 'venue';
  workspaceId: string;
  readOnly?: boolean;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function getExpiryInfo(expiresAt: string | null): {
  label: string;
  color: string;
  icon: typeof CheckCircle2;
} | null {
  if (!expiresAt) return null;

  const now = new Date();
  const expiry = new Date(expiresAt + 'T00:00:00');
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `Expired ${formatDate(expiresAt)}`, color: 'oklch(0.65 0.2 25)', icon: AlertTriangle };
  }
  if (diffDays <= 30) {
    return { label: `Expires in ${diffDays}d`, color: 'oklch(0.75 0.15 75)', icon: Clock };
  }
  return { label: `Valid until ${formatDate(expiresAt)}`, color: 'oklch(0.7 0.15 145)', icon: CheckCircle2 };
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType === 'application/pdf') return FileText;
  if (mimeType.includes('word') || mimeType.includes('openxmlformats')) return FileType;
  return File;
}

function getTypeBadgeLabel(docType: string): string {
  return DOCUMENT_TYPE_LABELS[docType as DocumentType] ?? docType;
}

// ── Component ───────────────────────────────────────────────────────────────

export function EntityDocumentsCard({ entityId, entityType, workspaceId, readOnly }: EntityDocumentsCardProps) {
  const [documents, setDocuments] = useState<EntityDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType>('other');
  const [displayName, setDisplayName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');

  const fetchDocuments = useCallback(() => {
    getEntityDocuments(entityId).then((docs) => {
      setDocuments(docs);
      setLoading(false);
    });
  }, [entityId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const resetUploadForm = () => {
    setSelectedFile(null);
    setDocType('other');
    setDisplayName('');
    setExpiresAt('');
    setNotes('');
    setShowUploadForm(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation (UX guard, not security boundary)
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Maximum is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`);
      return;
    }
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error('This file type is not allowed. Upload PDF, images, Word documents, or plain text.');
      return;
    }

    setSelectedFile(file);
    if (!displayName) setDisplayName(file.name);
    setShowUploadForm(true);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);

    try {
      // Step 1: Get presigned URL
      const urlResult = await createDocumentUploadUrl({
        entityId,
        workspaceId,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        contentType: selectedFile.type,
      });

      if (!urlResult.ok) {
        toast.error(urlResult.error);
        setUploading(false);
        return;
      }

      // Step 2: Upload file directly to storage via signed URL
      const uploadRes = await fetch(urlResult.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.type },
        body: selectedFile,
      });

      if (!uploadRes.ok) {
        toast.error('Upload failed. Try again.');
        setUploading(false);
        return;
      }

      // Step 3: Create metadata row
      const docResult = await createEntityDocument({
        entityId,
        workspaceId,
        documentType: docType,
        displayName: displayName || selectedFile.name,
        storagePath: urlResult.path,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type,
        expiresAt: expiresAt || null,
        notes: notes || null,
      });

      if (!docResult.ok) {
        toast.error(docResult.error);
        setUploading(false);
        return;
      }

      toast.success('Document uploaded');
      resetUploadForm();
      fetchDocuments();
    } catch (err) {
      console.error('[entity-documents] upload error:', err);
      toast.error('Upload failed unexpectedly.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (docId: string) => {
    startTransition(async () => {
      const result = await deleteEntityDocument(docId);
      if (result.ok) {
        toast.success('Document removed');
        setDeleteConfirm(null);
        fetchDocuments();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDownload = async (storagePath: string, fileName: string) => {
    const result = await getDocumentDownloadUrl(storagePath);
    if (result.ok) {
      const a = document.createElement('a');
      a.href = result.url;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <section
      className="stage-panel rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--stage-surface)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: 'oklch(1 0 0 / 0.08)' }}
      >
        <div className="flex items-center" style={{ gap: '8px' }}>
          <ShieldCheck size={16} style={{ color: 'var(--stage-text-secondary)' }} aria-hidden />
          <h3
            className="text-xs font-medium uppercase tracking-widest"
            style={{ color: 'var(--stage-text-secondary)' }}
          >
            Documents
          </h3>
          {documents.length > 0 && (
            <span
              className="text-xs tabular-nums"
              style={{ color: 'var(--stage-text-tertiary)' }}
            >
              ({documents.length})
            </span>
          )}
        </div>
        {!readOnly && (
          <label
            className="flex items-center gap-1.5 text-xs font-medium cursor-pointer rounded-md px-2.5 py-1.5 transition-colors"
            style={{
              color: 'var(--stage-text-secondary)',
              backgroundColor: 'oklch(1 0 0 / 0.05)',
            }}
          >
            <Upload size={14} aria-hidden />
            Upload
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt"
              onChange={handleFileSelect}
            />
          </label>
        )}
      </div>

      {/* Upload form */}
      <AnimatePresence>
        {showUploadForm && selectedFile && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden"
          >
            <div
              className="px-5 py-4 space-y-3 border-b"
              style={{
                borderColor: 'oklch(1 0 0 / 0.08)',
                backgroundColor: 'oklch(1 0 0 / 0.02)',
              }}
            >
              <div className="flex items-center justify-between">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: 'var(--stage-text-primary)' }}
                >
                  {selectedFile.name}
                  <span
                    className="ml-2 text-xs"
                    style={{ color: 'var(--stage-text-tertiary)' }}
                  >
                    {formatBytes(selectedFile.size)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={resetUploadForm}
                  className="p-1 rounded-md transition-colors"
                  style={{ color: 'var(--stage-text-tertiary)' }}
                  aria-label="Cancel upload"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="stage-label text-[var(--stage-text-tertiary)]"
                  >
                    Display name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-1 w-full rounded-lg px-3 py-1.5 text-sm border focus-visible:outline-none focus-visible:ring-2"
                    style={{
                      backgroundColor: 'oklch(1 0 0 / 0.05)',
                      borderColor: 'oklch(1 0 0 / 0.08)',
                      color: 'var(--stage-text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label
                    className="stage-label text-[var(--stage-text-tertiary)]"
                  >
                    Document type
                  </label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as DocumentType)}
                    className="mt-1 w-full rounded-lg px-3 py-1.5 text-sm border focus-visible:outline-none focus-visible:ring-2"
                    style={{
                      backgroundColor: 'oklch(1 0 0 / 0.05)',
                      borderColor: 'oklch(1 0 0 / 0.08)',
                      color: 'var(--stage-text-primary)',
                    }}
                  >
                    {DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {DOCUMENT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Expiry field — show for types that typically expire */}
              {(docType === 'coi' || docType === 'license' || docType === 'contract') && (
                <div>
                  <label
                    className="stage-label text-[var(--stage-text-tertiary)]"
                  >
                    Expires
                  </label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="mt-1 w-full rounded-lg px-3 py-1.5 text-sm border focus-visible:outline-none focus-visible:ring-2"
                    style={{
                      backgroundColor: 'oklch(1 0 0 / 0.05)',
                      borderColor: 'oklch(1 0 0 / 0.08)',
                      color: 'var(--stage-text-primary)',
                    }}
                  />
                </div>
              )}

              <div>
                <label
                  className="stage-label text-[var(--stage-text-tertiary)]"
                >
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Additional insured: Venue ABC"
                  className="mt-1 w-full rounded-lg px-3 py-1.5 text-sm border focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    backgroundColor: 'oklch(1 0 0 / 0.05)',
                    borderColor: 'oklch(1 0 0 / 0.08)',
                    color: 'var(--stage-text-primary)',
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || !displayName}
                className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-45"
                style={{
                  backgroundColor: 'oklch(1 0 0 / 0.1)',
                  color: 'var(--stage-text-primary)',
                  border: '1px solid oklch(1 0 0 / 0.12)',
                }}
              >
                <Upload size={14} aria-hidden />
                {uploading ? 'Uploading...' : 'Upload document'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document list */}
      <div className="px-5 py-4">
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--stage-text-tertiary)' }}>
            Loading documents...
          </p>
        ) : documents.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--stage-text-tertiary)' }}>
            No documents on file. Upload a COI, W-9, rider, or other document.
          </p>
        ) : (
          <div className="flex flex-col" style={{ gap: '6px' }}>
            {documents.map((doc, idx) => {
              const FileIcon = getFileIcon(doc.mime_type);
              const expiry = getExpiryInfo(doc.expires_at);

              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...STAGE_LIGHT, delay: idx * 0.02 }}
                  className="flex items-center rounded-lg px-3 py-2.5 transition-colors"
                  style={{
                    gap: '10px',
                    backgroundColor: 'oklch(1 0 0 / 0.03)',
                    borderRadius: 'var(--stage-radius-nested, 8px)',
                  }}
                >
                  {/* File icon */}
                  <FileIcon
                    size={16}
                    className="shrink-0"
                    style={{ color: 'var(--stage-text-tertiary)' }}
                    aria-hidden
                  />

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: 'var(--stage-text-primary)' }}
                      >
                        {doc.display_name}
                      </p>
                      <span
                        className="inline-flex items-center shrink-0 rounded-full px-2 py-0.5 stage-badge-text uppercase tracking-wider"
                        style={{
                          backgroundColor: 'oklch(1 0 0 / 0.06)',
                          color: 'var(--stage-text-tertiary)',
                        }}
                      >
                        {getTypeBadgeLabel(doc.document_type)}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-2 mt-0.5 text-xs"
                      style={{ color: 'var(--stage-text-tertiary)' }}
                    >
                      <span>{formatDate(doc.created_at)}</span>
                      {doc.file_size && <span>{formatBytes(doc.file_size)}</span>}
                      {expiry && (
                        <span className="inline-flex items-center gap-1" style={{ color: expiry.color }}>
                          <expiry.icon size={11} aria-hidden />
                          {expiry.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center shrink-0" style={{ gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => handleDownload(doc.storage_path, doc.display_name)}
                      className="p-1.5 rounded-md transition-colors hover:bg-[oklch(1_0_0_/_0.08)]"
                      style={{ color: 'var(--stage-text-tertiary)' }}
                      aria-label={`Download ${doc.display_name}`}
                    >
                      <Download size={14} />
                    </button>
                    {!readOnly && (
                      <>
                        {deleteConfirm === doc.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(doc.id)}
                              disabled={isPending}
                              className="px-2 py-1 rounded text-label font-medium transition-colors"
                              style={{
                                color: 'oklch(0.65 0.2 25)',
                                backgroundColor: 'oklch(0.65 0.2 25 / 0.12)',
                              }}
                            >
                              {isPending ? '...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(null)}
                              className="p-1 rounded-md transition-colors"
                              style={{ color: 'var(--stage-text-tertiary)' }}
                              aria-label="Cancel delete"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(doc.id)}
                            className="p-1.5 rounded-md transition-colors hover:bg-[oklch(1_0_0_/_0.08)]"
                            style={{ color: 'var(--stage-text-tertiary)' }}
                            aria-label={`Delete ${doc.display_name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
