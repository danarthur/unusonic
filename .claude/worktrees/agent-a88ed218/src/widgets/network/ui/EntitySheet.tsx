'use client';

import * as React from 'react';
import { useActionState, useOptimistic } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetBody,
} from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Textarea } from '@/shared/ui/textarea';
import { cn } from '@/shared/lib/utils';
import { updatePrivateNotes } from '@/features/network/api/actions';
import { MemberDetailSheet } from '@/features/talent-management';
import type { NetworkOrganization, NetworkEntity } from '@/features/network/model/types';

type SheetSubject =
  | { type: 'org'; data: NetworkOrganization }
  | { type: 'entity'; data: NetworkEntity & { organization_names?: string[] } };

interface EntitySheetProps {
  subject: SheetSubject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabId = 'profile' | 'private_notes' | 'roster';

function StarRating({ value, max = 5 }: { value: number | null; max?: number }) {
  if (value == null) return <span className="text-[var(--color-ink-muted)]">—</span>;
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={i < value ? 'text-[var(--color-walnut)]' : 'text-[var(--color-ink-muted)]/40'}
        >
          ★
        </span>
      ))}
    </span>
  );
}

type RosterPerson = NetworkEntity & { skill_tags?: string[]; org_member_id?: string | null };

export function EntitySheet({ subject, open, onOpenChange }: EntitySheetProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabId>('profile');
  const [memberSheetOpen, setMemberSheetOpen] = React.useState(false);
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null);

  const [notesState, submitNotes] = useActionState(
    async (
      _prev: { ok: boolean; error?: string } | null,
      formData: FormData
    ): Promise<{ ok: boolean; error?: string } | null> => {
      const subject_org_id = formData.get('subject_org_id') as string;
      const private_notes = (formData.get('private_notes') as string) || null;
      const ratingRaw = formData.get('internal_rating');
      const internal_rating = ratingRaw ? Number(ratingRaw) : null;
      const result = await updatePrivateNotes(subject_org_id, private_notes, internal_rating);
      return result.ok ? result : { ok: false, error: result.error };
    },
    null
  );

  const isOrg = subject?.type === 'org';
  const org = isOrg ? (subject as { type: 'org'; data: NetworkOrganization }).data : null;
  const entity = !isOrg && subject ? (subject as { type: 'entity'; data: NetworkEntity & { organization_names?: string[] } }).data : null;

  const [optimisticNotes, setOptimisticNotes] = useOptimistic(
    org?.private_notes ?? '',
    (_current, newNotes: string) => newNotes
  );
  const [optimisticRating, setOptimisticRating] = useOptimistic(
    org?.internal_rating ?? null,
    (_current, newRating: number | null) => newRating
  );

  React.useEffect(() => {
    if (subject) setTab('profile');
  }, [subject]);

  const tabs: { id: TabId; label: string }[] = isOrg
    ? [
        { id: 'profile', label: 'Profile' },
        { id: 'private_notes', label: 'Private Notes' },
        { id: 'roster', label: 'Roster' },
      ]
    : [{ id: 'profile', label: 'Profile' }];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex max-w-md flex-col">
        {subject && (
          <>
            <SheetHeader>
              <SheetTitle>
                {isOrg ? org!.name : entity!.email}
              </SheetTitle>
              <SheetClose />
            </SheetHeader>
            <div className="flex gap-1 border-b border-[var(--color-mercury)] px-6">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    tab === t.id
                      ? 'text-[var(--color-ink)] border-b-2 border-[var(--color-silk)]'
                      : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <SheetBody>
              {tab === 'profile' && (
                <div className="space-y-4">
                  {isOrg && (
                    <>
                      <p className="text-sm text-[var(--color-ink-muted)]">
                        {org!.is_claimed ? 'Claimed' : 'Ghost'} · {org!.roster?.length ?? 0} people
                      </p>
                      {org!.slug && (
                        <p className="text-xs text-[var(--color-ink-muted)]">/{org!.slug}</p>
                      )}
                    </>
                  )}
                  {!isOrg && entity && (
                    <>
                      <p className="text-sm text-[var(--color-ink-muted)]">{entity.email}</p>
                      {entity.organization_names?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {entity.organization_names.map((name) => (
                            <Badge key={name} variant="secondary" className="text-xs">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )}

              {tab === 'private_notes' && isOrg && org && (
                <div className="space-y-4">
                  <p className="rounded-lg bg-[var(--color-surface-warning)]/30 px-3 py-2 text-xs font-medium text-[var(--color-ink)]">
                    Internal only — visible to your organization.
                  </p>
                  <form
                    action={submitNotes}
                    className="space-y-4"
                    onSubmit={(e) => {
                      const form = e.currentTarget;
                      const notes = (form.querySelector('[name="private_notes"]') as HTMLTextAreaElement)?.value ?? '';
                      setOptimisticNotes(notes);
                      const ratingEl = form.querySelector('[name="internal_rating"]') as HTMLInputElement | null;
                      setOptimisticRating(ratingEl ? Number(ratingEl.value) : null);
                    }}
                  >
                    <input type="hidden" name="subject_org_id" value={org.id} />
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--color-ink-muted)]">
                        Notes
                      </label>
                      <Textarea
                        name="private_notes"
                        defaultValue={org.private_notes ?? ''}
                        placeholder="Internal notes about this org…"
                        className="min-h-[120px] resize-y bg-[var(--color-glass-surface)] border-[var(--color-mercury)]"
                        rows={4}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--color-ink-muted)]">
                        Rating
                      </label>
                      <div className="flex items-center gap-2">
                        <StarRating value={optimisticRating} />
                        <select
                          name="internal_rating"
                          defaultValue={org.internal_rating ?? ''}
                          className="rounded-lg border border-[var(--color-mercury)] bg-[var(--color-glass-surface)] px-2 py-1 text-sm text-[var(--color-ink)]"
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : null;
                            setOptimisticRating(v);
                          }}
                        >
                          <option value="">—</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n} ★
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {notesState?.error && (
                      <p className="text-xs text-[var(--color-signal-error)]">{notesState.error}</p>
                    )}
                    <Button type="submit" variant="default" size="sm">
                      Save
                    </Button>
                  </form>
                </div>
              )}

              {tab === 'roster' && isOrg && org && (
                <motion.ul
                  className="space-y-2"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: { staggerChildren: 0.05, delayChildren: 0.02 },
                    },
                  }}
                >
                  {(org.roster ?? []).map((person) => {
                    const rosterPerson = person as RosterPerson;
                    const hasMemberId = !!rosterPerson.org_member_id;
                    return (
                      <motion.li
                        key={person.id}
                        variants={{
                          hidden: { opacity: 0, y: 6 },
                          visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } },
                        }}
                        role={hasMemberId ? 'button' : undefined}
                        tabIndex={hasMemberId ? 0 : undefined}
                        onClick={
                          hasMemberId
                            ? () => {
                                setSelectedMemberId(rosterPerson.org_member_id ?? null);
                                setMemberSheetOpen(true);
                              }
                            : undefined
                        }
                        onKeyDown={
                          hasMemberId
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedMemberId(rosterPerson.org_member_id ?? null);
                                  setMemberSheetOpen(true);
                                }
                              }
                            : undefined
                        }
                        className={cn(
                          'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-mercury)] bg-[var(--color-glass-surface)]/50 px-4 py-3',
                          hasMemberId && 'cursor-pointer hover:bg-[var(--color-glass-surface)]/70 transition-colors'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-[var(--color-ink)]">
                            {person.email}
                          </span>
                          {rosterPerson.skill_tags?.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {rosterPerson.skill_tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-[10px] font-normal text-[var(--color-ink-muted)]">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        {person.role_label && (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {person.role_label}
                          </Badge>
                        )}
                      </motion.li>
                    );
                  })}
                  {(!org.roster || org.roster.length === 0) && (
                    <p className="py-4 text-center text-sm text-[var(--color-ink-muted)]">
                      No people linked yet.
                    </p>
                  )}
                </motion.ul>
              )}
            </SheetBody>
          </>
        )}
      </SheetContent>
      <MemberDetailSheet
        orgMemberId={selectedMemberId}
        open={memberSheetOpen}
        onOpenChange={setMemberSheetOpen}
        onSuccess={() => router.refresh()}
      />
    </Sheet>
  );
}
