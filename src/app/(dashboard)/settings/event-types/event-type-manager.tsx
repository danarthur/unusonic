'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { Archive, ArchiveRestore, CheckCircle2, GitMerge, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import type { EventArchetypeRow } from '@/shared/lib/event-archetype';
import {
  archiveWorkspaceEventArchetype,
  listWorkspaceEventArchetypes,
  mergeWorkspaceEventArchetypes,
  renameWorkspaceEventArchetype,
  unarchiveWorkspaceEventArchetype,
} from '@/app/(dashboard)/(features)/crm/actions/event-archetype-actions';

/**
 * Admin screen for the event-archetype taxonomy. Shows active and archived
 * rows with deal counts, supports rename / archive / unarchive / merge-into.
 * Members see a similar read-only list when they open the combobox during
 * deal creation; this screen is gated to owner / admin.
 */
export function EventTypeManager({
  initialArchetypes,
  dealCountsBySlug,
}: {
  initialArchetypes: EventArchetypeRow[];
  dealCountsBySlug: Record<string, number>;
}) {
  const [rows, setRows] = useState<EventArchetypeRow[]>(initialArchetypes);
  const [showArchived, setShowArchived] = useState(false);

  const refresh = useCallback(async () => {
    const next = await listWorkspaceEventArchetypes();
    setRows(next);
  }, []);

  const activeRows = useMemo(() => rows.filter((r) => !r.archived_at), [rows]);
  const archivedRows = useMemo(() => rows.filter((r) => r.archived_at), [rows]);

  return (
    <div className="flex flex-col gap-4">
      <section
        data-surface="elevated"
        className="rounded-[var(--stage-radius-panel,12px)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-card)] overflow-hidden"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-[oklch(1_0_0_/_0.04)]">
          <h2 className="text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight text-[var(--stage-text-primary)]">
            Active types ({activeRows.length})
          </h2>
        </header>
        <ul className="divide-y divide-[oklch(1_0_0_/_0.04)]">
          {activeRows.map((r) => (
            <TypeRow
              key={r.id}
              row={r}
              count={dealCountsBySlug[r.slug] ?? 0}
              activeRows={activeRows}
              onChanged={refresh}
            />
          ))}
        </ul>
      </section>

      {archivedRows.length > 0 && (
        <section
          data-surface="elevated"
          className="rounded-[var(--stage-radius-panel,12px)] border border-[oklch(1_0_0_/_0.06)] bg-[var(--ctx-card)] overflow-hidden"
        >
          <header className="flex items-center justify-between px-4 py-3 border-b border-[oklch(1_0_0_/_0.04)]">
            <button
              type="button"
              onClick={() => setShowArchived((o) => !o)}
              className="text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]"
            >
              {showArchived ? 'Hide' : 'Show'} archived ({archivedRows.length})
            </button>
          </header>
          {showArchived && (
            <ul className="divide-y divide-[oklch(1_0_0_/_0.04)]">
              {archivedRows.map((r) => (
                <TypeRow
                  key={r.id}
                  row={r}
                  count={dealCountsBySlug[r.slug] ?? 0}
                  activeRows={activeRows}
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function TypeRow({
  row,
  count,
  activeRows,
  onChanged,
}: {
  row: EventArchetypeRow;
  count: number;
  activeRows: EventArchetypeRow[];
  onChanged: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'idle' | 'rename' | 'merge'>('idle');
  const [labelDraft, setLabelDraft] = useState(row.label);
  const [mergeTarget, setMergeTarget] = useState<string>('');
  const [pending, startTransition] = useTransition();

  const isArchived = !!row.archived_at;

  const handleRename = () => {
    const trimmed = labelDraft.trim();
    if (!trimmed || trimmed === row.label) {
      setMode('idle');
      return;
    }
    startTransition(async () => {
      const res = await renameWorkspaceEventArchetype(row.slug, trimmed);
      if (!res.success) {
        toast.error(res.error ?? 'Could not rename.');
        return;
      }
      await onChanged();
      toast.success('Renamed');
      setMode('idle');
    });
  };

  const handleArchive = () => {
    startTransition(async () => {
      const res = await archiveWorkspaceEventArchetype(row.slug);
      if (!res.success) {
        toast.error(res.error ?? 'Could not archive.');
        return;
      }
      await onChanged();
      toast.success(`Archived "${row.label}"`);
    });
  };

  const handleUnarchive = () => {
    startTransition(async () => {
      const res = await unarchiveWorkspaceEventArchetype(row.slug);
      if (!res.success) {
        toast.error(res.error ?? 'Could not restore.');
        return;
      }
      await onChanged();
      toast.success(`Restored "${row.label}"`);
    });
  };

  const handleMerge = () => {
    if (!mergeTarget || mergeTarget === row.slug) {
      toast.error('Pick a different target.');
      return;
    }
    const target = activeRows.find((r) => r.slug === mergeTarget);
    if (!target) return;
    const confirmed = window.confirm(
      `Merge ${count} deal${count === 1 ? '' : 's'} from "${row.label}" into "${target.label}" and archive "${row.label}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      const res = await mergeWorkspaceEventArchetypes(row.slug, mergeTarget);
      if (!res.success) {
        toast.error(res.error ?? 'Could not merge.');
        return;
      }
      await onChanged();
      toast.success(`Merged ${res.movedDeals} deal${res.movedDeals === 1 ? '' : 's'} into "${target.label}"`);
      setMode('idle');
      setMergeTarget('');
    });
  };

  const mergeCandidates = activeRows.filter((r) => r.slug !== row.slug);

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {mode === 'rename' ? (
            <>
              <input
                autoFocus
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') { setMode('idle'); setLabelDraft(row.label); }
                }}
                className="stage-input min-w-0 max-w-xs"
              />
              <button
                type="button"
                onClick={handleRename}
                disabled={pending}
                className="p-1 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]"
                aria-label="Save rename"
              >
                <CheckCircle2 size={14} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => { setMode('idle'); setLabelDraft(row.label); }}
                className="p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]"
                aria-label="Cancel rename"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </>
          ) : (
            <>
              <span className={cn('text-[length:var(--stage-input-font-size,13px)] tracking-tight min-w-0 truncate', isArchived ? 'text-[var(--stage-text-tertiary)]' : 'text-[var(--stage-text-primary)]')}>
                {row.label}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)]">
                {row.is_system ? 'Built-in' : 'Custom'}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-tertiary)]">
            {count} deal{count === 1 ? '' : 's'}
          </span>
          {!row.is_system && mode === 'idle' && !isArchived && (
            <>
              <button
                type="button"
                onClick={() => { setLabelDraft(row.label); setMode('rename'); }}
                className="p-1.5 rounded-[var(--stage-radius-input,6px)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)]"
                aria-label="Rename"
                title="Rename"
              >
                <Pencil size={12} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => setMode('merge')}
                disabled={activeRows.length <= 1}
                className="p-1.5 rounded-[var(--stage-radius-input,6px)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)] disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Merge into another type"
                title="Merge into another type"
              >
                <GitMerge size={12} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={handleArchive}
                disabled={pending}
                className="p-1.5 rounded-[var(--stage-radius-input,6px)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)]"
                aria-label="Archive"
                title="Archive"
              >
                {pending ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} strokeWidth={1.5} />}
              </button>
            </>
          )}
          {!row.is_system && isArchived && (
            <button
              type="button"
              onClick={handleUnarchive}
              disabled={pending}
              className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--stage-radius-input,6px)] text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)]"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <ArchiveRestore size={12} strokeWidth={1.5} />}
              Restore
            </button>
          )}
        </div>
      </div>

      {mode === 'merge' && (
        <div className="flex items-center gap-2 pl-3 border-l-2 border-[oklch(1_0_0_/_0.10)]">
          <span className="stage-label text-[var(--stage-text-tertiary)] shrink-0">
            Merge into
          </span>
          <select
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            className="stage-input min-w-0 max-w-xs"
          >
            <option value="">Pick a type…</option>
            {mergeCandidates.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!mergeTarget || pending}
            onClick={handleMerge}
            className="flex items-center gap-1.5 px-3 h-[var(--stage-input-height,34px)] rounded-[var(--stage-radius-input,6px)] bg-[var(--ctx-card)] border border-[oklch(1_0_0_/_0.14)] text-[length:var(--stage-input-font-size,13px)] font-medium text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] disabled:opacity-40"
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : <GitMerge size={12} strokeWidth={1.5} />}
            Merge
          </button>
          <button
            type="button"
            onClick={() => { setMode('idle'); setMergeTarget(''); }}
            className="text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]"
          >
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}
