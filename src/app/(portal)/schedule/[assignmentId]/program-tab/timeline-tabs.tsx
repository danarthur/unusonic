'use client';

/**
 * Timeline tab bar + template picker for the program-tab cluster.
 *
 * Extracted from program-tab.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - TimelineTabBar — horizontal tab strip across the top of edit mode for
 *     selecting / renaming / removing / adding timelines + saving as template.
 *   - TemplatePicker — expanded picker rendered below the tab bar showing
 *     saved DJ templates and built-in starter archetypes.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Pencil, Trash2, Bookmark, Copy } from 'lucide-react';
import type { ProgramTimeline, DjTimelineTemplate } from '@/features/ops/lib/dj-prep-schema';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { STARTER_TEMPLATES, TIMELINE_TEMPLATES } from './shared';

export function TimelineTabBar({
  timelines,
  activeTimelineId,
  renamingTimelineId,
  onSelect,
  onRename,
  onStartRename,
  onRemove,
  onAddBlank,
  onOpenPicker,
  onSaveAsTemplate,
  savingTemplate,
  hasTimelines,
}: {
  timelines: ProgramTimeline[];
  activeTimelineId: string | null;
  renamingTimelineId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onStartRename: (id: string | null) => void;
  onRemove: (id: string) => void;
  onAddBlank: () => void;
  onOpenPicker: () => void;
  onSaveAsTemplate: () => void;
  savingTemplate: boolean;
  hasTimelines: boolean;
}) {
  const [renameValue, setRenameValue] = useState('');

  if (!hasTimelines) return null;

  return (
    <div className="flex items-center gap-1 border-b border-[oklch(1_0_0/0.06)] -mx-4 px-4 overflow-x-auto">
      {timelines.sort((a, b) => a.sort_order - b.sort_order).map((tl) => (
        <div key={tl.id} className="flex items-center shrink-0 group">
          {renamingTimelineId === tl.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => {
                if (renameValue.trim()) onRename(tl.id, renameValue.trim());
                else onStartRename(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') onStartRename(null);
              }}
              className="px-3 py-2 text-sm font-medium bg-transparent text-[var(--stage-text-primary)] outline-none border-b-2 border-[var(--stage-accent)] w-32"
            />
          ) : (
            <button
              onClick={() => onSelect(tl.id)}
              onDoubleClick={() => {
                setRenameValue(tl.name);
                onStartRename(tl.id);
              }}
              className={`relative px-3 py-2.5 text-sm font-medium transition-colors duration-[80ms] ${
                activeTimelineId === tl.id
                  ? 'text-[var(--stage-text-primary)]'
                  : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
              }`}
            >
              {tl.name || 'Untitled'}
              {activeTimelineId === tl.id && (
                <motion.div
                  layoutId="timeline-tab-indicator"
                  className="absolute bottom-0 left-3 right-3 h-0.5 bg-[var(--stage-accent)] rounded-full"
                  transition={STAGE_LIGHT}
                />
              )}
            </button>
          )}

          {/* Edit/delete controls — visible on hover */}
          {activeTimelineId === tl.id && renamingTimelineId !== tl.id && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mr-1">
              <button
                onClick={() => {
                  setRenameValue(tl.name);
                  onStartRename(tl.id);
                }}
                className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] p-0.5"
                aria-label="Rename timeline"
              >
                <Pencil className="size-3" />
              </button>
              {timelines.length > 0 && (
                <button
                  onClick={() => {
                    if (tl.moments.length === 0 || window.confirm(`Delete "${tl.name}" and its ${tl.moments.length} moments?`)) {
                      onRemove(tl.id);
                    }
                  }}
                  className="text-[var(--stage-text-tertiary)] hover:text-[oklch(0.7_0.15_25)] p-0.5"
                  aria-label="Delete timeline"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add timeline */}
      <div className="flex items-center gap-1 ml-1 shrink-0">
        <button
          onClick={onAddBlank}
          className="flex items-center gap-1 px-2 py-2 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          aria-label="Add blank timeline"
          title="Add blank timeline"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          onClick={onOpenPicker}
          className="flex items-center gap-1 px-2 py-2 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          aria-label="Add from template"
          title="Add from template"
        >
          <Copy className="size-3.5" />
        </button>
      </div>

      {/* Save as template — right side */}
      {hasTimelines && (
        <button
          onClick={onSaveAsTemplate}
          disabled={savingTemplate}
          className="flex items-center gap-1.5 ml-auto shrink-0 px-2.5 py-1.5 text-[10px] font-medium text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          title="Save current timelines as a reusable template"
        >
          <Bookmark className="size-3" />
          {savingTemplate ? 'Saving...' : 'Save as template'}
        </button>
      )}
    </div>
  );
}

export function TemplatePicker({
  djTemplates,
  onApplyStarter,
  onApplySaved,
  onDeleteTemplate,
  onClose,
}: {
  djTemplates: DjTimelineTemplate[];
  onApplyStarter: (key: string) => void;
  onApplySaved: (template: DjTimelineTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
            Choose a template
          </h3>
          <button onClick={onClose} className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]">
            <X className="size-4" />
          </button>
        </div>

        {/* Saved templates */}
        {djTemplates.length > 0 && (
          <div className="mb-4">
            <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)] mb-2">
              Your templates
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {djTemplates.map((t) => (
                <div key={t.id} className="group relative">
                  <button
                    onClick={() => onApplySaved(t)}
                    className="w-full text-left px-3 py-2.5 rounded-lg bg-[oklch(1_0_0/0.04)] hover:bg-[oklch(1_0_0/0.08)] transition-colors"
                  >
                    <span className="text-sm font-medium text-[var(--stage-text-primary)] block truncate">{t.name}</span>
                    <span className="text-[10px] text-[var(--stage-text-tertiary)]">
                      {t.timelines.length} timeline{t.timelines.length !== 1 ? 's' : ''}
                      {' \u00b7 '}
                      {t.timelines.reduce((sum, tl) => sum + tl.moments.length, 0)} moments
                    </span>
                  </button>
                  <button
                    onClick={() => onDeleteTemplate(t.id)}
                    className="absolute top-1.5 right-1.5 p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[oklch(0.7_0.15_25)] opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete template"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Built-in starters */}
        <div>
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)] mb-2">
            Starters
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STARTER_TEMPLATES.map((s) => {
              const template = TIMELINE_TEMPLATES[s.key];
              return (
                <button
                  key={s.key}
                  onClick={() => onApplyStarter(s.key)}
                  className="text-left px-3 py-2.5 rounded-lg bg-[oklch(1_0_0/0.04)] hover:bg-[oklch(1_0_0/0.08)] transition-colors"
                >
                  <span className="text-sm font-medium text-[var(--stage-text-primary)] block">{s.label}</span>
                  <span className="text-[10px] text-[var(--stage-text-tertiary)]">
                    {template?.length ?? 0} moments
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
