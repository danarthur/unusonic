'use client';

/**
 * CardSearchInput — in-card search affordance for the Replies card.
 *
 * Activated by clicking the search icon or pressing ⌘F / Ctrl+F while the
 * card has focus. Empty query = no-op (nothing filtered). The parent card
 * is responsible for threading the query down to ExpandedThread for
 * message-level filtering and for deciding which thread rows render when
 * the query is active (typically: any thread with ≥1 match stays visible).
 *
 * See docs/reference/replies-card-v2-design.md §4.
 *
 * @module features/comms/replies/ui/CardSearchInput
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

export type CardSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Placeholder copy. Defaults to "Search messages on this deal…" */
  placeholder?: string;
};

export function CardSearchInput({
  value,
  onChange,
  open,
  onOpenChange,
  placeholder = 'Search messages on this deal\u2026',
}: CardSearchInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus on open.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onChange('');
        onOpenChange(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onChange, onOpenChange]);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          layout
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={STAGE_LIGHT}
          style={{ overflow: 'hidden' }}
        >
          <div
            className="flex items-center"
            style={{
              gap: 'var(--stage-gap, 6px)',
              padding: 'var(--stage-gap, 6px) var(--stage-gap-wide, 12px)',
              borderRadius: 'var(--stage-radius-nested, 8px)',
              background: 'var(--ctx-well)',
              border: '1px solid var(--stage-edge-subtle)',
            }}
            data-surface="well"
          >
            <Search size={12} style={{ color: 'var(--stage-text-tertiary)' }} />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="flex-1 text-sm bg-transparent border-none outline-none"
              style={{ color: 'var(--stage-text-primary)' }}
            />
            {value && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onChange('')}
                className="inline-flex items-center justify-center"
                style={{
                  width: 20,
                  height: 20,
                  color: 'var(--stage-text-tertiary)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
