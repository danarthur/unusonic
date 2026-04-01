'use client';

import * as React from 'react';
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
import { listWorkspaceCapabilityPresets } from '@/features/talent-management/api/capability-actions';
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
  /**
   * Pre-sets the employment status and hides the toggle.
   * Use 'internal_employee' for "Add staff member" and 'external_contractor' for "Add contractor".
   * When omitted, the toggle is shown and defaults to internal_employee.
   */
  initialStatus?: EmploymentStatus;
  /** Callback after successful invite (e.g. refresh graph). */
  onSuccess?: () => void;
}

type EmailStatus = 'idle' | 'checking' | 'found' | 'ghost';

export function InviteTalentDialog({
  open,
  onOpenChange,
  orgId,
  initialStatus,
  onSuccess,
}: InviteTalentDialogProps) {
  const [employmentStatus, setEmploymentStatus] = React.useState<EmploymentStatus>(initialStatus ?? 'internal_employee');

  // Sync if the prop changes (e.g. user opens different menu item while dialog is mounted)
  React.useEffect(() => {
    if (initialStatus) setEmploymentStatus(initialStatus);
  }, [initialStatus]);
  const [role, setRole] = React.useState<InviteRole>('member');
  const [skillTags, setSkillTags] = React.useState<string[]>([]);
  const [selectedCaps, setSelectedCaps] = React.useState<string[]>([]);
  const [capPresets, setCapPresets] = React.useState<string[]>([]);
  const [emailStatus, setEmailStatus] = React.useState<EmailStatus>('idle');
  const [isPending, setIsPending] = React.useState(false);
  const emailCheckRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!open) {
      setEmailStatus('idle');
      setSelectedCaps([]);
    } else {
      listWorkspaceCapabilityPresets().then(setCapPresets);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const first_name = (formData.get('first_name') as string)?.trim() ?? '';
    const last_name = (formData.get('last_name') as string)?.trim() ?? '';
    const phone = (formData.get('phone') as string)?.trim() || null;
    const job_title = (formData.get('job_title') as string)?.trim() || null;

    setIsPending(true);
    const result = await inviteTalent(orgId, {
      email,
      first_name,
      last_name,
      phone,
      job_title,
      employment_status: employmentStatus,
      role,
      skill_tags: skillTags,
      capabilities: selectedCaps,
    });
    setIsPending(false);

    if (result.ok) {
      toast.success(result.message);
      onOpenChange(false);
      onSuccess?.();
    } else {
      toast.error(result.error);
    }
  };

  const toggleSkill = (tag: string) => {
    setSkillTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleCap = (cap: string) => {
    setSelectedCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
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
          <SheetTitle>
            {initialStatus === 'internal_employee' ? 'Add staff member'
              : initialStatus === 'external_contractor' ? 'Add contractor'
              : 'Add to roster'}
          </SheetTitle>
          <SheetClose />
        </SheetHeader>
        <SheetBody>
          <form
            onSubmit={handleSubmit}
            data-surface="raised"
            className={cn(
              'stage-panel flex flex-col gap-6 p-5 transition-all duration-200',
              isContractor
                ? 'border border-dashed border-[var(--color-unusonic-warning)]/60 shadow-[0_0_20px_-4px_var(--color-unusonic-warning)/0.15]'
                : 'shadow-[0_0_20px_-4px_var(--stage-accent)/0.12]'
            )}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block stage-label">
                  First name
                </label>
                <Input
                  name="first_name"
                  type="text"
                  placeholder="First"
                  required
                  className="stage-input"
                />
              </div>
              <div>
                <label className="mb-1.5 block stage-label">
                  Last name
                </label>
                <Input
                  name="last_name"
                  type="text"
                  placeholder="Last"
                  required
                  className="stage-input"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block stage-label">
                Email
              </label>
              <Input
                name="email"
                type="email"
                placeholder="name@company.com"
                required
                onBlur={handleEmailBlur}
                className="stage-input"
              />
              {emailStatus === 'checking' && (
                <p className="mt-1 text-[10px] text-[var(--stage-text-secondary)]">Checking…</p>
              )}
              {emailStatus === 'found' && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--stage-accent)]/30 bg-[var(--stage-accent)]/10 px-2 py-1.5">
                  <User className="size-4 text-[var(--stage-accent)]" />
                  <span className="text-xs font-medium text-[var(--stage-accent)]">User found</span>
                </div>
              )}
              {emailStatus === 'ghost' && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--color-unusonic-warning)]/30 bg-[var(--color-unusonic-warning)]/10 px-2 py-1.5">
                  <UserCircle className="size-4 text-[var(--color-unusonic-warning)]" />
                  <span className="text-xs font-medium text-[var(--color-unusonic-warning)]">Creating new profile</span>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block stage-label">
                Phone
              </label>
              <Input
                name="phone"
                type="tel"
                placeholder="+1 555 000 0000"
                className="stage-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block stage-label">
                Job title
              </label>
              <Input
                name="job_title"
                type="text"
                placeholder="e.g. Audio A1"
                className="stage-input"
              />
            </div>

            {/* Status toggle — only shown when not pre-configured via initialStatus */}
            {!initialStatus && (
              <div>
                <span className="mb-1.5 block stage-label">
                  Status
                </span>
                <div
                  role="group"
                  className="inline-flex rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => setEmploymentStatus('internal_employee')}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      employmentStatus === 'internal_employee'
                        ? 'bg-[var(--stage-accent)]/20 text-[var(--stage-accent)]'
                        : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
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
                        ? 'bg-[var(--color-unusonic-warning)]/20 text-[var(--color-unusonic-warning)]'
                        : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                    )}
                  >
                    Contractor
                  </button>
                </div>
              </div>
            )}

            <div className="border-t border-[oklch(1_0_0_/_0.08)]/50 pt-5">
              <span className="mb-1.5 block stage-label">
                Role
              </span>
              <div className="flex flex-wrap gap-1.5">
                {roleOptions.map((opt) => {
                  const roleActive = role === opt.value;
                  const roleClass = roleActive
                    ? 'border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.08)]/20 text-[var(--stage-text-primary)]'
                    : 'border-[oklch(1_0_0_/_0.08)]/50 text-[var(--stage-text-secondary)] hover:border-[oklch(1_0_0_/_0.08)] hover:text-[var(--stage-text-primary)]';
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      className={cn('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors', roleClass)}
                    >{opt.label}</button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[oklch(1_0_0_/_0.08)]/50 pt-5">
              <span className="mb-1.5 block stage-label">
                Skills {isContractor && <span className="text-[var(--color-unusonic-warning)]">(at least one)</span>}
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESET_SKILL_TAGS.map((tag) => {
                  const tagActive = skillTags.includes(tag);
                  const tagClass = tagActive
                    ? 'border-[var(--stage-accent)] bg-[var(--stage-accent)]/15 text-[var(--stage-accent)]'
                    : 'border-[oklch(1_0_0_/_0.08)]/50 text-[var(--stage-text-secondary)] hover:border-[oklch(1_0_0_/_0.08)] hover:text-[var(--stage-text-primary)]';
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleSkill(tag)}
                      className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', tagClass)}
                    >{tag}</button>
                  );
                })}
              </div>
            </div>

            {capPresets.length > 0 && (
              <div className="border-t border-[oklch(1_0_0_/_0.08)]/50 pt-5">
                <span className="mb-1.5 block stage-label">
                  Business functions
                </span>
                <div className="flex flex-wrap gap-2">
                  {capPresets.map((cap) => {
                    const capActive = selectedCaps.includes(cap);
                    const capClass = capActive
                      ? 'border-[var(--stage-accent)] bg-[var(--stage-accent)]/15 text-[var(--stage-text-primary)]'
                      : 'border-[oklch(1_0_0_/_0.08)]/50 text-[var(--stage-text-secondary)] hover:border-[oklch(1_0_0_/_0.08)] hover:text-[var(--stage-text-primary)]';
                    return (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => toggleCap(cap)}
                        className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', capClass)}
                      >{cap}</button>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant={isContractor ? 'default' : 'silk'}
              disabled={isPending || (isContractor && skillTags.length === 0)}
              className={cn(
                'w-full font-medium transition-all',
                isContractor && 'bg-[var(--color-unusonic-warning)]/90 text-[var(--stage-text-on-accent)] hover:bg-[var(--color-unusonic-warning)] border-none'
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
