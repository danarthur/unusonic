'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { TitleSelector } from './TitleSelector';
import { RoleSelect } from './RoleSelect';
import type { UnusonicRoleId } from '../model/role-presets';
import { AvatarUpload } from './AvatarUpload';
import { PortalProfileSelect } from './PortalProfileSelect';
import type { PortalProfileKey } from '../model/schema';
import { cn } from '@/shared/lib/utils';
import { upsertGhostMember, deployInvites } from '../api/actions';
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
  const [role, setRole] = React.useState<UnusonicRoleId>(
    (defaultValues?.role as UnusonicRoleId) ?? 'member'
  );
  const [jobTitle, setJobTitle] = React.useState(defaultValues?.job_title ?? '');
  const [portalProfile, setPortalProfile] = React.useState<PortalProfileKey | null>((defaultValues?.portal_profile as PortalProfileKey) ?? null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [sendInviteNow, setSendInviteNow] = React.useState(!defaultValues?.id);

  const effectiveRole: UnusonicRoleId =
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
            portal_profile: portalProfile,
          },
          defaultValues?.id
        );
        if (!result || typeof result !== 'object') {
          setFormError('No response from server. Try again.');
          return;
        }
        if (result.ok === false) {
          setFormError(result.error ?? 'Unable to save profile.');
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
        // Optionally send invite immediately after creation
        if (sendInviteNow && !defaultValues?.id && member.id) {
          const invResult = await deployInvites(orgId, [member.id]);
          if (invResult.ok && invResult.sent > 0) {
            toast.success('Invite sent.');
          } else {
            toast.success('Profile created. Invite will be sent when you deploy.');
          }
        } else {
          toast.success(defaultValues?.id ? 'Saved.' : 'Ghost profile forged.');
        }
        onSave(member);
      } catch (err) {
        console.error('[MemberForge]', err);
        const msg = err instanceof Error ? err.message : 'Unable to save profile.';
        setFormError(msg);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[var(--stage-accent)]/30 bg-[var(--stage-accent)]/10 px-4 py-3 text-sm text-[var(--stage-text-primary)]"
        >
          <span className="shrink-0 mt-0.5 size-5 rounded-full border border-[var(--stage-accent)]/50 bg-[var(--stage-accent)]/20 flex items-center justify-center text-label font-medium text-[var(--stage-accent)]">!</span>
          <p className="flex-1">{formError}</p>
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 p-1 -m-1 rounded-md text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)] transition-colors"
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
          className="bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
        />
        <FloatingLabelInput
          label="Last name"
          value={lastName}
          onChange={(e) => { setLastName(e.target.value); clearError(); }}
          required
          className="bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
        />
      </div>

      <FloatingLabelInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); clearError(); }}
        required
        className="bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
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

      <PortalProfileSelect
        value={portalProfile}
        onChange={(v) => setPortalProfile(v as PortalProfileKey | null)}
      />

      {/* Send invite toggle — only for new members */}
      {!defaultValues?.id && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sendInviteNow}
            onChange={(e) => setSendInviteNow(e.target.checked)}
            className="size-4 rounded border-[oklch(1_0_0/0.15)] bg-[oklch(1_0_0/0.05)] accent-[var(--stage-accent)]"
          />
          <span className="text-sm text-[var(--stage-text-secondary)]">
            Send invite immediately
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="text-[var(--stage-text-secondary)]">
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={isPending}
          className="min-w-[140px] bg-[var(--stage-accent)]/90 text-[var(--stage-bg)] hover:bg-[var(--stage-accent)] border-0 shadow-[0_0_0_1px_var(--stage-accent)/30]"
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
