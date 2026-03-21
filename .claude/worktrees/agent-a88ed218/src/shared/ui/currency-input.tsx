'use client';

import * as React from 'react';
import { cn } from '@/shared/lib/utils';

export interface CurrencyInputProps extends Omit<React.ComponentProps<'input'>, 'type' | 'onChange'> {
  /** Value as string (e.g. from useState). */
  value: string;
  /** Called with raw string value (e.g. "1234.56"). */
  onChange: (value: string) => void;
  /** Optional wrapper class (e.g. for catalog inputClass). */
  inputClassName?: string;
}

/**
 * Financial-style input: $ prefix, right-aligned, step 0.01, placeholder 0.00.
 * Use for price, cost, floor price, replacement cost, override price, etc.
 */
export function CurrencyInput({
  value,
  onChange,
  className,
  inputClassName,
  id,
  placeholder = '0.00',
  min = 0,
  step = 0.01,
  required,
  disabled,
  ...props
}: CurrencyInputProps) {
  return (
    <div
      className={cn(
        'flex items-center rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 overflow-hidden focus-within:ring-2 focus-within:ring-[var(--ring)] focus-within:border-transparent',
        className
      )}
    >
      <span className="pl-4 text-sm text-ink-muted tabular-nums shrink-0" aria-hidden>
        $
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        id={id}
        className={cn(
          'w-full min-w-0 py-2.5 pr-4 text-ceramic text-sm bg-transparent border-0 focus:outline-none focus:ring-0 tabular-nums text-right placeholder:text-ink-muted [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
          inputClassName
        )}
        {...props}
      />
    </div>
  );
}
