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
        className={cn(
          'peer h-11 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] pt-5 text-[length:var(--stage-input-font-size,13px)] tracking-tight text-[var(--stage-text-primary)] placeholder:text-transparent transition-all duration-200',
          'hover:bg-[var(--ctx-well-hover)] hover:border-[oklch(1_0_0_/_0.20)] focus-visible:bg-[var(--ctx-well-focus)] focus-visible:border-[var(--stage-accent)] focus-visible:ring-0',
          className
        )}
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
            ? 'top-1.5 text-[10px] font-medium text-[var(--stage-text-secondary)]'
            : 'top-1/2 -translate-y-1/2 text-sm text-[var(--stage-text-secondary)]'
        )}
      >
        {label}
      </label>
    </div>
  );
}
