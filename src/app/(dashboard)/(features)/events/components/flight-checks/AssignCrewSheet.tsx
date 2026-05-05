'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Loader2 } from 'lucide-react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetBody,
} from '@/shared/ui/sheet';
import { getInternalTeamForRole, type InternalTeamMember } from '../../actions/get-internal-team-for-role';
import { assignOrAddCrewMember, type AssignOrAddCrewResult } from '../../actions/assign-or-add-crew-member';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { getPreferredCrewForPicker, type PreferredCrewMember } from '@/features/network-data/api/get-preferred-crew';

type AssignCrewSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: string;
  eventId: string;
  onAssigned?: () => void;
  /** Entity IDs already assigned to this event — excluded from the preferred section. */
  assignedEntityIds?: string[];
  /** Optional override — if provided, called instead of the internal assignOrAddCrewMember action. */
  onSelect?: (member: InternalTeamMember) => Promise<AssignOrAddCrewResult>;
};

export function AssignCrewSheet({
  open,
  onOpenChange,
  role,
  eventId,
  onAssigned,
  assignedEntityIds = [],
  onSelect,
}: AssignCrewSheetProps) {
  const [members, setMembers] = useState<InternalTeamMember[]>([]);
  const [preferred, setPreferred] = useState<PreferredCrewMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !role.trim()) {
      setMembers([]);
      setPreferred([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      getInternalTeamForRole(role),
      getPreferredCrewForPicker(role),
    ])
      .then(([{ members: m }, pref]) => {
        setMembers(m);
        // Filter out anyone already assigned to this event
        setPreferred(pref.filter((p) => !assignedEntityIds.includes(p.entityId)));
      })
      .catch(() => {
        setError('Could not load team.');
      })
      .finally(() => {
        setLoading(false);
      });
   
  }, [open, role]);

  const handleSelect = async (member: InternalTeamMember) => {
    setAssigningId(member.id);
    setError(null);
    const result = onSelect
      ? await onSelect(member)
      : await assignOrAddCrewMember(eventId, role, member.entity_id, member.name);
    setAssigningId(null);
    if (result.success) {
      onAssigned?.();
      onOpenChange(false);
    } else {
      setError(result.error);
    }
  };

  const handleSelectPreferred = async (pref: PreferredCrewMember) => {
    setAssigningId(pref.entityId);
    setError(null);
    const result = onSelect
      ? await onSelect({ id: pref.entityId, entity_id: pref.entityId, name: pref.name, job_title: pref.jobTitle ?? null, skill_tags: [] })
      : await assignOrAddCrewMember(eventId, role, pref.entityId, pref.name);
    setAssigningId(null);
    if (result.success) {
      onAssigned?.();
      onOpenChange(false);
    } else {
      setError(result.error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="center" className="max-w-md">
        <SheetHeader>
          <SheetTitle>
            Assign {role}
          </SheetTitle>
          <SheetClose />
        </SheetHeader>
        <SheetBody>
          <p className="text-sm text-[var(--stage-text-secondary)] mb-4">
            Select someone from your internal team with this role. Matching is by skill and job title.
          </p>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-[var(--stage-text-secondary)]" strokeWidth={1.5} aria-hidden />
            </div>
          )}
          {error && (
            <p className="text-xs text-[var(--color-unusonic-error)] mb-3">{error}</p>
          )}
          {!loading && members.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Users className="size-10 text-[var(--stage-text-secondary)]/60" strokeWidth={1.5} aria-hidden />
              <p className="text-sm text-[var(--stage-text-secondary)]">No crew found. Add people from the Network.</p>
              <Link
                href="/network"
                className="text-sm font-medium text-[var(--stage-accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
              >
                Open Network
              </Link>
            </div>
          )}
          {!loading && members.length > 0 && (
            <div className="space-y-1">
              {/* Preferred crew — most recently assigned, no label */}
              {preferred.length > 0 && (
                <>
                  <ul className="space-y-1">
                    {preferred.map((pref) => (
                      <motion.li
                        key={pref.entityId}
                        layout
                        transition={STAGE_LIGHT}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.03)] px-4 py-3 transition-colors stage-hover overflow-hidden focus-within:ring-2 focus-within:ring-[var(--stage-accent)]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[var(--stage-text-primary)] font-medium tracking-tight truncate">{pref.name}</p>
                          {pref.jobTitle && (
                            <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5 truncate">{pref.jobTitle}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectPreferred(pref)}
                          disabled={assigningId !== null}
                          className="shrink-0 rounded-[22px] border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)] px-3 py-1.5 text-xs font-medium tracking-tight text-[var(--stage-text-secondary)] stage-hover overflow-hidden hover:text-[var(--stage-text-primary)] disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                        >
                          {assigningId === pref.entityId ? '…' : 'Assign'}
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                  <hr className="border-[oklch(1_0_0_/_0.08)] my-2" />
                </>
              )}
              {/* Full roster list */}
              <ul className="space-y-1">
                {members.map((member) => (
                  <motion.li
                    key={member.id}
                    layout
                    transition={STAGE_LIGHT}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.03)] px-4 py-3 transition-colors stage-hover overflow-hidden focus-within:ring-2 focus-within:ring-[var(--stage-accent)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[var(--stage-text-primary)] font-medium tracking-tight truncate">{member.name}</p>
                      {(member.job_title || member.skill_tags.length > 0) && (
                        <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5 truncate">
                          {[member.job_title, member.skill_tags.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelect(member)}
                      disabled={assigningId !== null}
                      className="shrink-0 rounded-[22px] border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)] px-3 py-1.5 text-xs font-medium tracking-tight text-[var(--stage-text-secondary)] stage-hover overflow-hidden hover:text-[var(--stage-text-primary)] disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    >
                      {assigningId === member.id ? '…' : 'Assign'}
                    </button>
                  </motion.li>
                ))}
              </ul>
            </div>
          )}
          {!loading && members.length > 0 && (
            <p className="mt-5 pt-4 border-t border-[oklch(1_0_0_/_0.08)]">
              <Link
                href="/network"
                className="text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
              >
                View full team on Network →
              </Link>
            </p>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
