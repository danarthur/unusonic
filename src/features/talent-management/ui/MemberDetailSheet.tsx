'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Trash2, User } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetBody,
} from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/utils';
import type { OrgMemberWithSkillsDTO } from '@/entities/talent';
import {
  getMemberForSheet,
  updateMemberIdentity,
  addSkillToMember,
  removeSkillFromMember,
} from '../api/member-actions';
import { RoleSelect } from '@/features/team-invite/ui/RoleSelect';
import type { SignalRoleId } from '@/features/team-invite/model/role-presets';
import { WorkspaceRoleSelect } from '@/features/role-builder';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { getWorkspaceMemberByOrgMemberId } from '../api/member-actions';

const PRESET_SKILL_TAGS = [
  'Audio A1',
  'Audio A2',
  'DJ',
  'Lighting',
  'Video',
  'Camera Op',
  'Stage Manager',
  'Rigging',
  'GrandMA3',
  'Backline',
];

function displayName(member: OrgMemberWithSkillsDTO): string {
  if (member.first_name || member.last_name) {
    return [member.first_name, member.last_name].filter(Boolean).join(' ').trim();
  }
  return member.profiles?.full_name ?? member.profiles?.email ?? 'Member';
}

type TabId = 'profile' | 'skills' | 'settings';

interface MemberDetailSheetProps {
  orgMemberId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial data (optional); if not provided, fetched when open. */
  initialMember?: OrgMemberWithSkillsDTO | null;
  onSuccess?: () => void;
}

