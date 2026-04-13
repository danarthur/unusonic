'use client';

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { PORTAL_PROFILES } from '@/shared/lib/portal-profiles';
import { cn } from '@/shared/lib/utils';

const AUTO_DETECT_VALUE = '__auto__';

export interface PortalProfileSelectProps {
  /** Current profile key, or null/undefined for auto-detect. */
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
}

const profileOptions = Object.values(PORTAL_PROFILES).map((p) => ({
  key: p.key,
  label: p.label,
}));

/**
 * Portal type selector for admin override.
 * "Auto-detect" clears the override; selecting a profile sets `primary_portal_profile`.
 */
export function PortalProfileSelect({
  value,
  onChange,
  disabled = false,
  className,
}: PortalProfileSelectProps) {
  const selectValue = value ?? AUTO_DETECT_VALUE;

  const handleChange = (v: string) => {
    onChange(v === AUTO_DETECT_VALUE ? null : v);
  };

  const displayLabel = value && PORTAL_PROFILES[value]
    ? PORTAL_PROFILES[value].label
    : 'Auto-detect';

  return (
    <div className={cn('space-y-2', className)}>
      <label className="block text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
        Portal type
      </label>
      <Select value={selectValue} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger
          className={cn(
            'w-full rounded-xl border border-[oklch(1_0_0_/_0.04)] bg-[oklch(1_0_0_/_0.05)] px-3 py-2.5 text-[var(--stage-text-primary)]',
            'hover:bg-[oklch(1_0_0_/_0.07)] focus-visible:border-[oklch(1_0_0_/_0.14)] focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/30',
            'transition-colors disabled:opacity-45'
          )}
        >
          <SelectValue placeholder="Auto-detect">
            <span className="font-medium">{displayLabel}</span>
            {!value && (
              <span className="ml-2 hidden text-xs text-[var(--stage-text-secondary)] sm:inline">
                — derived from capabilities and skills
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          position="popper"
          className="min-w-[var(--radix-select-trigger-width)] rounded-xl border border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-surface-raised)] shadow-[0_8px_32px_-8px_oklch(0_0_0/0.4)] p-1"
        >
          <SelectItem
            value={AUTO_DETECT_VALUE}
            className="py-2.5 pr-8 pl-3 text-[var(--stage-text-primary)] focus:bg-[oklch(1_0_0_/_0.08)] focus:text-[var(--stage-text-primary)] rounded-lg"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">Auto-detect</span>
              <span className="text-xs text-[var(--stage-text-secondary)]">
                Derived from capabilities and skills
              </span>
            </div>
          </SelectItem>
          {profileOptions.map((opt) => (
            <SelectItem
              key={opt.key}
              value={opt.key}
              className="py-2.5 pr-8 pl-3 text-[var(--stage-text-primary)] focus:bg-[oklch(1_0_0_/_0.08)] focus:text-[var(--stage-text-primary)] rounded-lg"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{opt.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
