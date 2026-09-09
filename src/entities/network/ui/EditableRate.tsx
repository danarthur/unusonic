'use client';

/**
 * The rate on a row, editable where it stands.
 *
 * Filling one in used to cost a trip to the full-page form, which is why most
 * people in the directory have no rate on file. The number is known; the
 * journey is what was not worth making. Click the blank, type, done -- no
 * panel, no save button, no form.
 *
 * Enter or blur commits, Escape abandons. There is no explicit save because a
 * save button is another decision, and this exists to remove one.
 *
 * @module entities/network/ui/EditableRate
 */

import * as React from 'react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { setPersonRate } from '@/features/network-data/api/set-person-rate';
import { formatUsd } from '../model/format-facts';
import type { PersonRate } from '@/entities/directory/model/read-rate';

export interface EditableRateProps {
  entityId: string;
  rate: PersonRate | null;
  /** Re-read after a change, so the row shows what was actually stored. */
  onSaved?: () => void;
}

function displayOf(rate: PersonRate | null): string | null {
  if (!rate) return null;
  return `${formatUsd(rate.amount)}${rate.unit ? ` / ${rate.unit}` : ''}`;
}

export function EditableRate({ entityId, rate, onSaved }: EditableRateProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const begin = (e: React.MouseEvent) => {
    // The row opens the contact; editing its rate must not.
    e.stopPropagation();
    setDraft(rate ? String(rate.amount) : '');
    setEditing(true);
  };

  const commit = async () => {
    setEditing(false);

    const trimmed = draft.trim();
    const next = trimmed === '' ? null : Number(trimmed.replace(/[$,\s]/g, ''));
    if (next !== null && !Number.isFinite(next)) {
      toast.error('That does not look like a rate.');
      return;
    }
    // Nothing changed, so nothing to say.
    if (next === (rate?.amount ?? null)) return;

    setSaving(true);
    const result = await setPersonRate(entityId, next);
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error, { duration: Infinity });
      return;
    }
    onSaved?.();
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="decimal"
        value={draft}
        aria-label="Rate"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        placeholder="450"
        className="stage-input h-6 w-full px-1.5 text-right text-xs tabular-nums focus-visible:outline-none"
      />
    );
  }

  const display = displayOf(rate);

  return (
    <button
      type="button"
      onClick={begin}
      disabled={saving}
      // An empty rate still has to be findable, so the target stays even when
      // there is nothing in it -- it just says nothing until hovered.
      aria-label={display ? `Rate ${display}` : 'Add a rate'}
      className={cn(
        'w-full truncate rounded-sm text-right transition-colors duration-[80ms]',
        'font-[family-name:var(--stage-data-font)] text-[length:var(--stage-readout-sm-size)] tabular-nums',
        'hover:bg-[oklch(1_0_0_/_0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        display
          ? 'text-[var(--stage-text-primary)]'
          : 'text-[var(--stage-text-tertiary)] opacity-0 group-hover:opacity-100',
        saving && 'opacity-50',
      )}
    >
      {display ?? 'Add'}
    </button>
  );
}
