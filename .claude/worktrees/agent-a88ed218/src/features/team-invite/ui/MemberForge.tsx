'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { TitleSelector } from './TitleSelector';
import { RoleSelect } from './RoleSelect';
import type { SignalRoleId } from '../model/role-presets';
import { AvatarUpload } from './AvatarUpload';
import { cn } from '@/shared/lib/utils';
import { upsertGhostMember } from '../api/actions';
import type { RosterBadgeData } from '../model/types';
import type { MemberForgeDefaults } from '../model/types';
import { toast } from 'sonner';

export interface MemberForgeProps {
  orgId: string;
  defaultValues?: MemberForgeDefaults | null;
  onSave: (member: RosterBadgeData) => void;
  onCancel?: () => void;
  /** Distinct job_title values from org_members for TitleSelector autocomplete. */
  existingTitles?: string[];
  /** When false, Admin option is hidden (only owner/admin can assign admin). */
  canAssignAdmin?: boolean;
  className?: string;
}

/**
 * Profile Architect: Avatar, Identity, Job Title (creatable), Access Level (fixed).
 */
export function MemberForge({
  orgId,
  defaultValues,
  onSave,
  onCancel,
  existingTitles = [],
  canAssignAdmin = false,
  className,
}: MemberForgeProps) {
  const [isPending, startTransition] = useTransition();
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(defaultValues?.avatarUrl ?? null);
  const [firstName, setFirstName] = React.useState(defaultValues?.first_name ?? '');
  const [lastName, setLastName] = React.useState(defaultValues?.last_name ?? '');
  const [email, setEmail] = React.useState(defaultValues?.email ?? '');
  const [role, setRole] = React.useState<SignalRoleId>(
    (defaultValues?.role as SignalRoleId) ?? 'member'
  );
  const [jobTitle, setJobTitle] = React.useState(defaultValues?.job_title ?? '');
  const [formError, setFormError] = React.useState<string | null>(null);

  const effectiveRole: SignalRoleId =
    !canAssignAdmin && (role === 'admin' || role === 'manager') ? 'member' : role;

  const clearError = React.useCallback(() => {
    setFormError(null);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const first = firstName.trim();
    const last = lastName.trim();
    const emailTrim = email.trim();
    if (!first || !last) {
      setFormError('Name required.');
      return;
    }
    if (!emailTrim.includes('@')) {
      setFormError('Valid email required.');
      return;
    }

    startTransition(async () => {
      try {
        const result = await upsertGhostMember(
          orgId,
          {
            first_name: first,
            last_name: last,
            email: emailTrim,
            role: effectiveRole,
            job_title: jobTitle.trim() || null,
            avatarUrl: avatarUrl ?? null,
          },
          defaultValues?.id
        );
        if (!result || typeof result !== 'object') {
          setFormError('No response from server. Try again.');
          return;
        }
        if (result.ok === false) {
          setFormError(result.error ?? 'Something went wrong.');
          return;
        }
        const raw = result.member;
        if (!raw?.id || !raw?.email) {
          setFormError('Invalid response from server. Try again.');
          return;
        }
        const member: RosterBadgeData = {
          ...raw,
          avatarUrl: avatarUrl ?? raw.avatarUrl ?? null,
        };
        toast.success(defaultValues?.id ? 'Saved.' : 'Ghost profile forged.');
        onSave(member);
      } catch (err) {
        console.error('[MemberForge]', err);
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        setFormError(msg);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[var(--color-silk)]/30 bg-[var(--color-silk)]/10 px-4 py-3 text-sm text-[var(--color-ink)]"
        >
          <span className="shrink-0 mt-0.5 size-5 rounded-full border border-[var(--color-silk)]/50 bg-[var(--color-silk)]/20 flex items-center justify-center text-[10px] font-medium text-[var(--color-silk)]">!</span>
          <p className="flex-1">{formError}</p>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 p-1 -m-1 rounded-md text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-white/10 transition-colors"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      <AvatarUpload orgId={orgId} value={avatarUrl} onChange={setAvatarUrl} />

      <div className="grid grid-cols-2 gap-4">
        <FloatingLabelInput
          label="First name"
          value={firstName}
          onChange={(e) => { setFirstName(e.target.value); clearError(); }}
          required
          className="bg-white/5 border-[var(--color-mercury)]"
        />
        <FloatingLabelInput
          label="Last name"
          value={lastName}
          onChange={(e) => { setLastName(e.target.value); clearError(); }}
          required
          className="bg-white/5 border-[var(--color-mercury)]"
        />
      </div>

      <FloatingLabelInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); clearError(); }}
        required
        className="bg-white/5 border-[var(--color-mercury)]"
      />

      <TitleSelector
        value={jobTitle}
        onChange={setJobTitle}
        existingTitles={existingTitles}
        placeholder="Select or create title…"
      />

      <RoleSelect
        value={effectiveRole}
        onChange={setRole}
        canAssignElevated={canAssignAdmin}
      />

      <div className="flex flex-wrap items-center justify-end gap-2 pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="text-[var(--color-ink-muted)]">
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={isPending}
          className="min-w-[140px] bg-[var(--color-silk)]/90 text-[var(--color-canvas)] hover:bg-[var(--color-silk)] border-0 shadow-[0_0_0_1px_var(--color-silk)/30]"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Forging…
            </>
          ) : defaultValues?.id ? (
            'Save'
          ) : (
            'Confirm Ghost Profile'
          )}
        </Button>
      </div>
    </form>
  );
}
