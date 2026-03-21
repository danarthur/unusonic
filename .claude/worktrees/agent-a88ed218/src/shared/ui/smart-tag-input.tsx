'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { cn } from '@/shared/lib/utils';

/** Minimal tag shape for shared SmartTagInput; callers pass API that returns this shape. */
export interface WorkspaceTagShape {
  id: string;
  label: string;
  color: string;
  workspace_id?: string;
}

/** Pastel backgrounds/borders for tag pills (Tailwind can't do dynamic bg-${color}/20). */
const TAG_PILL: Record<string, { bg: string; border: string; dot: string }> = {
  'blue-400': { bg: 'oklch(0.35 0.08 250 / 0.35)', border: 'oklch(0.55 0.12 250 / 0.5)', dot: 'oklch(0.65 0.15 250)' },
  'emerald-400': { bg: 'oklch(0.35 0.08 145 / 0.35)', border: 'oklch(0.55 0.12 145 / 0.5)', dot: 'oklch(0.65 0.15 145)' },
  'amber-400': { bg: 'oklch(0.35 0.08 70 / 0.35)', border: 'oklch(0.55 0.12 70 / 0.5)', dot: 'oklch(0.75 0.15 70)' },
  'rose-400': { bg: 'oklch(0.35 0.08 350 / 0.35)', border: 'oklch(0.55 0.12 350 / 0.5)', dot: 'oklch(0.65 0.18 350)' },
  'violet-400': { bg: 'oklch(0.35 0.08 290 / 0.35)', border: 'oklch(0.55 0.12 290 / 0.5)', dot: 'oklch(0.65 0.15 290)' },
  'teal-400': { bg: 'oklch(0.35 0.08 180 / 0.35)', border: 'oklch(0.55 0.12 180 / 0.5)', dot: 'oklch(0.65 0.12 180)' },
  'orange-400': { bg: 'oklch(0.35 0.08 45 / 0.35)', border: 'oklch(0.55 0.12 45 / 0.5)', dot: 'oklch(0.7 0.15 45)' },
  'fuchsia-400': { bg: 'oklch(0.35 0.08 320 / 0.35)', border: 'oklch(0.55 0.12 320 / 0.5)', dot: 'oklch(0.65 0.18 320)' },
  'slate-400': { bg: 'oklch(0.35 0.02 250 / 0.3)', border: 'oklch(0.5 0.02 250 / 0.45)', dot: 'oklch(0.6 0.02 250)' },
};

function tagStyle(color: string) {
  return TAG_PILL[color] ?? TAG_PILL['slate-400'];
}

