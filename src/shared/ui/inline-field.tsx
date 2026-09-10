'use client';

/**
 * One atomic fact, editable where it stands.
 *
 * Correcting a typo'd phone number used to mean loading the full-page form,
 * and a directory whose small corrections cost a navigation is a directory
 * that rots — the number is known, it is the trip that is not worth making.
 *
 * Commits on the confirm control, never on blur. Blur is ambiguous: clicking
 * away can mean "done" or "forget it", and guessing wrong on a phone number
 * writes a half-typed one. So the editor stays open until the user says which,
 * with Enter and Escape as the shortcuts for the two buttons. That is
 * Cloudscape's rule for inline edit, and the reason it gives is the one that
 * matters here — always let the user save or discard, explicitly.
 *
 * The empty state keeps its target. A fact with nothing in it is exactly the
 * one you want to fill, so the control stays clickable and merely says less.
 *
 * @module shared/ui/inline-field
 */

import * as React from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';

export type InlineCommitResult = { ok: true } | { ok: false; error: string };

export interface InlineFieldProps {
  /** The stored value, or null when there is none. */
  value: string | null;
  /** What to show when not editing. Falls back to the raw value. */
  display?: React.ReactNode;
  /** Names the field for assistive tech, and labels the two buttons. */
  label: string;
  /** Offered in place of the value when there is nothing yet. */
  emptyLabel?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  type?: 'text' | 'email' | 'tel';
  /** Return an error to keep the editor open with the draft intact. */
  onCommit: (next: string | null) => Promise<InlineCommitResult>;
  /** Applied to the read-state control, so callers keep their own typography. */
  className?: string;
  inputClassName?: string;
}

export function InlineField({
  value,
  display,
  label,
  emptyLabel = 'Add',
  placeholder,
  inputMode,
  type = 'text',
  onCommit,
  className,
  inputClassName,
}: InlineFieldProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const begin = (e: React.MouseEvent) => {
    // Wherever this sits, the surrounding row or card usually navigates.
    e.stopPropagation();
    setDraft(value ?? '');
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft('');
  };

  const commit = async () => {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : trimmed;
    // Nothing changed, so nothing to say and nothing to write.
    if (next === (value ?? null)) {
      cancel();
      return;
    }

    setSaving(true);
    const result = await onCommit(next);
    setSaving(false);

    if (!result.ok) {
      // Stay open with the draft intact; the correction is usually one keypress.
      toast.error(result.error);
      return;
    }
    cancel();
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type={type}
          inputMode={inputMode}
          value={draft}
          aria-label={label}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') void commit();
            if (e.key === 'Escape') cancel();
          }}
          placeholder={placeholder}
          className={cn('stage-input h-7 px-2 text-[length:var(--stage-data-size)]', inputClassName)}
        />
        <button
          type="button"
          onClick={() => void commit()}
          disabled={saving}
          aria-label={`Save ${label}`}
          className="rounded-md p-1 text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)] disabled:opacity-50"
        >
          <Check className="size-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          aria-label={`Cancel editing ${label}`}
          className="rounded-md p-1 text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)] disabled:opacity-50"
        >
          <X className="size-3.5" strokeWidth={1.5} />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={begin}
      aria-label={value ? `${label}: ${value}. Edit` : `Add ${label.toLowerCase()}`}
      className={cn(
        'rounded-sm text-left transition-colors duration-[80ms]',
        'hover:bg-[oklch(1_0_0/0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        !value && 'text-[var(--stage-text-tertiary)]',
        className,
      )}
    >
      {value ? (display ?? value) : emptyLabel}
    </button>
  );
}
