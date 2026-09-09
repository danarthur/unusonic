'use client';

/**
 * When a link ended, asked rather than assumed.
 *
 * Split out of [[LinkedPeople]], which crossed the file limit the moment this
 * arrived and had no business owning a date picker anyway.
 *
 * @module entities/network/ui/EndDatePrompt
 */

import * as React from 'react';
import { Check, X } from 'lucide-react';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Asking when, rather than assuming now.
 *
 * Someone telling you in September that a couple split in February is the
 * normal case, not the exception — you hear about it when you hear about it.
 * Stamping the day you were told puts a wrong fact in the record and calls it
 * history. The field defaults to today because that IS usually right, and takes
 * one keystroke to correct when it is not.
 */
export function EndDatePrompt({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: (endedOn: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState(today());
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-[oklch(1_0_0/0.06)] py-0.5 pl-2.5 pr-1"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <span className="stage-badge-text text-[var(--stage-text-tertiary)]">Ended</span>
      <input
        autoFocus
        type="date"
        value={value}
        max={today()}
        aria-label={`Date ${name} stopped being linked`}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && value) onConfirm(value); }}
        className="stage-input h-6 px-1.5 text-[length:var(--stage-label-size)]"
      />
      <button
        type="button"
        disabled={!value}
        onClick={() => onConfirm(value)}
        aria-label={`Confirm ${name} is a former link`}
        className="rounded-full p-1 text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)] disabled:opacity-50"
      >
        <Check className="size-3" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="rounded-full p-1 text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]"
      >
        <X className="size-3" strokeWidth={1.5} />
      </button>
    </span>
  );
}