export interface SmartTagInputProps {
  workspaceId: string | null;
  value: WorkspaceTagShape[];
  onChange: (tags: WorkspaceTagShape[]) => void;
  /** Fetches tags for the workspace (injected from feature layer to respect FSD). */
  getWorkspaceTags: (workspaceId: string) => Promise<{ tags: WorkspaceTagShape[] }>;
  /** Creates a tag and returns it (injected from feature layer). */
  createWorkspaceTag: (workspaceId: string, label: string) => Promise<{ tag: WorkspaceTagShape | null }>;
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

const inputBaseClass =
  'w-full min-w-0 border-0 bg-transparent px-3 py-2.5 text-sm text-ceramic placeholder:text-ink-muted focus:outline-none focus:ring-0';

export function SmartTagInput({
  workspaceId,
  value,
  onChange,
  getWorkspaceTags,
  createWorkspaceTag,
  placeholder = 'Add tags…',
  id,
  className,
  disabled = false,
}: SmartTagInputProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [workspaceTags, setWorkspaceTags] = useState<WorkspaceTagShape[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const loadWorkspaceTags = useCallback(async () => {
    if (!workspaceId) {
      setWorkspaceTags([]);
      return;
    }
    setLoadingTags(true);
    const result = await getWorkspaceTags(workspaceId);
    setWorkspaceTags(result.tags ?? []);
    setLoadingTags(false);
  }, [workspaceId, getWorkspaceTags]);

  useEffect(() => {
    if (open && workspaceId) {
      loadWorkspaceTags();
    }
  }, [open, workspaceId, loadWorkspaceTags]);

  // Focus the search input when popover opens (Radix + cmdk don't always do this)
  useEffect(() => {
    if (!open) return;
    const focusInput = () => {
      const el = inputRef.current ?? contentRef.current?.querySelector('input');
      if (el instanceof HTMLInputElement) el.focus();
    };
    const t = setTimeout(focusInput, 50);
    return () => clearTimeout(t);
  }, [open]);

  const selectedIds = useMemo(() => new Set(value.map((t) => t.id)), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaceTags;
    return workspaceTags.filter((t) => t.label.toLowerCase().includes(q));
  }, [workspaceTags, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return workspaceTags.find((t) => t.label.toLowerCase() === q) ?? null;
  }, [workspaceTags, query]);

  const showCreate = useMemo(() => {
    const q = query.trim();
    return q.length > 0 && !exactMatch && !creating;
  }, [query, exactMatch, creating]);

  const handleSelectTag = useCallback(
    (tag: WorkspaceTagShape) => {
      if (selectedIds.has(tag.id)) return;
      onChange([...value, tag]);
      setQuery('');
    },
    [value, onChange, selectedIds]
  );

  const handleCreate = useCallback(async () => {
    const label = query.trim();
    if (!label || !workspaceId) return;
    setCreating(true);
    const result = await createWorkspaceTag(workspaceId, label);
    setCreating(false);
    setQuery('');
    if (result.tag) {
      onChange([...value, result.tag]);
    }
    setOpen(false);
  }, [query, workspaceId, value, onChange, createWorkspaceTag]);

  const removeTag = useCallback(
    (tagId: string) => {
      onChange(value.filter((t) => t.id !== tagId));
    },
    [value, onChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          id={id}
          aria-disabled={disabled}
          aria-label="Tags"
          className={cn(
            'flex min-h-[42px] w-full flex-wrap items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 px-3 py-2 text-left text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--ring)]',
            value.length === 0 && 'py-2.5',
            disabled && 'pointer-events-none opacity-50',
            className
          )}
        >
          {value.length > 0 ? (
            <>
              {value.map((tag) => {
                const style = tagStyle(tag.color);
                return (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-ceramic"
                  style={{ backgroundColor: style.bg, borderColor: style.border }}
                >
                  {tag.label}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeTag(tag.id);
                    }}
                    className="rounded p-0.5 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                    aria-label={`Remove ${tag.label}`}
                  >
                    <X size={12} />
                  </button>
                </span>
                );
              })}
              <span className="text-ink-muted">Add…</span>
            </>
          ) : (
            <span className="text-ink-muted">{placeholder}</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="start"
        className="z-[250] w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command
          className="rounded-lg border-0 bg-transparent"
          loop
          shouldFilter={false}
        >
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="Type to search or create…"
            className={inputBaseClass}
          />
          <Command.List className="max-h-[220px] overflow-y-auto border-t border-[var(--glass-border)] p-1">
            <Command.Empty className="py-3 text-center text-sm text-ink-muted">
              {loadingTags ? 'Loading…' : showCreate ? null : 'No tags match.'}
            </Command.Empty>
            {showCreate && (
              <Command.Item
                value={`create:${query.trim()}`}
                onSelect={handleCreate}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-neon hover:bg-[var(--glass-bg-hover)] data-[selected=true]:bg-[var(--glass-bg-hover)]"
              >
                Create &quot;{query.trim()}&quot;
              </Command.Item>
            )}
            {filtered.map((tag) => {
              const style = tagStyle(tag.color);
              return (
                <Command.Item
                  key={tag.id}
                  value={tag.id}
                  onSelect={() => handleSelectTag(tag)}
                  disabled={selectedIds.has(tag.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-[var(--glass-bg-hover)]',
                    selectedIds.has(tag.id) && 'opacity-50'
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: style.dot }}
                  />
                  {tag.label}
                </Command.Item>
              );
            })}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
