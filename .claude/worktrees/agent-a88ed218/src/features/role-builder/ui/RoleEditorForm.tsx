'use client';

import { useFormContext } from 'react-hook-form';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';
import { PermissionModuleGroup } from './PermissionModuleGroup';
import { getDefinitionsByModule, MODULE_ORDER } from '../model/permission-metadata';
import { roleBuilderFormSchema, slugFromName, type RoleBuilderFormValues } from '../model/schema';

interface RoleEditorFormProps {
  isSystemRole?: boolean;
  onSubmit: (data: RoleBuilderFormValues) => void | Promise<void>;
  submitLabel: string;
}

export function RoleEditorForm({
  isSystemRole = false,
  onSubmit,
  submitLabel,
}: RoleEditorFormProps) {
  const { register, watch, setValue, handleSubmit, setError, formState: { errors } } = useFormContext<RoleBuilderFormValues>();

  const onValidSubmit = (data: RoleBuilderFormValues) => {
    const parsed = roleBuilderFormSchema.safeParse(data);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      (Object.keys(fieldErrors) as (keyof RoleBuilderFormValues)[]).forEach((key) => {
        const msg = fieldErrors[key]?.[0];
        if (msg) setError(key, { message: msg });
      });
      return;
    }
    void onSubmit(parsed.data);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValue('name', v);
    setValue('slug', slugFromName(v), { shouldValidate: true });
  };

  const definitionsByModule = getDefinitionsByModule();

  return (
    <form onSubmit={handleSubmit(onValidSubmit)} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="role-name" className="text-xs uppercase tracking-widest text-ink-muted block mb-1.5">
            Role name
          </label>
          <Input
            id="role-name"
            {...register('name')}
            onChange={handleNameChange}
            disabled={isSystemRole}
            placeholder="e.g. Warehouse Manager"
            className="bg-[var(--glass-bg)] border-[var(--glass-border)] text-ceramic placeholder:text-ink-muted/70"
          />
          {errors?.name?.message && (
            <p className="text-[var(--color-signal-error)] text-xs leading-relaxed mt-1">{String(errors.name.message)}</p>
          )}
        </div>
        <div>
          <label htmlFor="role-slug" className="text-xs uppercase tracking-widest text-ink-muted block mb-1.5">
            Slug
          </label>
          <Input
            id="role-slug"
            {...register('slug')}
            disabled={isSystemRole}
            placeholder="e.g. warehouse-manager"
            className="bg-[var(--glass-bg)] border-[var(--glass-border)] text-ceramic placeholder:text-ink-muted/70 font-mono text-sm"
          />
          {errors?.slug?.message && (
            <p className="text-[var(--color-signal-error)] text-xs leading-relaxed mt-1">{String(errors.slug.message)}</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-ceramic tracking-tight font-medium mb-3">Permissions</h3>
        <div className="space-y-3">
          {MODULE_ORDER.map((moduleId, i) => {
            const perms = definitionsByModule[moduleId];
            if (!perms.length) return null;
            return (
              <PermissionModuleGroup
                key={moduleId}
                moduleId={moduleId}
                permissions={perms}
                defaultOpen={i === 0}
              />
            );
          })}
        </div>
      </div>

      {!isSystemRole && (
        <div className="pt-2">
          <Button
            type="submit"
            variant="outline"
            size="default"
            className="rounded-xl border border-[var(--color-neon-blue)]/50 bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)] font-medium tracking-tight hover:bg-[var(--color-neon-blue)]/20 hover:border-[var(--color-neon-blue)]/60 hover:text-[var(--color-neon-blue)] transition-colors shadow-[var(--glass-shadow)]"
          >
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
