'use client';

import * as React from 'react';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';

interface FloatingLabelInputProps extends Omit<React.ComponentProps<typeof Input>, 'placeholder'> {
  label: string;
  containerClassName?: string;
}

/** Luxury UX: label floats up when focused or has value. */
export function FloatingLabelInput({
  label,
  containerClassName,
  className,
  id: idProp,
  value,
  defaultValue,
  ...props
}: FloatingLabelInputProps) {
  const id = React.useId();
  const inputId = idProp ?? id;
  const [focused, setFocused] = React.useState(false);
  const [hasValue, setHasValue] = React.useState(
    Boolean(value !== undefined && value !== '' && value !== null) ||
      Boolean(defaultValue !== undefined && defaultValue !== '' && defaultValue !== null)
  );

  React.useEffect(() => {
    if (value !== undefined) setHasValue(Boolean(value !== '' && value !== null));
  }, [value]);

  const floating = focused || hasValue;

  return (
    <div className={cn('relative', containerClassName)}>
      <Input
        id={inputId}
        value={value}
        defaultValue={defaultValue}
        className={cn('peer pt-5', className)}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        onChange={(e) => {
          setHasValue(e.target.value.length > 0);
          props.onChange?.(e);
        }}
        placeholder=" "
        aria-label={label}
        {...props}
      />
      <label
        htmlFor={inputId}
        className={cn(
          'pointer-events-none absolute left-3 transition-all duration-200',
          floating
            ? 'top-1.5 text-[10px] font-medium text-[var(--color-ink-muted)]'
            : 'top-1/2 -translate-y-1/2 text-sm text-[var(--color-ink-muted)]'
        )}
      >
        {label}
      </label>
    </div>
  );
}
