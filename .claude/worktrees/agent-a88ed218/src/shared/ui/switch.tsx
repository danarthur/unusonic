'use client';

import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Liquid Ceramic branded switch: mercury rim, glass track when off,
 * silk (neon signal) when on. Use for Set by time, Show load-in/out, and Settings preferences.
 */
export interface CeramicSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Accessible label (used for aria-label if no associated label). */
  'aria-label'?: string;
}

export function CeramicSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  className,
  'aria-label': ariaLabel,
}: CeramicSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      id={id}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-[background-color,border-color,box-shadow] duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian',
        'disabled:pointer-events-none disabled:opacity-50',
        checked
          ? 'border-mercury bg-silk/25 shadow-[inset_0_0_0_1px_var(--color-glass-highlight)]'
          : 'border-mercury bg-[var(--color-glass-surface)]',
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full transition-transform duration-200 translate-y-0.5',
          checked ? 'translate-x-5 bg-silk shadow-[0_0_12px_oklch(0.70_0.15_250_/_0.4)]' : 'translate-x-0.5 bg-ceramic/20'
        )}
      />
    </button>
  );
}
