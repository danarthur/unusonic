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
  /**
   * Text alignment. `right` (default) suits columns of prices where
   * magnitudes line up; `left` keeps the `$` adjacent to the digits for
   * single inline budget fields.
   */
  align?: 'left' | 'right';
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
  align = 'right',
  ...props
}: CurrencyInputProps) {
  const isLeft = align === 'left';
  return (
    <div
      className={cn(
        'flex items-center rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] overflow-hidden hover:border-[var(--stage-border-hover)] focus-within:border-[var(--stage-accent)] focus-within:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] transition-[border-color,box-shadow] duration-[80ms] ease-out',
        className
      )}
    >
      <span
        className={cn(
          'text-sm text-[var(--stage-text-secondary)] tabular-nums shrink-0 select-none',
          isLeft ? 'pl-3 pr-1' : 'pl-4',
        )}
        aria-hidden
      >
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
          'w-full min-w-0 py-2.5 text-[var(--stage-text-primary)] text-sm bg-transparent border-0 focus:outline-none focus:ring-0 tabular-nums placeholder:text-[var(--stage-text-secondary)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
          isLeft ? 'pl-0 pr-4 text-left' : 'pr-4 text-right',
          inputClassName,
        )}
        {...props}
      />
    </div>
  );
}
