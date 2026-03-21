'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { toast } from 'sonner';
import { User, UserCircle } from 'lucide-react';
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
import { cn } from '@/shared/lib/utils';
import { inviteTalent, checkEmailExists } from '../api/invite-action';
import type { InviteTalentInput } from '../model/schema';

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

type EmploymentStatus = InviteTalentInput['employment_status'];
type InviteRole = InviteTalentInput['role'];

interface InviteTalentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  /** Callback after successful invite (e.g. refresh graph). */
  onSuccess?: () => void;
}

type InviteTalentResult = Awaited<ReturnType<typeof inviteTalent>>;

function buildInviteAction(orgId: string) {
  return async (_prev: InviteTalentResult | null, formData: FormData): Promise<InviteTalentResult> => {
    const email = formData.get('email') as string;
    const first_name = (formData.get('first_name') as string)?.trim() ?? '';
    const last_name = (formData.get('last_name') as string)?.trim() ?? '';
    const phone = (formData.get('phone') as string)?.trim() || null;
    const job_title = (formData.get('job_title') as string)?.trim() || null;
    const employment_status = formData.get('employment_status') as EmploymentStatus;
    const role = formData.get('role') as InviteRole;
    const skill_tags_raw = formData.get('skill_tags') as string;
    const skill_tags = skill_tags_raw ? (JSON.parse(skill_tags_raw) as string[]) : [];
    return inviteTalent(orgId, {
      email,
      first_name,
      last_name,
      phone,
      job_title,
      employment_status,
      role,
      skill_tags,
    });
  };
}

type EmailStatus = 'idle' | 'checking' | 'found' | 'ghost';

