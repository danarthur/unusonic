'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, AlertTriangle, GitMerge } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { WorkspaceIndustryTag } from '@/entities/talent/api/get-workspace-industry-tags';
import { getWorkspaceIndustryTags } from '@/entities/talent/api/get-workspace-industry-tags';
import {
  addWorkspaceIndustryTag,
  removeWorkspaceIndustryTag,
  countIndustryTagUsage,
  stripAndRemoveIndustryTag,
  mergeIndustryTags,
} from '../api/industry-tag-actions';

interface IndustryTagManagerProps {
  workspaceId: string;
  initialTags: WorkspaceIndustryTag[];
}

/** Derives a stable snake_case key from a human-readable label. */
function labelToKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

type DeleteState =
  | { phase: 'idle' }
  | { phase: 'counting'; tag: WorkspaceIndustryTag }
  | { phase: 'confirm'; tag: WorkspaceIndustryTag; usageCount: number }
  | { phase: 'deleting'; tag: WorkspaceIndustryTag };

export function IndustryTagManager({ workspaceId, initialTags }: IndustryTagManagerProps) {
  const [tags, setTags] = React.useState<WorkspaceIndustryTag[]>(initialTags);
  const [labelInput, setLabelInput] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [deleteState, setDeleteState] = React.useState<DeleteState>({ phase: 'idle' });
  const [mergeFrom, setMergeFrom] = React.useState<WorkspaceIndustryTag | null>(null);
  const [merging, setMerging] = React.useState(false);
  const [mergeError, setMergeError] = React.useState<string | null>(null);

  const derivedKey = labelToKey(labelInput);

  const refresh = React.useCallback(async () => {
    const updated = await getWorkspaceIndustryTags(workspaceId);
    setTags(updated);
  }, [workspaceId]);

  const handleAdd = async () => {
    const label = labelInput.trim();
    const tag = labelToKey(label);
    if (!label || !tag) return;
    setAdding(true);
    const result = await addWorkspaceIndustryTag({ workspace_id: workspaceId, tag, label });
    setAdding(false);
    if (result.ok) {
      toast.success(`"${label}" added.`);
      setLabelInput('');
      await refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleDeleteClick = async (entry: WorkspaceIndustryTag) => {
    setDeleteState({ phase: 'counting', tag: entry });
    const count = await countIndustryTagUsage(workspaceId, entry.tag);
    if (count === 0) {
      // Safe to delete directly — no confirmation needed
      setDeleteState({ phase: 'deleting', tag: entry });
      const result = await removeWorkspaceIndustryTag({ tag_id: entry.id, workspace_id: workspaceId });
      setDeleteState({ phase: 'idle' });
      if (result.ok) {
        toast.success(`"${entry.label}" removed.`);
        setTags((prev) => prev.filter((t) => t.id !== entry.id));
      } else {
        toast.error(result.error);
      }
    } else {
      setDeleteState({ phase: 'confirm', tag: entry, usageCount: count });
    }
  };

  const handleConfirmCascadeDelete = async () => {
    if (deleteState.phase !== 'confirm') return;
    const { tag } = deleteState;
    setDeleteState({ phase: 'deleting', tag });
    const result = await stripAndRemoveIndustryTag({ workspace_id: workspaceId, tag: tag.tag });
    setDeleteState({ phase: 'idle' });
    if (result.ok) {
      toast.success(`"${tag.label}" removed from dictionary and all contacts.`);
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
    } else {
      toast.error(result.error);
    }
  };

  const handleCancelDelete = () => setDeleteState({ phase: 'idle' });

  const handleMerge = async (toTag: WorkspaceIndustryTag) => {
    if (!mergeFrom) return;
    setMergeError(null);
    setMerging(true);
    const result = await mergeIndustryTags(workspaceId, mergeFrom.tag, toTag.tag);
    setMerging(false);
    setMergeFrom(null);
    if (!result.ok) {
      setMergeError(result.error);
    } else {
      toast.success(`"${mergeFrom.label}" merged into "${toTag.label}".`);
      await refresh();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const isCounting = deleteState.phase === 'counting';
  const isDeleting = deleteState.phase === 'deleting';
  const busyTagId = (deleteState.phase === 'counting' || deleteState.phase === 'deleting')
    ? deleteState.tag.id
    : null;

  const anyOperationInProgress = isCounting || isDeleting || merging || deleteState.phase === 'confirm';

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-muted leading-relaxed">
        These categories appear as selectable tags on vendor, partner, and venue cards in the Network tab. Admin or above can add new categories — members cannot type free-text tags.
      </p>

      {/* Add form */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Input
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Fire Dancer"
              className="bg-transparent border-[var(--color-mercury)] text-[var(--color-ink)]"
              maxLength={80}
            />
            {labelInput.trim() && (
              <p className="text-[10px] text-[var(--color-ink-muted)]/70 pl-1">
                Key: <code className="font-mono">{derivedKey}</code>
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            disabled={!labelInput.trim() || !derivedKey || adding}
            className="shrink-0 self-start"
          >
            <Plus className="size-4 mr-1.5" />
            Add
          </Button>
        </div>
      </div>

      {/* Confirmation dialog */}
      {deleteState.phase === 'confirm' && (
        <div className="rounded-xl border border-[var(--color-signal-error)]/30 bg-[var(--color-signal-error)]/5 p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="size-4 text-[var(--color-signal-error)] mt-0.5 shrink-0" />
            <p className="text-sm text-[var(--color-ink)]">
              <strong>&ldquo;{deleteState.tag.label}&rdquo;</strong> is applied to{' '}
              <strong>{deleteState.usageCount}</strong>{' '}
              {deleteState.usageCount === 1 ? 'contact' : 'contacts'}. Deleting it will remove it from all of them.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleConfirmCascadeDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Removing…' : 'Delete and remove from all contacts'}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancelDelete}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Merge panel — shown when mergeFrom is set */}
      {mergeFrom && (
        <div className="rounded-xl border border-[var(--color-silk)]/30 bg-[var(--color-silk)]/5 p-4 space-y-3 transition-all">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-ink)]">
              Merge <strong>&ldquo;{mergeFrom.label}&rdquo;</strong> into:
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setMergeFrom(null); setMergeError(null); }}
              disabled={merging}
              className="text-[var(--color-ink-muted)]"
            >
              Cancel
            </Button>
          </div>
          {mergeError && (
            <p className="text-xs text-[var(--color-signal-error)]">{mergeError}</p>
          )}
          <ul className="flex flex-col gap-1.5">
            {tags
              .filter((t) => t.id !== mergeFrom.id)
              .map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => handleMerge(entry)}
                    disabled={merging}
                    className="w-full flex items-center gap-2 rounded-lg border border-[var(--color-mercury)]/50 bg-[var(--color-obsidian)]/30 px-3 py-2 text-left hover:bg-[var(--color-silk)]/10 transition-colors disabled:opacity-40"
                  >
                    <span className="text-sm text-[var(--color-ink)]">{entry.label}</span>
                    <span className="ml-1 font-mono text-[10px] text-[var(--color-ink-muted)]/60">
                      {entry.tag}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Tag list */}
      {tags.length === 0 ? (
        <p className="text-sm text-ink-muted">No industry tags configured.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.map((entry) => {
            const isBusy = busyTagId === entry.id || (deleteState.phase === 'confirm' && deleteState.tag.id === entry.id);
            const canShowMergeButton = tags.length > 1 && !mergeFrom && !anyOperationInProgress;
            return (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-[var(--color-mercury)]/50 bg-[var(--color-obsidian)]/30 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <span className="text-sm text-[var(--color-ink)]">{entry.label}</span>
                  <span className="ml-2 font-mono text-[10px] text-[var(--color-ink-muted)]/60">
                    {entry.tag}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canShowMergeButton && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setMergeFrom(entry)}
                      disabled={merging || isBusy}
                      className="text-[var(--color-ink-muted)] hover:text-[var(--color-silk)]"
                      title={`Merge "${entry.label}" into another tag`}
                    >
                      <GitMerge size={14} />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDeleteClick(entry)}
                    disabled={isBusy || isCounting || isDeleting || merging || !!mergeFrom}
                    className="text-[var(--color-ink-muted)] hover:text-[var(--color-signal-error)]"
                  >
                    {isBusy && (isCounting || isDeleting) ? (
                      <span className="size-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
