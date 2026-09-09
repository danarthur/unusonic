'use client';

/**
 * The rate on a row, editable where it stands.
 *
 * Filling one in used to cost a trip to the full-page form, which is why most
 * people in the directory have no rate on file. The number is known; the
 * journey is what was not worth making.
 *
 * Built on [[InlineField]] rather than its own editor. It had one -- committing
 * on blur, with no confirm -- and the panel then needed the same affordance for
 * phone and email, where a blur-commit will happily save half a phone number.
 * Two inline editors that behave differently in one product is worse than one
 * that asks for a confirm, so the row follows the panel: Enter or the check
 * commits, Escape or the cross abandons, and clicking away does neither.
 *
 * @module entities/network/ui/EditableRate
 */

import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import { InlineField } from '@/shared/ui/inline-field';
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
  return (
    <InlineField
      value={rate ? String(rate.amount) : null}
      display={displayOf(rate)}
      label="Rate"
      emptyLabel="Add"
      placeholder="450"
      inputMode="decimal"
      onCommit={async (next) => {
        const amount = next === null ? null : Number(next.replace(/[$,\s]/g, ''));
        if (amount !== null && !Number.isFinite(amount)) {
          return { ok: false as const, error: 'That does not look like a rate.' };
        }
        const result = await setPersonRate(entityId, amount);
        if (result.ok) onSaved?.();
        return result;
      }}
      inputClassName="h-6 w-full text-right text-xs tabular-nums"
      className={cn(
        'w-full truncate text-right',
        'font-[family-name:var(--stage-data-font)] text-[length:var(--stage-readout-sm-size)] tabular-nums',
        // An empty rate still has to be findable, so the target stays even when
        // there is nothing in it -- it just says nothing until the row is hovered.
        rate
          ? 'text-[var(--stage-text-primary)]'
          : 'text-[var(--stage-text-tertiary)] opacity-0 group-hover:opacity-100',
      )}
    />
  );
}