export function InviteTalentDialog({
  open,
  onOpenChange,
  orgId,
  onSuccess,
}: InviteTalentDialogProps) {
  const [employmentStatus, setEmploymentStatus] = React.useState<EmploymentStatus>('internal_employee');
  const [role, setRole] = React.useState<InviteRole>('member');
  const [skillTags, setSkillTags] = React.useState<string[]>([]);
  const [emailStatus, setEmailStatus] = React.useState<EmailStatus>('idle');
  const emailCheckRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const inviteAction = React.useMemo(() => buildInviteAction(orgId), [orgId]);
  const [state, action, isPending] = useActionState(inviteAction, null);

  const handleEmailBlur = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const email = (e.target.value as string)?.trim();
    if (!email) {
      setEmailStatus('idle');
      return;
    }
    if (emailCheckRef.current) clearTimeout(emailCheckRef.current);
    setEmailStatus('checking');
    emailCheckRef.current = setTimeout(async () => {
      try {
        const exists = await checkEmailExists(email);
        setEmailStatus(exists ? 'found' : 'ghost');
      } catch {
        setEmailStatus('idle');
      }
      emailCheckRef.current = null;
    }, 400);
  }, []);

  React.useEffect(() => {
    if (!open) setEmailStatus('idle');
  }, [open]);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message);
      onOpenChange(false);
      onSuccess?.();
    } else {
      toast.error(state.error);
    }
  }, [state, onOpenChange, onSuccess]);

  const toggleSkill = (tag: string) => {
    setSkillTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const isContractor = employmentStatus === 'external_contractor';
  const roleOptions: { value: InviteRole; label: string }[] = [
    { value: 'admin', label: 'Admin' },
    { value: 'member', label: 'Member' },
    { value: 'restricted', label: 'Restricted' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex max-w-md flex-col">
        <SheetHeader>
          <SheetTitle className="text-[var(--color-ink)] tracking-tight">
            Create talent
          </SheetTitle>
          <SheetClose />
        </SheetHeader>
        <SheetBody className="flex flex-col gap-6">
          <form
            action={action}
            className={cn(
              'flex flex-col gap-6 rounded-2xl border bg-[var(--color-glass-surface)]/50 p-5 transition-all duration-200',
              isContractor
                ? 'border-dashed border-[var(--color-signal-warning)]/60 shadow-[0_0_20px_-4px_var(--color-signal-warning)/0.15]'
                : 'border-[var(--color-mercury)] shadow-[0_0_20px_-4px_var(--color-silk)/0.12]'
            )}
          >
            <input type="hidden" name="employment_status" value={employmentStatus} />
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="skill_tags" value={JSON.stringify(skillTags)} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-muted)]">
                  First name
                </label>
                <Input
                  name="first_name"
                  type="text"
                  placeholder="First"
                  required
                  className="bg-transparent border-[var(--color-mercury)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/60"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-muted)]">
                  Last name
                </label>
                <Input
                  name="last_name"
                  type="text"
                  placeholder="Last"
                  required
                  className="bg-transparent border-[var(--color-mercury)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/60"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-muted)]">
                Email
              </label>
              <Input
                name="email"
                type="email"
                placeholder="name@company.com"
                required
                onBlur={handleEmailBlur}
                className="bg-transparent border-[var(--color-mercury)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/60"
              />
              {emailStatus === 'checking' && (
                <p className="mt-1 text-[10px] text-[var(--color-ink-muted)]">Checking…</p>
              )}
              {emailStatus === 'found' && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--color-silk)]/30 bg-[var(--color-silk)]/10 px-2 py-1.5">
                  <User className="size-4 text-[var(--color-silk)]" />
                  <span className="text-xs font-medium text-[var(--color-silk)]">User found</span>
                </div>
              )}
              {emailStatus === 'ghost' && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--color-signal-warning)]/30 bg-[var(--color-signal-warning)]/10 px-2 py-1.5">
                  <UserCircle className="size-4 text-[var(--color-signal-warning)]" />
                  <span className="text-xs font-medium text-[var(--color-signal-warning)]">Creating new profile</span>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-muted)]">
                Phone
              </label>
              <Input
                name="phone"
                type="tel"
                placeholder="+1 555 000 0000"
                className="bg-transparent border-[var(--color-mercury)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/60"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-muted)]">
                Job title
              </label>
              <Input
                name="job_title"
                type="text"
                placeholder="e.g. Audio A1"
                className="bg-transparent border-[var(--color-mercury)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/60"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-[var(--color-ink-muted)]">
                Status
              </span>
              <div
                role="group"
                className="inline-flex rounded-lg border border-[var(--color-mercury)] bg-[var(--color-obsidian)]/40 p-0.5"
              >
                <button
                  type="button"
                  onClick={() => setEmploymentStatus('internal_employee')}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    employmentStatus === 'internal_employee'
                      ? 'bg-[var(--color-silk)]/20 text-[var(--color-silk)]'
                      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                  )}
                >
                  Employee
                </button>
                <button
                  type="button"
                  onClick={() => setEmploymentStatus('external_contractor')}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    employmentStatus === 'external_contractor'
                      ? 'bg-[var(--color-signal-warning)]/20 text-[var(--color-signal-warning)]'
                      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                  )}
                >
                  Contractor
                </button>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-[var(--color-ink-muted)]">
                Role
              </span>
              <div className="flex flex-wrap gap-1.5">
                {roleOptions.map((opt) => {
                  const roleActive = role === opt.value;
                  const roleClass = roleActive
                    ? 'border-[var(--color-mercury)] bg-[var(--color-mercury)]/20 text-[var(--color-ink)]'
                    : 'border-[var(--color-mercury)]/50 text-[var(--color-ink-muted)] hover:border-[var(--color-mercury)] hover:text-[var(--color-ink)]';
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      className={cn('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors', roleClass)}
                    ></button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-[var(--color-ink-muted)]">
                Skills {isContractor && <span className="text-[var(--color-signal-warning)]">(at least one)</span>}
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESET_SKILL_TAGS.map((tag) => {
                  const tagActive = skillTags.includes(tag);
                  const tagClass = tagActive
                    ? 'border-[var(--color-silk)] bg-[var(--color-silk)]/15 text-[var(--color-silk)]'
                    : 'border-[var(--color-mercury)]/50 text-[var(--color-ink-muted)] hover:border-[var(--color-mercury)] hover:text-[var(--color-ink)]';
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleSkill(tag)}
                      className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', tagClass)}
                    ></button>
                  );
                })}
              </div>
            </div>

            <Button
              type="submit"
              disabled={isPending || (isContractor && skillTags.length === 0)}
              className={cn(
                'w-full font-medium transition-all',
                isContractor
                  ? 'bg-[var(--color-signal-warning)]/90 text-[var(--color-obsidian)] hover:bg-[var(--color-signal-warning)]'
                  : 'bg-[var(--color-silk)]/90 text-[var(--color-obsidian)] hover:bg-[var(--color-silk)]'
              )}
            >
              {isPending ? 'Adding…' : 'Add to roster'}
            </Button>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
