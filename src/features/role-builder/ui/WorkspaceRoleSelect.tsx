'use client';

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { getWorkspaceRolesForBuilder, updateMemberRole } from '../api/actions';

export interface WorkspaceRoleSelectProps {
  workspaceId: string;
  memberId: string;
  value: string | null;
  disabled?: boolean;
  onSuccess?: () => void;
  className?: string;
  triggerClassName?: string;
  /** Override the label (default: "Role"). Use e.g. "Workspace role" when shown next to org role. */
  label?: string;
}

/**
 * Dropdown of workspace roles (system + custom) for assigning a member's role.
 * Uses getWorkspaceRolesForBuilder and updateMemberRole. Styled for Unusonic (stage-panel, Stage Engineering tokens).
 */
export function WorkspaceRoleSelect({
  workspaceId,
  memberId,
  value,
  disabled = false,
  onSuccess,
  className,
  triggerClassName,
  label = 'Role',
}: WorkspaceRoleSelectProps) {
  const [roles, setRoles] = React.useState<{ id: string; name: string; slug: string; is_system: boolean }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getWorkspaceRolesForBuilder(workspaceId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.success && res.systemRoles) {
        const custom = res.customRoles ?? [];
        setRoles([...custom, ...res.systemRoles]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const displayValue = React.useMemo(() => {
    if (!value) return 'Select role…';
    const r = roles.find((x) => x.id === value);
    return r?.name ?? 'Select role…';
  }, [value, roles]);

  const handleChange = React.useCallback(
    async (roleId: string) => {
      setError(null);
      setSaving(true);
      const res = await updateMemberRole(workspaceId, memberId, roleId);
      setSaving(false);
      if (res.success) {
        onSuccess?.();
      } else {
        setError(res.error ?? 'Failed to update role');
      }
    },
    [workspaceId, memberId, onSuccess]
  );

  if (loading) {
    return (
      <div className={className}>
        <label className="block text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-1.5">
          {label}
        </label>
        <div className="h-9 w-full rounded-xl border border-[var(--stage-border)] bg-[var(--stage-surface)] stage-skeleton" />
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="block text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-1.5">
        {label}
      </label>
      <Select
        value={value ?? undefined}
        onValueChange={handleChange}
        disabled={disabled || saving}
      >
        <SelectTrigger
          size="default"
          className={cn(
            'w-full rounded-xl border border-[var(--stage-border)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)]',
            'hover:bg-[var(--stage-surface)]/80 focus:border-[var(--stage-accent)]/30 focus:ring-2 focus:ring-[var(--stage-accent)]/20',
            triggerClassName
          )}
        >
          <SelectValue placeholder="Select role…">
            <span className="font-medium">{displayValue}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          position="popper"
          className="rounded-xl border border-[var(--stage-border)] bg-[var(--stage-surface)] max-h-64 overflow-y-auto"
        >
          {roles.map((r) => (
            <SelectItem
              key={r.id}
              value={r.id}
              className="py-2.5 pr-8 pl-3 text-[var(--stage-text-primary)] focus:bg-[var(--stage-accent)]/10 focus:text-[var(--stage-text-primary)]"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.name}</span>
                {r.is_system && (
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase tracking-wider text-[var(--stage-text-secondary)]/80 border-[var(--stage-border)]"
                  >
                    System
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="mt-1.5 text-xs text-[var(--color-unusonic-error)]/90">{error}</p>
      )}
    </div>
  );
}
