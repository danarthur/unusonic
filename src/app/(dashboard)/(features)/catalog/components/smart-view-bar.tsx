/**
 * Smart view bar — horizontal row of saved filter pills with save/delete.
 * Renders between category tabs and search row in the catalog toolbar.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { SmartView } from '../hooks/use-smart-views';

export interface SmartViewBarProps {
  views: SmartView[];
  activeViewId: string | null;
  onSelectView: (view: SmartView) => void;
  onSaveCurrentView: (name: string) => void;
  onDeleteView: (id: string) => void;
  currentFiltersEmpty: boolean;
}

export function SmartViewBar({
  views,
  activeViewId,
  onSelectView,
  onSaveCurrentView,
  onDeleteView,
  currentFiltersEmpty,
}: SmartViewBarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // Don't render if nothing to show
  const hasViews = views.length > 0;
  const showSaveButton = !currentFiltersEmpty;
  if (!hasViews && !showSaveButton) return null;

  const handleSave = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onSaveCurrentView(trimmed);
    setNewName('');
    setCreating(false);
  };

  const handleCancel = () => {
    setNewName('');
    setCreating(false);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
        Views
      </span>

      {/* Saved view pills */}
      <AnimatePresence mode="popLayout">
        {views.map((view) => (
          <SmartViewPill
            key={view.id}
            view={view}
            isActive={activeViewId === view.id}
            onSelect={() => onSelectView(view)}
            onDelete={() => onDeleteView(view.id)}
          />
        ))}
      </AnimatePresence>

      {/* Save current view */}
      {showSaveButton && !creating && (
        <motion.button
          type="button"
          onClick={() => setCreating(true)}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={STAGE_LIGHT}
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors',
            'border border-dashed border-[oklch(1_0_0_/_0.12)] text-[var(--stage-text-secondary)]',
            'hover:text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.20)] hover:bg-[oklch(1_0_0_/_0.03)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
          )}
        >
          <Plus size={12} strokeWidth={2} />
          Save view
        </motion.button>
      )}

      {/* Inline name input */}
      <AnimatePresence>
        {creating && (
          <CreateViewInput
            value={newName}
            onChange={setNewName}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Smart view pill ─── */

function SmartViewPill({
  view,
  isActive,
  onSelect,
  onDelete,
}: {
  view: SmartView;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={STAGE_LIGHT}
      className="group relative"
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
          isActive
            ? 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.24)]'
            : 'border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]'
        )}
      >
        {view.name}
      </button>
      {/* Delete X on hover */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={cn(
          'absolute -top-1.5 -right-1.5 p-0.5 rounded-full',
          'bg-[var(--stage-surface-elevated)] border border-[oklch(1_0_0_/_0.12)]',
          'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
        )}
        aria-label={`Delete view "${view.name}"`}
      >
        <X size={10} strokeWidth={2} />
      </button>
    </motion.div>
  );
}

/* ─── Inline create input ─── */

function CreateViewInput({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const localRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localRef.current?.focus();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: 'auto' }}
      exit={{ opacity: 0, width: 0 }}
      transition={STAGE_LIGHT}
      className="overflow-hidden"
    >
      <input
        ref={localRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => {
          // Small delay to allow click-through before blur fires
          setTimeout(() => {
            if (value.trim()) {
              onSave();
            } else {
              onCancel();
            }
          }, 150);
        }}
        placeholder="View name..."
        className={cn(
          'w-32 px-3 py-1.5 rounded-full text-xs font-medium',
          'border border-[oklch(1_0_0_/_0.16)] bg-[var(--ctx-well)] text-[var(--stage-text-primary)]',
          'placeholder:text-[var(--stage-text-secondary)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
        )}
      />
    </motion.div>
  );
}
