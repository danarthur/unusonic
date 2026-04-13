'use client';

import * as React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { checkSlugAvailability } from '@/features/onboarding/api/actions';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';

function normalizeSlug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface SlugInputProps {
  nameValue: string;
  value: string;
  onChange: (value: string) => void;
  excludeOrgId?: string;
  className?: string;
  label?: string;
  prefix?: string;
}

export function SlugInput({
  nameValue,
  value,
  onChange,
  excludeOrgId,
  className,
  label = 'URL slug',
  prefix = 'unusonic.com/',
}: SlugInputProps) {
  const [isChecking, setIsChecking] = React.useState(false);
  const [isAvailable, setIsAvailable] = React.useState<boolean | null>(null);

  // Auto-generate slug from name when user hasn't overridden
  React.useEffect(() => {
    if (!value && nameValue) {
      const generated = normalizeSlug(nameValue) || 'organization';
      onChange(generated);
    }
  }, [nameValue]); // Intentionally not depending on value so we don't overwrite manual edits

  // Debounced availability check
  React.useEffect(() => {
    const raw = normalizeSlug(value);
    if (!raw || raw.length < 2) {
      setIsAvailable(null);
      return;
    }
    const timeout = setTimeout(() => {
      setIsChecking(true);
      setIsAvailable(null);
      checkSlugAvailability(raw, excludeOrgId).then(({ available }) => {
        setIsAvailable(available);
        setIsChecking(false);
      });
    }, 400);
    return () => clearTimeout(timeout);
  }, [value, excludeOrgId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    onChange(next);
  };

  const prefixWidth = '6.5rem'; // unusonic.com/ in monospace
  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
        {label}
      </label>
      <div className="relative">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--stage-text-secondary)] pointer-events-none"
          style={{ width: prefixWidth }}
          aria-hidden
        >
          {prefix}
        </span>
        <Input
          value={value}
          onChange={handleChange}
          className={cn(
            'w-full h-11 font-mono text-sm rounded-xl border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-well)]/50 text-[var(--stage-text-primary)] pl-[calc(0.75rem+6.5rem)] pr-10',
            'placeholder:text-[var(--stage-text-secondary)]/60'
          )}
          placeholder="luxe"
          aria-invalid={isAvailable === false}
          aria-describedby={isAvailable === false ? 'slug-unavailable' : undefined}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 pointer-events-none">
          {isChecking && <Loader2 className="size-4 animate-spin text-[var(--stage-text-secondary)]" />}
          {!isChecking && isAvailable === true && (
            <Check className="size-4 text-[var(--color-unusonic-success)]" aria-hidden />
          )}
          {!isChecking && isAvailable === false && (
            <span className="text-label text-unusonic-error font-medium" id="slug-unavailable">
              Taken
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
