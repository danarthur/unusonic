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
  SIGNAL_ROLE_PRESETS,
  ASSIGNABLE_ROLE_IDS,
  getRoleLabel,
  type SignalRoleId,
} from '../model/role-presets';
import { cn } from '@/shared/lib/utils';

export interface RoleSelectProps {
  value: SignalRoleId;
  onChange: (value: SignalRoleId) => void;
  /** When false, Admin and Manager are hidden (only owner/admin can assign them). */
  canAssignElevated?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

/**
 * Role Select — rich descriptions for the 5 Signal archetypes.
 * Replaces the simple access-level dropdown with the Advanced Access System (Phase 1).
 */
export function RoleSelect({
  value,
  onChange,
  canAssignElevated = false,
  disabled = false,
  className,
  triggerClassName,
}: RoleSelectProps) {
  const options = React.useMemo(() => {
    return ASSIGNABLE_ROLE_IDS.filter((id) => {
      const preset = SIGNAL_ROLE_PRESETS.find((p) => p.id === id);
      if (!preset?.assignable) return false;
      if (preset.requiresElevatedAssigner && !canAssignElevated) return false;
      return true;
    });
  }, [canAssignElevated]);

  const displayValue = getRoleLabel(value);
  const selectedPreset = SIGNAL_ROLE_PRESETS.find((p) => p.id === value);

  return (
    <div className={cn('space-y-2', className)}>
      <label className="block text-xs font-medium uppercase tracking-widest text-mercury/60">
        Role
      </label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as SignalRoleId)}
        disabled={disabled}
      >
        <SelectTrigger
          className={cn(
            'w-full rounded-xl border border-mercury/20 bg-white/5 px-3 py-2.5 text-ceramic',
            'hover:bg-white/[0.07] focus:border-neon/30 focus:ring-2 focus:ring-neon/20',
            'transition-colors disabled:opacity-50',
            triggerClassName
          )}
        >
          <SelectValue placeholder="Select role">
            <span className="font-medium">{displayValue}</span>
            {selectedPreset?.description && (
              <span className="ml-2 hidden text-xs text-mercury sm:inline">
                — {selectedPreset.description}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          position="popper"
          className="min-w-[var(--radix-select-trigger-width)] rounded-xl border border-mercury/20 bg-obsidian/95 backdrop-blur-xl shadow-[0_8px_32px_-8px_oklch(0_0_0/0.4)] p-1"
        >
          {options.map((id) => {
            const preset = SIGNAL_ROLE_PRESETS.find((p) => p.id === id);
            if (!preset) return null;
            return (
              <SelectItem
                key={preset.id}
                value={preset.id}
                className="py-2.5 pr-8 pl-3 text-ceramic focus:bg-neon/10 focus:text-ceramic rounded-lg"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{preset.label}</span>
                  <span className="text-xs text-mercury">
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
