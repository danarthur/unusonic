'use client';

import { useState, useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { getDefaultFormValues, type RoleBuilderFormValues } from '../model/schema';
import { getPermissionLabel, type PermissionScope } from '../model/permission-metadata';
import {
  getWorkspaceRolesForBuilder,
  createCustomRole,
  updateCustomRole,
  type RoleWithPermissions,
} from '../api/actions';
import { RoleSidebar } from './RoleSidebar';
import { RoleEditorForm } from './RoleEditorForm';
import { M3_FADE_THROUGH_VARIANTS } from '@/shared/lib/motion-constants';

type SubscriptionTier = 'foundation' | 'growth' | 'venue_os' | 'autonomous';

const ROLE_BUILDER_TIERS: SubscriptionTier[] = ['venue_os', 'autonomous'];

interface RoleBuilderShellProps {
  workspaceId: string;
  /** When foundation or growth, show read-only system roles only and hide Duplicate / custom roles. */
  subscriptionTier?: SubscriptionTier;
}

export function RoleBuilderShell({ workspaceId, subscriptionTier = 'foundation' }: RoleBuilderShellProps) {
  const canUseFullRoleBuilder = ROLE_BUILDER_TIERS.includes(subscriptionTier);
  const [systemRoles, setSystemRoles] = useState<RoleWithPermissions[]>([]);
  const [customRoles, setCustomRoles] = useState<RoleWithPermissions[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [draftFromDuplicate, setDraftFromDuplicate] = useState<RoleWithPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRoles = async () => {
    const res = await getWorkspaceRolesForBuilder(workspaceId);
    if (res.success && res.systemRoles) {
      setSystemRoles(res.systemRoles);
      setCustomRoles(canUseFullRoleBuilder && res.customRoles ? res.customRoles : []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchRoles();
  }, [workspaceId, canUseFullRoleBuilder]);

  const selectedRole = selectedRoleId
    ? [...systemRoles, ...customRoles].find((r) => r.id === selectedRoleId)
    : null;
  const isEditingDraft = draftFromDuplicate != null;
  const isEditingCustom = selectedRole != null && !selectedRole.is_system;

  const form = useForm<RoleBuilderFormValues>({
    defaultValues: getDefaultFormValues(),
  });

  useEffect(() => {
    if (draftFromDuplicate) {
      form.reset(
        getDefaultFormValues({
          name: `Copy of ${draftFromDuplicate.name}`,
          slug: `copy-of-${draftFromDuplicate.slug}`,
          permissionKeys: [...draftFromDuplicate.permissionKeys],
          scopes: {},
        })
      );
      return;
    }
    const selectedCustomRole = selectedRoleId ? customRoles.find((r) => r.id === selectedRoleId) : null;
    if (selectedRoleId && selectedCustomRole) {
      form.reset(
        getDefaultFormValues({
          name: selectedCustomRole.name,
          slug: selectedCustomRole.slug,
          permissionKeys: [...selectedCustomRole.permissionKeys],
          scopes: {},
        })
      );
      return;
    }
    form.reset(getDefaultFormValues());
  }, [draftFromDuplicate, selectedRoleId, customRoles]);

  const handleSelectRole = (role: RoleWithPermissions) => {
    setDraftFromDuplicate(null);
    setSelectedRoleId(role.id);
  };

  const handleDuplicateToCustom = canUseFullRoleBuilder
    ? (template: RoleWithPermissions) => {
        setSelectedRoleId(null);
        setDraftFromDuplicate(template);
      }
    : undefined;

  const handleCreateRole = async (data: RoleBuilderFormValues) => {
    const res = await createCustomRole(workspaceId, {
      name: data.name,
      slug: data.slug,
      permissionKeys: data.permissionKeys,
      scopes: data.scopes as Record<string, PermissionScope>,
    });
    if (res.success) {
      setDraftFromDuplicate(null);
      await fetchRoles();
    } else {
      form.setError('root', { message: res.error ?? 'Failed to create role' });
    }
  };

  const handleUpdateRole = async (data: RoleBuilderFormValues) => {
    if (!selectedRoleId || !selectedRole?.id) return;
    const res = await updateCustomRole(selectedRoleId, workspaceId, {
      name: data.name,
      slug: data.slug,
      permissionKeys: data.permissionKeys,
      scopes: data.scopes as Record<string, PermissionScope>,
    });
    if (res.success) {
      await fetchRoles();
    } else {
      form.setError('root', { message: res.error ?? 'Failed to update role' });
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <LiquidPanel className="p-4">
          <div className="h-5 w-28 rounded bg-ink/15 animate-pulse" />
          <div className="mt-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-11 rounded-lg bg-ink/10 animate-pulse" />
            ))}
          </div>
        </LiquidPanel>
        <LiquidPanel className="p-6">
          <div className="h-6 w-48 rounded bg-ink/15 animate-pulse" />
          <div className="mt-4 h-24 rounded-lg bg-ink/10 animate-pulse" />
        </LiquidPanel>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[240px_1fr]">
      <aside className="liquid-card p-4 border border-[var(--glass-border)]">
        <RoleSidebar
          systemRoles={systemRoles}
          customRoles={canUseFullRoleBuilder ? customRoles : []}
          selectedRoleId={isEditingDraft ? null : selectedRoleId}
          onSelectRole={handleSelectRole}
          onDuplicateToCustom={handleDuplicateToCustom}
          readOnly={!canUseFullRoleBuilder}
        />
      </aside>

      <main className="min-w-0">
        <AnimatePresence mode="wait">
          {isEditingDraft && (
            <motion.div
              key="draft"
              initial={M3_FADE_THROUGH_VARIANTS.hidden}
              animate={M3_FADE_THROUGH_VARIANTS.visible}
              exit={M3_FADE_THROUGH_VARIANTS.hidden}
              transition={{ duration: 0.2 }}
            >
              <LiquidPanel className="p-6">
                <h2 className="text-ceramic tracking-tight font-medium mb-1">New custom role</h2>
                <p className="text-ink-muted text-sm leading-relaxed mb-6">
                  Based on {draftFromDuplicate?.name}. Edit name and permissions below.
                </p>
                <FormProvider {...form}>
                  <RoleEditorForm
                    isSystemRole={false}
                    onSubmit={handleCreateRole}
                    submitLabel="Create role"
                  />
                </FormProvider>
                {form.formState.errors?.root?.message && (
                  <p className="text-[var(--color-signal-error)] text-sm leading-relaxed mt-3">{form.formState.errors.root.message}</p>
                )}
              </LiquidPanel>
            </motion.div>
          )}

          {!isEditingDraft && isEditingCustom && selectedRole && (
            <motion.div
              key={selectedRole.id}
              initial={M3_FADE_THROUGH_VARIANTS.hidden}
              animate={M3_FADE_THROUGH_VARIANTS.visible}
              exit={M3_FADE_THROUGH_VARIANTS.hidden}
              transition={{ duration: 0.2 }}
            >
              <LiquidPanel className="p-6">
                <h2 className="text-ceramic tracking-tight font-medium mb-1">Edit role</h2>
                <p className="text-ink-muted text-sm leading-relaxed mb-6">{selectedRole.name}</p>
                <FormProvider {...form}>
                  <RoleEditorForm
                    isSystemRole={false}
                    onSubmit={handleUpdateRole}
                    submitLabel="Update role"
                  />
                </FormProvider>
                {form.formState.errors?.root?.message && (
                  <p className="text-[var(--color-signal-error)] text-sm leading-relaxed mt-3">{form.formState.errors.root.message}</p>
                )}
              </LiquidPanel>
            </motion.div>
          )}

          {!isEditingDraft && selectedRole?.is_system && (
            <motion.div
              key={`system-${selectedRole.id}`}
              initial={M3_FADE_THROUGH_VARIANTS.hidden}
              animate={M3_FADE_THROUGH_VARIANTS.visible}
              exit={M3_FADE_THROUGH_VARIANTS.hidden}
              transition={{ duration: 0.2 }}
            >
              <LiquidPanel className="p-6">
                <h2 className="text-ceramic tracking-tight font-medium mb-1">{selectedRole.name}</h2>
                <p className="text-ink-muted text-sm leading-relaxed mb-4">
                  {canUseFullRoleBuilder
                    ? 'System template. Duplicate to create a custom role with these permissions.'
                    : 'System template. Upgrade to Venue OS or Autonomous to create custom roles.'}
                </p>
                <ul className="space-y-1.5 text-sm text-ink-muted leading-relaxed mb-6">
                  {selectedRole.permissionKeys.map((key) => (
                    <li key={key}>{getPermissionLabel(key)}</li>
                  ))}
                </ul>
                {canUseFullRoleBuilder && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDuplicateToCustom?.(selectedRole)}
                    className="border-[var(--glass-border)] text-ink-muted hover:text-ceramic hover:border-[var(--glass-border-hover)]"
                  >
                    <Copy className="size-4 mr-2" />
                    Duplicate to custom role
                  </Button>
                )}
              </LiquidPanel>
            </motion.div>
          )}

          {!isEditingDraft && !selectedRoleId && (
            <motion.div
              key="empty"
              initial={M3_FADE_THROUGH_VARIANTS.hidden}
              animate={M3_FADE_THROUGH_VARIANTS.visible}
              exit={M3_FADE_THROUGH_VARIANTS.hidden}
              transition={{ duration: 0.2 }}
            >
              <LiquidPanel className="p-12 text-center">
                <p className="text-ink-muted leading-relaxed">Select a role or duplicate a system template to edit.</p>
              </LiquidPanel>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
