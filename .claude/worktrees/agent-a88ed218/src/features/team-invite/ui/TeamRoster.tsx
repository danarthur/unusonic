'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/shared/ui/button';
import { GhostBadge } from './GhostBadge';
import { MemberForge } from './MemberForge';
import { deployInvites } from '../api/actions';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetBody,
} from '@/shared/ui/sheet';
import { cn } from '@/shared/lib/utils';
import type { RosterBadgeData, RosterMemberDisplay } from '../model/types';
import { toast } from 'sonner';

export interface TeamRosterProps {
  orgId: string;
  initialMembers: RosterMemberDisplay[];
  captainId: string | null;
  /** Only owner/admin can assign Admin access level. */
  canAssignAdmin?: boolean;
  /** Call after deploy or when roster should refetch (e.g. router.refresh). */
  onRefresh?: () => void;
  className?: string;
}

/**
 * The Roster Grid: personnel cards + empty slot, Forge in sheet, batch Deploy.
 */
export function TeamRoster({
  orgId,
  initialMembers,
  captainId,
  canAssignAdmin = false,
  onRefresh,
  className,
}: TeamRosterProps) {
  const router = useRouter();
  const [members, setMembers] = React.useState<RosterMemberDisplay[]>(initialMembers);
  const [isForgeOpen, setForgeOpen] = React.useState(false);
  const [selectedMember, setSelectedMember] = React.useState<RosterMemberDisplay | null>(null);
  const [isDeploying, startDeployTransition] = useTransition();

  React.useEffect(() => {
    setMembers((prev) => {
      const serverIds = new Set(initialMembers.map((m) => m.id));
      const onlyLocal = prev.filter((m) => !serverIds.has(m.id));
      return [...initialMembers, ...onlyLocal];
    });
  }, [initialMembers]);

  const unsentIds = members
    .filter((m) => m.isUnsentGhost)
    .map((m) => m.id);
  const unsentCount = unsentIds.length;
  const existingTitles = Array.from(
    new Set(members.map((m) => m.job_title).filter((t): t is string => Boolean(t?.trim())))
  ).sort();

  const handleOpenForge = (member: RosterMemberDisplay | null) => {
    setSelectedMember(member);
    setForgeOpen(true);
  };

  const handleForgeSave = (newMember: RosterBadgeData) => {
    const existing = members.find((m) => m.id === newMember.id);
    if (existing) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === newMember.id
            ? { ...newMember, status: 'ghost' as const, isUnsentGhost: true }
            : m
        )
      );
    } else {
      setMembers((prev) => [
        ...prev,
        { ...newMember, status: 'ghost' as const, isUnsentGhost: true },
      ]);
    }
    setForgeOpen(false);
    setSelectedMember(null);
    onRefresh?.();
    router.refresh();
  };

  const handleDeploy = () => {
    if (unsentCount === 0) return;
    startDeployTransition(async () => {
      const result = await deployInvites(orgId, unsentIds);
      if (result.ok === false) {
        toast.error(result.error);
        return;
      }
      toast.success(result.sent === 1 ? 'Invite sent.' : `${result.sent} invites sent.`);
      onRefresh?.();
      router.refresh();
      router.push('/network');
    });
  };

  const handleSkip = () => router.push('/network');

  return (
    <div className={cn('relative flex flex-1 flex-col min-h-0', className)}>
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        aria-hidden
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, oklch(0.70 0.15 250 / 0.08) 0%, transparent 50%)',
        }}
      />
      <div className="shrink-0 mb-3 sm:mb-4 lg:mb-4 text-center relative">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-silk)]/80">
          Assemble Core
        </span>
        <h2 className="mt-0.5 lg:mt-1 text-lg sm:text-xl font-light tracking-tight text-[var(--color-ink)]">
          Team
        </h2>
        <p className="mt-0.5 lg:mt-1 text-xs sm:text-sm text-[var(--color-ink-muted)]">
          Add members. Send invites when ready.
        </p>
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-24 h-px bg-gradient-to-r from-transparent via-[var(--color-silk)]/30 to-transparent" aria-hidden />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-0.5 sm:px-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-4">
          <AnimatePresence mode="popLayout">
            {members.map((member) => (
              <motion.div
                key={member.id}
                layout
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              >
                <GhostBadge
                  status={member.status}
                  data={member}
                  onClick={() => handleOpenForge(member)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          <GhostBadge status="empty" onClick={() => handleOpenForge(null)} />
        </div>
      </div>

      {unsentCount > 0 && (
        <div className="fixed z-40 animate-in slide-in-from-bottom-4 right-6 bottom-6 sm:right-8 sm:bottom-8 md:right-10 md:bottom-10" style={{ paddingRight: 'env(safe-area-inset-right)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <Button
            size="lg"
            onClick={handleDeploy}
            disabled={isDeploying}
            className="bg-[var(--color-silk)]/90 text-[var(--color-canvas)] hover:bg-[var(--color-silk)] border-0 shadow-[0_4px_24px_-1px_oklch(0_0_0/0.3),0_0_0_1px_var(--color-silk)/30] hover:shadow-[0_20px_40px_-4px_oklch(0.70_0.15_250/0.35)]"
          >
            {isDeploying ? 'Sending…' : `Send ${unsentCount} invite${unsentCount === 1 ? '' : 's'}`}
          </Button>
        </div>
      )}

      <Sheet open={isForgeOpen} onOpenChange={setForgeOpen}>
        <SheetContent side="right" className="flex flex-col max-w-md">
          <SheetHeader>
            <SheetTitle>{selectedMember ? 'Edit member' : 'Add member'}</SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody>
            <MemberForge
              orgId={orgId}
              defaultValues={
                selectedMember
                  ? {
                      id: selectedMember.id,
                      first_name: selectedMember.first_name ?? selectedMember.name.split(' ')[0] ?? '',
                      last_name: selectedMember.last_name ?? selectedMember.name.split(' ').slice(1).join(' ') ?? '',
                      email: selectedMember.email,
                      role: selectedMember.role,
                      job_title: selectedMember.job_title,
                      avatarUrl: selectedMember.avatarUrl,
                    }
                  : undefined
              }
              existingTitles={existingTitles}
              canAssignAdmin={canAssignAdmin}
              onSave={handleForgeSave}
              onCancel={() => setForgeOpen(false)}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>

      <div className="shrink-0 mt-4 sm:mt-6 lg:mt-6 flex items-center justify-between border-t border-[var(--color-mercury)] pt-4 lg:pt-5 pb-6 sm:pb-8" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <Button
          variant="ghost"
          onClick={handleSkip}
          className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          Skip
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push('/network')}
          className="border-[var(--color-mercury)] hover:border-[var(--color-silk)]/50 hover:text-[var(--color-silk)]"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