export function MemberDetailSheet({
  orgMemberId,
  open,
  onOpenChange,
  initialMember,
  onSuccess,
}: MemberDetailSheetProps) {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const [tab, setTab] = React.useState<TabId>('profile');
  const [member, setMember] = React.useState<OrgMemberWithSkillsDTO | null>(initialMember ?? null);
  const [addSkillTag, setAddSkillTag] = React.useState('');
  const [role, setRole] = React.useState<SignalRoleId>((member?.role as SignalRoleId) ?? 'member');
  const [workspaceMember, setWorkspaceMember] = React.useState<{
    workspaceMemberId: string;
    roleId: string | null;
  } | null>(null);

  React.useEffect(() => {
    if (member?.role) setRole((member.role as SignalRoleId) || 'member');
  }, [member?.role]);

  React.useEffect(() => {
    if (open && orgMemberId) {
      if (initialMember?.id === orgMemberId) {
        setMember(initialMember);
      } else {
        getMemberForSheet(orgMemberId).then(setMember);
      }
    } else {
      setMember(null);
    }
  }, [open, orgMemberId, initialMember?.id]);

  React.useEffect(() => {
    if (!open || !member?.id || !workspaceId) {
      setWorkspaceMember(null);
      return;
    }
    let cancelled = false;
    getWorkspaceMemberByOrgMemberId(member.id, workspaceId).then((res) => {
      if (!cancelled && res) setWorkspaceMember(res);
      else if (!cancelled) setWorkspaceMember(null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, member?.id, workspaceId]);

  const [identityState, submitIdentity] = useActionState(
    async (
      _prev: { ok: boolean; error?: string } | null,
      formData: FormData
    ): Promise<{ ok: boolean; error?: string } | null> => {
      const org_member_id = formData.get('org_member_id') as string;
      const first_name = (formData.get('first_name') as string)?.trim() || null;
      const last_name = (formData.get('last_name') as string)?.trim() || null;
      const phone = (formData.get('phone') as string)?.trim() || null;
      const job_title = (formData.get('job_title') as string)?.trim() || null;
      const roleRaw = formData.get('role') as string;
      const roleValue = roleRaw && ['owner', 'admin', 'manager', 'member', 'restricted'].includes(roleRaw) ? roleRaw : undefined;
      const result = await updateMemberIdentity({
        org_member_id,
        first_name,
        last_name,
        phone,
        job_title,
        role: roleValue as SignalRoleId | undefined,
      });
      return result.ok ? result : { ok: false, error: result.error };
    },
    null
  );

  React.useEffect(() => {
    if (!identityState) return;
    if (identityState.ok) {
      toast.success('Profile updated.');
      onSuccess?.();
      router.refresh();
      if (member) {
        getMemberForSheet(member.id).then(setMember);
      }
    } else {
      toast.error(identityState.error);
    }
  }, [identityState, member?.id, onSuccess, router]);

  const handleAddSkill = async () => {
    if (!member || !addSkillTag.trim()) return;
    const result = await addSkillToMember({ org_member_id: member.id, skill_tag: addSkillTag.trim() });
    if (result.ok) {
      toast.success('Skill added.');
      getMemberForSheet(member.id).then(setMember);
      setAddSkillTag('');
      onSuccess?.();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemoveSkill = async (talent_skill_id: string) => {
    const result = await removeSkillFromMember({ talent_skill_id });
    if (result.ok) {
      toast.success('Skill removed.');
      if (member) getMemberForSheet(member.id).then(setMember);
      onSuccess?.();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const isContractor = member?.employment_status === 'external_contractor';
  const tabs: { id: TabId; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'skills', label: 'Skills' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'flex max-w-md flex-col border-l border-white/10 backdrop-blur-xl',
          'bg-[var(--color-glass-surface)]/80'
        )}
      >
        {member && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-mercury)]/20">
                  <User className="size-5 text-[var(--color-ink-muted)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">
                    {displayName(member)}
                  </SheetTitle>
                  <Badge
                    variant="outline"
                    className={cn(
                      'mt-1 text-[10px]',
                      isContractor
                        ? 'border-[var(--color-signal-warning)]/50 text-[var(--color-signal-warning)]'
                        : 'border-[var(--color-silk)]/50 text-[var(--color-silk)]'
                    )}
                  >
                    {isContractor ? 'Contractor' : 'Employee'}
                  </Badge>
                </div>
              </div>
              <SheetClose />
            </SheetHeader>
            <div className="flex gap-1 border-b border-[var(--color-mercury)]/50 px-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'rounded-t-md px-3 py-2 text-xs font-medium transition-colors',
                    tab === t.id
                      ? 'bg-[var(--color-mercury)]/20 text-[var(--color-ink)]'
                      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <SheetBody className="flex flex-col gap-4 overflow-y-auto">
              {tab === 'profile' && (
                <form action={submitIdentity} className="flex flex-col gap-4">
                  <input type="hidden" name="org_member_id" value={member.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--color-ink-muted)]">
                        First name
                      </label>
                      <Input
                        name="first_name"
                        type="text"
                        defaultValue={member.first_name ?? ''}
                        placeholder="First"
                        className="bg-transparent border-[var(--color-mercury)] text-[var(--color-ink)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--color-ink-muted)]">
                        Last name
                      </label>
                      <Input
                        name="last_name"
                        type="text"
                        defaultValue={member.last_name ?? ''}
                        placeholder="Last"
                        className="bg-transparent border-[var(--color-mercury)] text-[var(--color-ink)]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--color-ink-muted)]">
                      Phone
                    </label>
                    <Input
                      name="phone"
                      type="tel"
                      defaultValue={member.phone ?? ''}
                      placeholder="+1 555 000 0000"
                      className="bg-transparent border-[var(--color-mercury)] text-[var(--color-ink)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--color-ink-muted)]">
                      Job title
                    </label>
                    <Input
                      name="job_title"
                      type="text"
                      defaultValue={member.job_title ?? ''}
                      placeholder="e.g. Audio A1"
                      className="bg-transparent border-[var(--color-mercury)] text-[var(--color-ink)]"
                    />
                  </div>
                  <input type="hidden" name="role" value={role} />
                  {workspaceId && (
                    <>
                      {workspaceMember ? (
                        <WorkspaceRoleSelect
                          label="Workspace role"
                          workspaceId={workspaceId}
                          memberId={workspaceMember.workspaceMemberId}
                          value={workspaceMember.roleId}
                          onSuccess={() => {
                            onSuccess?.();
                            router.refresh();
                            getWorkspaceMemberByOrgMemberId(member.id, workspaceId).then((res) => {
                              if (res) setWorkspaceMember(res);
                            });
                          }}
                        />
                      ) : (
                        <div>
                          <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-ink-muted">
                            Workspace role
                          </p>
                          <p className="text-sm text-ink-muted leading-relaxed">
                            This person is not in your workspace team. Add them in{' '}
                            <Link href="/settings" className="text-[var(--color-neon-blue)] hover:underline">
                              Settings → Team
                            </Link>{' '}
                            to assign a workspace role (including custom roles).
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-ink-muted">
                      Org role
                    </p>
                    <RoleSelect
                      value={role}
                      onChange={setRole}
                      canAssignElevated={true}
                    />
                  </div>
                  <Button type="submit" variant="default" size="sm">
                    Save
                  </Button>
                </form>
              )}

              {tab === 'skills' && (
                <div className="flex flex-col gap-4">
                  <ul className="space-y-2">
                    {member.skills.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between rounded-lg border border-[var(--color-mercury)]/50 bg-[var(--color-obsidian)]/30 px-3 py-2"
                      >
                        <span className="text-sm text-[var(--color-ink)]">{s.skill_tag}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRemoveSkill(s.id)}
                          className="text-[var(--color-ink-muted)] hover:text-[var(--color-unusonic-error)]"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {member.skills.length === 0 && (
                    <p className="text-sm text-[var(--color-ink-muted)]">No skills yet.</p>
                  )}
                  <div className="flex gap-2">
                    <select
                      value={addSkillTag}
                      onChange={(e) => setAddSkillTag(e.target.value)}
                      className="flex-1 rounded-md border border-[var(--color-mercury)] bg-transparent px-3 py-2 text-sm text-[var(--color-ink)]"
                    >
                      <option value="">Add skill…</option>
                      {PRESET_SKILL_TAGS.filter((t) => !member.skills.some((s) => s.skill_tag === t)).map(
                        (t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        )
                      )}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddSkill}
                      disabled={!addSkillTag.trim()}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {tab === 'settings' && (
                <p className="text-sm text-[var(--color-ink-muted)]">Settings coming soon.</p>
              )}
            </SheetBody>
          </>
        )}
        {!member && orgMemberId && (
          <SheetBody>
            <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
          </SheetBody>
        )}
      </SheetContent>
    </Sheet>
  );
}
