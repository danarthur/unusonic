'use client';

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import {
  UNUSONIC_ROLE_PRESETS,
  ASSIGNABLE_ROLE_IDS,
  getRoleLabel,
  type UnusonicRoleId,
} from '../model/role-presets';
import { cn } from '@/shared/lib/utils';

export interface RoleSelectProps {
  value: UnusonicRoleId;
  onChange: (value: UnusonicRoleId) => void;
  /** When false, Admin and Manager are hidden (only owner/admin can assign them). */
  canAssignElevated?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  /** When false, suppresses the internal "Role" label (use when the parent handles labelling). */
  showLabel?: boolean;
}

/**
 * Role Select — rich descriptions for the 5 Unusonic archetypes.
 * Replaces the simple access-level dropdown with the Advanced Access System (Phase 1).
 */
export function RoleSelect({
  value,
  onChange,
  canAssignElevated = false,
  disabled = false,
  className,
  triggerClassName,
  showLabel = true,
}: RoleSelectProps) {
  const options = React.useMemo(() => {
    return ASSIGNABLE_ROLE_IDS.filter((id) => {
      const preset = UNUSONIC_ROLE_PRESETS.find((p) => p.id === id);
      if (!preset?.assignable) return false;
      if (preset.requiresElevatedAssigner && !canAssignElevated) return false;
      return true;
    });
  }, [canAssignElevated]);

  const displayValue = getRoleLabel(value);
  const selectedPreset = UNUSONIC_ROLE_PRESETS.find((p) => p.id === value);

  return (
    <div className={cn('space-y-2', className)}>
      {showLabel && (
        <label className="block text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
          Role
        </label>
      )}
      <Select
        value={value}
        onValueChange={(v) => onChange(v as UnusonicRoleId)}
        disabled={disabled}
      >
        <SelectTrigger
          className={cn(
            'w-full rounded-xl border border-[oklch(1_0_0_/_0.04)] bg-[oklch(1_0_0_/_0.05)] px-3 py-2.5 text-[var(--stage-text-primary)]',
            'hover:bg-[oklch(1_0_0_/_0.07)] focus:border-[oklch(1_0_0_/_0.14)] focus:ring-2 focus:ring-[var(--stage-accent)]/30',
            'transition-colors disabled:opacity-50',
            triggerClassName
          )}
        >
          <SelectValue placeholder="Select role">
            <span className="font-medium">{displayValue}</span>
            {selectedPreset?.description && (
              <span className="ml-2 hidden text-xs text-[var(--stage-text-secondary)] sm:inline">
                — {selectedPreset.description}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          position="popper"
          className="min-w-[var(--radix-select-trigger-width)] rounded-xl border border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-surface-raised)] shadow-[0_8px_32px_-8px_oklch(0_0_0/0.4)] p-1"
        >
          {options.map((id) => {
            const preset = UNUSONIC_ROLE_PRESETS.find((p) => p.id === id);
            if (!preset) return null;
            return (
              <SelectItem
                key={preset.id}
                value={preset.id}
                className="py-2.5 pr-8 pl-3 text-[var(--stage-text-primary)] focus:bg-[oklch(1_0_0_/_0.08)] focus:text-[var(--stage-text-primary)] rounded-lg"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{preset.label}</span>
                  <span className="text-xs text-[var(--stage-text-secondary)]">
                    {preset.description}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
