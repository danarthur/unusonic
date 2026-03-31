'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Trash2, Plus, Paperclip, X, FileText, Image as ImageIcon, File, Pin, PinOff, Pencil, Check } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import { createBrowserClient } from '@supabase/ssr';
import {
  getDealNotes,
  addDealNote,
  deleteDealNote,
  editDealNote,
  togglePinNote,
  getAttachmentUrl,
  type DealNoteEntry,
  type DealNoteAttachment,
} from '../actions/deal-notes';

const BUCKET = 'deal-attachments';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// =============================================================================
// Helpers
// =============================================================================

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith('image/')) return ImageIcon;
  if (type === 'application/pdf') return FileText;
  return File;
}

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// =============================================================================
// AttachmentPill + ImageThumb
// =============================================================================

function AttachmentDisplay({ attachment, noteDate }: { attachment: DealNoteAttachment; noteDate?: string }) {
  const [loading, setLoading] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const isImage = attachment.type.startsWith('image/');
  const Icon = fileIcon(attachment.type);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    getAttachmentUrl(attachment.path).then((r) => {
      if (!cancelled && r.url) setThumbUrl(r.url);
    });
    return () => { cancelled = true; };
  }, [attachment.path, isImage]);

  const handleClick = async () => {
    if (thumbUrl) { window.open(thumbUrl, '_blank'); return; }
    setLoading(true);
    const result = await getAttachmentUrl(attachment.path);
    setLoading(false);
    if (result.url) window.open(result.url, '_blank');
    else toast.error('Could not open file');
  };

  if (isImage && thumbUrl) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="flex flex-col overflow-hidden transition-opacity hover:opacity-90"
        style={{
          borderRadius: 'var(--stage-radius-nested, 8px)',
          background: 'oklch(0.30 0.004 50)',
          boxShadow: 'inset 0 1px 0 0 oklch(1 0 0 / 0.10)',
        }}
      >
        <img
          src={thumbUrl}
          alt={attachment.name}
          className="h-14 max-w-[140px] object-cover"
          loading="lazy"
        />
        <div
          className="flex items-center gap-1 px-2 py-1 w-full"
          style={{ fontSize: 'var(--stage-label-size, 11px)', color: 'var(--stage-text-secondary)' }}
        >
          <ImageIcon size={10} className="shrink-0" />
          <span className="truncate">{attachment.name}</span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-2 max-w-[240px] transition-colors disabled:opacity-45"
      style={{
        padding: '6px 10px',
        borderRadius: 'var(--stage-radius-nested, 8px)',
        background: 'oklch(0.30 0.004 50)',
        fontSize: 'var(--stage-label-size, 11px)',
        color: 'var(--stage-text-secondary)',
        boxShadow: 'inset 0 1px 0 0 oklch(1 0 0 / 0.10)',
      }}
    >
      <Icon size={14} className="shrink-0" style={{ color: 'var(--stage-text-tertiary)' }} />
      <div className="flex flex-col items-start min-w-0">
        <span className="truncate w-full font-medium" style={{ color: 'var(--stage-text-primary)' }}>{attachment.name}</span>
        <span style={{ color: 'var(--stage-text-tertiary)' }}>
          {formatFileSize(attachment.size)}
          {noteDate && <> · {formatRelative(noteDate)}</>}
        </span>
      </div>
    </button>
  );
}

// =============================================================================
// StagedFile
// =============================================================================

type StagedFile = { id: string; file: globalThis.File };

