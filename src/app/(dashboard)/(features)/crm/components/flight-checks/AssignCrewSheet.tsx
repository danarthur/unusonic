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
import { UNUSONIC_PHYSICS } from '@/shared/lib/motion-constants';
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <p className="text-sm text-ink-muted mb-4">
            Select someone from your internal team with this role. Matching is by skill and job title.
          </p>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-ink-muted" aria-hidden />
            </div>
          )}
          {error && (
            <p className="text-xs text-[var(--color-signal-error)] mb-3">{error}</p>
          )}
          {!loading && members.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Users className="size-10 text-ink-muted/60" aria-hidden />
              <p className="text-sm text-ink-muted">No team members found. Add people on the Network page.</p>
              <Link
                href="/network"
                className="text-sm font-medium text-neon hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
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
                        transition={UNUSONIC_PHYSICS}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors hover:bg-white/[0.06] focus-within:ring-2 focus-within:ring-[var(--ring)]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-ceramic font-medium tracking-tight truncate">{pref.name}</p>
                          {pref.jobTitle && (
                            <p className="text-xs text-ink-muted mt-0.5 truncate">{pref.jobTitle}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectPreferred(pref)}
                          disabled={assigningId !== null}
                          className="shrink-0 rounded-[22px] border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium tracking-tight text-ink-muted hover:bg-white/[0.1] hover:text-ceramic disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          {assigningId === pref.entityId ? '…' : 'Assign'}
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                  <hr className="border-white/10 my-2" />
                </>
              )}
              {/* Full roster list */}
              <ul className="space-y-1">
                {members.map((member) => (
                  <motion.li
                    key={member.id}
                    layout
                    transition={UNUSONIC_PHYSICS}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors hover:bg-white/[0.06] focus-within:ring-2 focus-within:ring-[var(--ring)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-ceramic font-medium tracking-tight truncate">{member.name}</p>
                      {(member.job_title || member.skill_tags.length > 0) && (
                        <p className="text-xs text-ink-muted mt-0.5 truncate">
                          {[member.job_title, member.skill_tags.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelect(member)}
                      disabled={assigningId !== null}
                      className="shrink-0 rounded-[22px] border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium tracking-tight text-ink-muted hover:bg-white/[0.1] hover:text-ceramic disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      {assigningId === member.id ? '…' : 'Assign'}
                    </button>
                  </motion.li>
                ))}
              </ul>
            </div>
          )}
          {!loading && members.length > 0 && (
            <p className="mt-5 pt-4 border-t border-white/10">
              <Link
                href="/network"
                className="text-sm text-ink-muted hover:text-ceramic focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
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
