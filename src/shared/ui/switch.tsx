'use client';

import * as React from 'react';
import { cn } from '@/shared/lib/utils';

export interface CeramicSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
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
        'relative inline-flex shrink-0 rounded-full border transition-[background-color,border-color,box-shadow] duration-200',
        'focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--stage-accent)] focus-visible:outline-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        checked
          ? 'border-transparent bg-[var(--stage-accent)]'
          : 'border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-nested)]',
        className
      )}
      style={{
        width: 'var(--stage-switch-width, 40px)',
        height: 'var(--stage-switch-height, 22px)',
      }}
    >
      <span
        className="pointer-events-none inline-block rounded-full transition-transform duration-200"
        style={{
          width: 'calc(var(--stage-switch-height, 22px) - 4px)',
          height: 'calc(var(--stage-switch-height, 22px) - 4px)',
          marginTop: '2px',
          transform: checked
            ? 'translateX(calc(var(--stage-switch-width, 40px) - var(--stage-switch-height, 22px)))'
            : 'translateX(2px)',
          backgroundColor: checked ? 'oklch(0.10 0 0)' : 'var(--stage-surface-raised)',
        }}
      />
    </button>
  );
}