function StagedFilePill({ staged, onRemove }: { staged: StagedFile; onRemove: () => void }) {
  const Icon = fileIcon(staged.file.type);
  return (
    <div
      className="inline-flex items-center gap-2 max-w-[220px]"
      style={{
        padding: '6px 10px',
        borderRadius: 'var(--stage-radius-nested, 8px)',
        background: 'oklch(0.30 0.004 50)',
        boxShadow: 'inset 0 1px 0 0 oklch(1 0 0 / 0.10)',
        fontSize: 'var(--stage-label-size, 11px)',
        color: 'var(--stage-text-secondary)',
      }}
    >
      <Icon size={14} className="shrink-0" style={{ color: 'var(--stage-text-tertiary)' }} />
      <div className="flex flex-col items-start min-w-0">
        <span className="truncate w-full font-medium" style={{ color: 'var(--stage-text-primary)' }}>{staged.file.name}</span>
        <span style={{ color: 'var(--stage-text-tertiary)' }}>{formatFileSize(staged.file.size)}</span>
      </div>
      <button type="button" onClick={onRemove} className="shrink-0 p-0.5 rounded-full hover:text-[var(--stage-text-primary)] transition-colors" aria-label={`Remove ${staged.file.name}`}>
        <X size={12} />
      </button>
    </div>
  );
}

// =============================================================================
// NoteRow
// =============================================================================

