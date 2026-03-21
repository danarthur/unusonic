'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { CeramicSwitch } from '@/shared/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { inviteTeamMember, type InviteTeamMemberResult } from '@/app/actions/workspace';
import { inviteTeamMemberPayloadSchema, type InviteInternalRole } from '@/app/actions/invite-team-member-schema';
import { getWorkspaceRolesForBuilder } from '@/features/role-builder/api/actions';
import { Plus, Loader2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';

const INTERNAL_ROLES: { value: InviteInternalRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
  { value: 'restricted', label: 'Observer' },
];

interface InviteTeamMemberSheetProps {
  workspaceId: string;
  canManage: boolean;
  triggerClassName?: string;
}

type FormValues = {
  first_name: string;
  last_name: string;
  email: string;
  internal_role: InviteInternalRole;
  job_title: string;
  grant_workspace_access: boolean;
  workspace_role_id: string;
};

export function InviteTeamMemberSheet({
  workspaceId,
  canManage,
  triggerClassName,
}: InviteTeamMemberSheetProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [roles, setRoles] = React.useState<{ id: string; name: string; slug: string }[]>([]);
  const [rolesLoading, setRolesLoading] = React.useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      internal_role: 'member',
      job_title: '',
      grant_workspace_access: false,
      workspace_role_id: '',
    },
  });

  const grantAccess = form.watch('grant_workspace_access');

  React.useEffect(() => {
    if (open && grantAccess && roles.length === 0) {
      setRolesLoading(true);
      getWorkspaceRolesForBuilder(workspaceId).then((res) => {
        setRolesLoading(false);
        if (res.success && res.systemRoles && res.customRoles !== undefined) {
          const custom = res.customRoles ?? [];
          setRoles([...custom, ...res.systemRoles].map((r) => ({ id: r.id, name: r.name, slug: r.slug })));
        }
      });
    }
  }, [open, grantAccess, workspaceId, roles.length]);

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset();
    setOpen(next);
  };

  const onSubmit = async (values: FormValues) => {
    const parsed = inviteTeamMemberPayloadSchema.safeParse({
      workspace_id: workspaceId,
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      email: values.email.trim(),
      internal_role: values.internal_role,
      job_title: values.job_title?.trim() || null,
      grant_workspace_access: values.grant_workspace_access,
      workspace_role_id: values.grant_workspace_access ? values.workspace_role_id || null : null,
    });

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = (first.path[0] as keyof FormValues) ?? 'root';
      form.setError(field, { message: first.message });
      return;
    }

    const result: InviteTeamMemberResult = await inviteTeamMember(parsed.data);
    if (result.success) {
      handleOpenChange(false);
      router.refresh();
    } else {
      form.setError('root', { message: result.error });
    }
  };

  const isSubmitting = form.formState.isSubmitting;
  const rootError = form.formState.errors.root?.message;

  if (!canManage) return null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild className={triggerClassName}>
        <Button variant="outline" size="sm" className="gap-2 border-[var(--color-mercury)] text-ink hover:bg-ink/5">
          <Plus className="h-4 w-4" />
          Invite team member
        </Button>
      </SheetTrigger>
      <SheetContent side="center" className="flex max-h-[90vh] flex-col overflow-hidden p-0">
        <SheetHeader className="shrink-0 border-b border-[var(--color-mercury)] p-6 pb-4">
          <SheetTitle className="flex items-center gap-2 text-ceramic">
            <UserPlus className="h-5 w-5" />
            Invite team member
          </SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pt-4"
        >
          {rootError && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {rootError}
            </div>
          )}

          {/* Section A: Roster details (required) */}
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">
              Roster details
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="invite-first_name" className="block text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5">First name</label>
                <Input
                  id="invite-first_name"
                  {...form.register('first_name', { required: 'First name required' })}
                  className="border-[var(--color-mercury)] bg-transparent"
                  placeholder="Jane"
                />
                {form.formState.errors.first_name && (
                  <p className="text-xs text-red-400">{form.formState.errors.first_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="invite-last_name" className="block text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5">Last name</label>
                <Input
                  id="invite-last_name"
                  {...form.register('last_name', { required: 'Last name required' })}
                  className="border-[var(--color-mercury)] bg-transparent"
                  placeholder="Doe"
                />
                {form.formState.errors.last_name && (
                  <p className="text-xs text-red-400">{form.formState.errors.last_name.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="invite-email" className="block text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5">Email</label>
              <Input
                id="invite-email"
                type="email"
                {...form.register('email', { required: 'Email required' })}
                className="border-[var(--color-mercury)] bg-transparent"
                placeholder="jane@company.com"
              />
              {form.formState.errors.email && (
                <p className="text-xs text-red-400">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5">Internal team role</label>
              <Select
                value={form.watch('internal_role')}
                onValueChange={(v) => form.setValue('internal_role', v as InviteInternalRole)}
              >
                <SelectTrigger className="border-[var(--color-mercury)] bg-transparent">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  {INTERNAL_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-ink-muted">
                Their rank on the org roster (scheduling, crew, etc.)
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="invite-job_title" className="block text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5">Job title (optional)</label>
              <Input
                id="invite-job_title"
                {...form.register('job_title')}
                className="border-[var(--color-mercury)] bg-transparent"
                placeholder="e.g. Audio A1"
              />
            </div>
          </div>

          {/* Section B: Grant Signal login access */}
          <div className="mt-8 space-y-4 border-t border-[var(--color-mercury)] pt-6">
            <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">
              System access
            </p>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-mercury)] bg-ink/[0.02] p-4">
              <div>
                <p className="font-medium text-ink">Grant Signal login access?</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  If off, they are only on the roster (no invite email). Turn on to send an invite and assign a workspace role.
                </p>
              </div>
              <CeramicSwitch
                checked={grantAccess}
                onCheckedChange={(checked) => {
                  form.setValue('grant_workspace_access', checked);
                  if (!checked) form.setValue('workspace_role_id', '');
                }}
                aria-label="Grant Signal login access"
              />
            </div>
          </div>

          {/* Section C: Workspace role (only when grant access is on) */}
          {grantAccess && (
            <div className="mt-6 space-y-4">
              <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">
                Workspace role
              </p>
              {rolesLoading ? (
                <div className="h-10 w-48 animate-pulse rounded-xl border border-[var(--color-mercury)] bg-ink/5" />
              ) : (
                <div className="space-y-2">
                  <Select
                    value={form.watch('workspace_role_id')}
                    onValueChange={(v) => form.setValue('workspace_role_id', v)}
                  >
                    <SelectTrigger className="border-[var(--color-mercury)] bg-transparent">
                      <SelectValue placeholder="Select role (required)" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 overflow-y-auto">
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.workspace_role_id && (
                    <p className="text-xs text-red-400">{form.formState.errors.workspace_role_id.message}</p>
                  )}
                  <p className="text-xs text-ink-muted">
                    What they can do in the app (permissions bundle).
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 flex shrink-0 justify-end gap-2 border-t border-[var(--color-mercury)] pt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send invite'
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
