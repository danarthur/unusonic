'use client';

import { useFormContext } from 'react-hook-form';
import { CeramicSwitch } from '@/shared/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { PERMISSION_SCOPES, type PermissionDefinition, type PermissionScope } from '../model/permission-metadata';
import type { RoleBuilderFormValues } from '../model/schema';

interface PermissionRowProps {
  definition: PermissionDefinition;
}

export function PermissionRow({ definition }: PermissionRowProps) {
  const { watch, setValue } = useFormContext<RoleBuilderFormValues>();
  const permissionKeys = watch('permissionKeys');
  const scopes = watch('scopes') ?? {};
  const enabled = permissionKeys.includes(definition.key);
  const scope = (scopes[definition.key] ?? 'global') as PermissionScope;

  const handleToggle = (on: boolean) => {
    setValue(
      'permissionKeys',
      on ? [...permissionKeys, definition.key] : permissionKeys.filter((k) => k !== definition.key),
      { shouldValidate: true }
    );
    if (!on && definition.supportsScope) {
      const next = { ...scopes };
      delete next[definition.key];
      setValue('scopes', next, { shouldValidate: true });
    }
  };

  const handleScopeChange = (value: PermissionScope) => {
    setValue('scopes', { ...scopes, [definition.key]: value }, { shouldValidate: true });
  };

  return (
    <div className="flex items-center gap-4 py-2.5 border-b border-[var(--glass-border)] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-ceramic text-sm font-medium tracking-tight">{definition.label}</p>
        {definition.description && (
          <p className="text-ink-muted text-xs leading-relaxed mt-0.5">{definition.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <CeramicSwitch
          checked={enabled}
          onCheckedChange={handleToggle}
          aria-label={`Toggle ${definition.label}`}
        />
        {definition.supportsScope && enabled && (
          <Select value={scope} onValueChange={(v) => handleScopeChange(v as PermissionScope)}>
            <SelectTrigger size="sm" className="w-[130px] border-[var(--glass-border)] bg-[var(--glass-bg)] text-ink-muted">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              {PERMISSION_SCOPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