function NoteRow({
  note,
  onDelete,
  onEdit,
  onTogglePin,
  compact = false,
}: {
  note: DealNoteEntry;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, content: string) => void;
  onTogglePin?: (id: string, pin: boolean) => void;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(note.content);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const isPinned = !!note.pinned_at;

  const initials = note.author_name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
      editRef.current.style.height = 'auto';
      editRef.current.style.height = `${Math.min(editRef.current.scrollHeight, 160)}px`;
    }
  }, [editing]);

  const handleEditSave = () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === note.content) { setEditing(false); return; }
    onEdit?.(note.id, trimmed);
    setEditing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={STAGE_LIGHT}
      className={cn(
        'group/note flex py-2.5',
        'border-b border-[var(--stage-edge-subtle)] last:border-0',
      )}
      style={{
        gap: 'var(--stage-gap, 6px)',
        ...(isPinned ? { background: 'color-mix(in oklch, var(--color-unusonic-warning) 4%, transparent)', marginLeft: '-8px', marginRight: '-8px', paddingLeft: '8px', paddingRight: '8px', borderRadius: 'var(--stage-radius-nested, 8px)' } : {}),
      }}
    >
      {/* Avatar */}
      <div className="size-6 shrink-0 rounded-full flex items-center justify-center overflow-hidden bg-[oklch(1_0_0_/_0.08)]">
        {note.author_avatar_url ? (
          <img src={note.author_avatar_url} className="size-6 rounded-full object-cover" alt="" loading="lazy" />
        ) : (
          <span className="text-[9px] font-medium text-[var(--stage-text-secondary)]">{initials}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="stage-label font-medium" style={{ color: 'var(--stage-text-secondary)' }}>
            {note.author_name}
          </span>
          <span className="stage-label" style={{ color: 'var(--stage-text-tertiary)' }}>
            {compact ? formatRelative(note.created_at) : formatFull(note.created_at)}
          </span>
          {isPinned && (
            <Pin size={10} className="shrink-0" style={{ color: 'var(--color-unusonic-warning)' }} />
          )}
        </div>

        {editing ? (
          <div className="mt-1">
            <textarea
              ref={editRef}
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
                if (e.key === 'Escape') { setEditing(false); setEditValue(note.content); }
              }}
              className="w-full resize-none bg-transparent text-[var(--stage-text-primary)] leading-relaxed py-1 outline-none"
              style={{
                fontSize: 'var(--stage-input-font-size, 13px)',
                borderBottom: '1px solid var(--stage-accent)',
              }}
            />
            <div className="flex items-center gap-2 mt-1">
              <button type="button" onClick={handleEditSave} className="stage-label flex items-center gap-1" style={{ color: 'var(--stage-text-secondary)' }}>
                <Check size={10} /> Save
              </button>
              <button type="button" onClick={() => { setEditing(false); setEditValue(note.content); }} className="stage-label" style={{ color: 'var(--stage-text-tertiary)' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p
            className={cn(
              'text-[var(--stage-text-primary)] leading-relaxed whitespace-pre-wrap break-words mt-0.5',
              compact && 'line-clamp-2',
            )}
            style={{ fontSize: 'var(--stage-input-font-size, 13px)' }}
          >
            {note.content}
          </p>
        )}

        {/* Attachments */}
        {note.attachments.length > 0 && !editing && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {note.attachments.map((a, i) => (
              <AttachmentDisplay key={`${a.path}-${i}`} attachment={a} noteDate={note.created_at} />
            ))}
          </div>
        )}
      </div>

      {/* Actions — revealed on hover */}
      {!editing && (
        <div
          className="shrink-0 flex items-center opacity-0 group-hover/note:opacity-100 transition-opacity"
          style={{
            gap: '2px',
            padding: '2px',
            borderRadius: 'var(--stage-radius-nested, 8px)',
            background: 'var(--stage-surface-raised)',
          }}
        >
          {onTogglePin && (
            <button
              type="button"
              onClick={() => onTogglePin(note.id, !isPinned)}
              className="p-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              style={{ color: isPinned ? 'var(--color-unusonic-warning)' : 'var(--stage-text-tertiary)' }}
              title={isPinned ? 'Unpin' : 'Pin'}
            >
              {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
          )}
          {note.is_own && onEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-md text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              title="Edit"
            >
              <Pencil size={14} />
            </button>
          )}
          {note.is_own && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(note.id)}
              className="p-1.5 rounded-md text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// =============================================================================
// ComposeBar with drag-and-drop
// =============================================================================

function ComposeBar({
  dealId,
  workspaceId,
  onSubmit,
  onBlurEmpty,
  initialFiles,
}: {
  dealId: string;
  workspaceId: string;
  onSubmit: (content: string, attachments: DealNoteAttachment[]) => Promise<void>;
  onBlurEmpty?: () => void;
  initialFiles?: globalThis.File[];
}) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>(() =>
    (initialFiles ?? []).map((f) => ({ id: `${Date.now()}-${Math.random()}-${f.name}`, file: f }))
  );
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const addFiles = (files: FileList | globalThis.File[]) => {
    const arr = Array.from(files);
    const newStaged: StagedFile[] = [];
    for (const file of arr) {
      if (file.size > MAX_FILE_SIZE) { toast.error(`${file.name} exceeds 50MB limit`); continue; }
      newStaged.push({ id: `${Date.now()}-${Math.random()}-${file.name}`, file });
    }
    setStagedFiles((prev) => [...prev, ...newStaged]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (composeRef.current?.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if ((!trimmed && stagedFiles.length === 0) || submitting) return;
    setSubmitting(true);

    const uploadedAttachments: DealNoteAttachment[] = [];
    if (stagedFiles.length > 0) {
      const supabase = getSupabase();
      for (const staged of stagedFiles) {
        const safeName = staged.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${workspaceId}/${dealId}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, staged.file, { upsert: false });
        if (uploadError) { console.error('[diary] upload error:', uploadError.message, 'path:', path); toast.error(`Failed to upload ${staged.file.name}: ${uploadError.message}`); continue; }
        const ext = staged.file.name.split('.').pop() ?? '';
        uploadedAttachments.push({
          name: staged.file.name,
          path,
          size: staged.file.size,
          type: staged.file.type || `application/${ext}`,
        });
      }
    }

    const noteContent = trimmed || (uploadedAttachments.length > 0 ? 'Attached files' : '');
    await onSubmit(noteContent, uploadedAttachments);
    setSubmitting(false);
    setValue('');
    setStagedFiles([]);
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (composeRef.current?.contains(e.relatedTarget as Node)) return;
    if (!value.trim() && stagedFiles.length === 0 && onBlurEmpty) onBlurEmpty();
  };

  const canSubmit = (value.trim().length > 0 || stagedFiles.length > 0) && !submitting;

  return (
    <div
      ref={composeRef}
      onBlur={handleBlur}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{
        paddingTop: 'var(--stage-gap-wide, 12px)',
        borderTop: '1px solid var(--stage-edge-subtle)',
      }}
    >

      {/* Staged files */}
      {stagedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 'var(--stage-gap, 6px)' }}>
          {stagedFiles.map((s) => (
            <StagedFilePill key={s.id} staged={s} onRemove={() => setStagedFiles((prev) => prev.filter((f) => f.id !== s.id))} />
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            if (e.key === 'Escape' && !value.trim() && stagedFiles.length === 0 && onBlurEmpty) onBlurEmpty();
          }}
          placeholder={stagedFiles.length > 0 ? 'Add a caption…' : 'Add a note…'}
          rows={1}
          className="flex-1 resize-none bg-transparent text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] leading-relaxed py-1 outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]"
          style={{ fontSize: 'var(--stage-input-font-size, 13px)' }}
        />

        <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={handleFileSelect} className="hidden" />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 size-7 rounded-full flex items-center justify-center transition-colors bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]"
          aria-label="Attach file"
        >
          <Paperclip className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'shrink-0 flex items-center justify-center gap-1.5 transition-colors duration-75',
            canSubmit
              ? 'stage-btn stage-btn-primary'
              : 'size-7 rounded-full bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-tertiary)]',
          )}
          style={canSubmit ? { height: 'var(--stage-input-height, 34px)' } : undefined}
          aria-label="Save note"
        >
          {canSubmit && <span>Save</span>}
          <ArrowUp className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// DealDiaryCard
// =============================================================================

export type DealDiaryCardProps = {
  dealId: string;
  dealTitle?: string | null;
  workspaceId: string;
  /** Filter notes to a specific phase. Null/undefined = show all. */
  phaseTag?: 'deal' | 'plan' | 'ledger' | 'general' | null;
};

const COMPACT_LIMIT = 3;

export function DealDiaryCard({ dealId, workspaceId, phaseTag }: DealDiaryCardProps) {
  const [notes, setNotes] = useState<DealNoteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  const [cardDragOver, setCardDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<globalThis.File[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);

  const fetchNotes = useCallback(async () => {
    const entries = await getDealNotes(dealId, phaseTag);
    setNotes(entries);
    setLoading(false);
  }, [dealId, phaseTag]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const handleAdd = async (content: string, attachments: DealNoteAttachment[]) => {
    const optimisticNote: DealNoteEntry = {
      id: `optimistic-${Date.now()}`,
      content,
      created_at: new Date().toISOString(),
      author_name: 'You',
      author_avatar_url: null,
      is_own: true,
      attachments,
      pinned_at: null,
      phase_tag: phaseTag ?? 'general',
    };
    setNotes((prev) => [optimisticNote, ...prev]);
    const result = await addDealNote(dealId, content, attachments.length > 0 ? attachments : undefined, phaseTag ?? undefined);
    if (result.success) { await fetchNotes(); }
    else { setNotes((prev) => prev.filter((n) => n.id !== optimisticNote.id)); toast.error(result.error); }
  };

  const handleDelete = async (noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    const result = await deleteDealNote(noteId);
    if (!result.success) { await fetchNotes(); toast.error(result.error); }
  };

  const handleEdit = async (noteId: string, content: string) => {
    setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, content } : n));
    const result = await editDealNote(noteId, content);
    if (!result.success) { await fetchNotes(); toast.error(result.error); }
  };

  const handleTogglePin = async (noteId: string, pin: boolean) => {
    setNotes((prev) => {
      const updated = prev.map((n) => n.id === noteId ? { ...n, pinned_at: pin ? new Date().toISOString() : null } : n);
      // Re-sort: pinned first
      updated.sort((a, b) => {
        if (a.pinned_at && !b.pinned_at) return -1;
        if (!a.pinned_at && b.pinned_at) return 1;
        return 0;
      });
      return updated;
    });
    const result = await togglePinNote(noteId, pin);
    if (!result.success) { await fetchNotes(); toast.error(result.error); }
  };

  const displayNotes = expanded ? notes : notes.slice(0, COMPACT_LIMIT);
  const hasMore = notes.length > COMPACT_LIMIT;

  const handleCardDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setCardDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter((f) => {
        if (f.size > MAX_FILE_SIZE) { toast.error(`${f.name} exceeds 50MB limit`); return false; }
        return true;
      });
      if (files.length > 0) {
        setDroppedFiles(files);
        setComposing(true);
      }
    }
  };

  const handleCardDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setCardDragOver(true);
  };

  const handleCardDragLeave = (e: React.DragEvent) => {
    if (cardRef.current?.contains(e.relatedTarget as Node)) return;
    setCardDragOver(false);
  };

  return (
    <div
      ref={cardRef}
      onDrop={handleCardDrop}
      onDragOver={handleCardDragOver}
      onDragLeave={handleCardDragLeave}
    >
    <StagePanel
      elevated
      style={{
        padding: 'var(--stage-padding, 16px)',
        ...(cardDragOver ? {
          background: 'var(--stage-surface-raised)',
        } : {}),
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 'var(--stage-gap, 6px)' }}>
        <p className="stage-label" style={{ color: 'var(--stage-text-secondary)' }}>
          Notes
          {notes.length > 0 && (
            <span style={{ color: 'var(--stage-text-tertiary)' }}> · {notes.length}</span>
          )}
        </p>
        {!composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex items-center gap-1.5 transition-colors"
            style={{
              fontSize: 'var(--stage-label-size, 11px)',
              fontWeight: 500,
              color: 'var(--stage-text-secondary)',
              padding: '4px 10px 4px 8px',
              borderRadius: 'var(--stage-radius-pill)',
              background: 'oklch(1 0 0 / 0.06)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'oklch(1 0 0 / 0.12)';
              e.currentTarget.style.color = 'var(--stage-text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'oklch(1 0 0 / 0.06)';
              e.currentTarget.style.color = 'var(--stage-text-secondary)';
            }}
          >
            <Plus size={14} /> Add note
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 6px)' }}>
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-2">
              <div className="size-6 shrink-0 rounded-full stage-skeleton" />
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="h-2.5 w-20 rounded stage-skeleton" />
                <div className="h-3.5 rounded stage-skeleton" />
              </div>
            </div>
          ))}
        </div>
      ) : displayNotes.length > 0 ? (
        <div
          className={cn(expanded && 'max-h-[300px] overflow-y-auto pr-0.5')}
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'oklch(1 0 0 / 0.10) transparent' }}
        >
          <AnimatePresence initial={false}>
            {displayNotes.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onTogglePin={handleTogglePin}
                compact={!expanded}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : !composing ? (
        <p className="stage-label py-3" style={{ color: 'var(--stage-text-tertiary)' }}>No notes yet</p>
      ) : null}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="stage-label transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-sm"
          style={{ color: 'var(--stage-text-tertiary)', marginTop: 'var(--stage-gap, 6px)' }}
        >
          {expanded ? 'Show less' : `${notes.length - COMPACT_LIMIT} more…`}
        </button>
      )}

      <AnimatePresence>
        {composing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            className="overflow-hidden"
            style={{ marginTop: 'var(--stage-gap, 6px)' }}
          >
            <ComposeBar
              dealId={dealId}
              workspaceId={workspaceId}
              initialFiles={droppedFiles.length > 0 ? droppedFiles : undefined}
              onSubmit={async (content, attachments) => {
                await handleAdd(content, attachments);
                setComposing(false);
                setDroppedFiles([]);
              }}
              onBlurEmpty={() => { setComposing(false); setDroppedFiles([]); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card-level drag indicator */}
      {cardDragOver && !composing && (
        <div className="stage-label text-center py-2" style={{ color: 'var(--stage-text-secondary)' }}>
          Drop to attach files
        </div>
      )}
    </StagePanel>
    </div>
  );
}
