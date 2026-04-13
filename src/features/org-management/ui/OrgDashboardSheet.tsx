'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { User, Building2, Settings, Users, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/utils';
import { listOrgMembers } from '@/entities/organization';
import type { OrgMemberRosterItem } from '@/entities/organization';
import { MemberDetailSheet } from '@/features/talent-management';
import type { NetworkOrganization } from '@/features/network/model/types';

type TabId = 'roster' | 'settings';

interface OrgDashboardSheetProps {
  org: NetworkOrganization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Full-screen Glass Workspace overlay — "step inside" the organization. */
export function OrgDashboardSheet({ org, open, onOpenChange }: OrgDashboardSheetProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabId>('roster');
  const [roster, setRoster] = React.useState<OrgMemberRosterItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [memberSheetOpen, setMemberSheetOpen] = React.useState(false);
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && org) setTab('roster');
  }, [open, org]);

  React.useEffect(() => {
    if (!open || !org?.id) {
      setRoster([]);
      return;
    }
    setLoading(true);
    listOrgMembers(org.id)
      .then(setRoster)
      .finally(() => setLoading(false));
  }, [open, org?.id]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'roster', label: 'Roster' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — dim and blur the network behind */}
            <motion.div
              role="presentation"
              className="fixed inset-0 z-50 bg-[oklch(0_0_0_/_0.6)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={STAGE_MEDIUM}
              onClick={() => onOpenChange(false)}
              aria-hidden
            />
            {/* Full-screen Glass Workspace panel */}
            <motion.div
              role="dialog"
              aria-modal
              aria-label={`Organization: ${org?.name ?? 'Dashboard'}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={STAGE_MEDIUM}
              className={cn(
                'fixed inset-4 z-50 flex flex-col overflow-hidden rounded-[var(--stage-radius-panel)]',
                'bg-[var(--stage-surface)] border border-[oklch(1_0_0_/_0.10)] shadow-2xl',
                'md:inset-6 lg:inset-8'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[oklch(1_0_0_/_0.10)] px-6 py-4 md:px-8">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(1_0_0_/_0.10)]">
                    <Building2 className="size-5 text-[var(--stage-text-secondary)]" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
                      {org?.name ?? 'Organization'}
                    </h2>
                    <p className="text-sm text-[var(--stage-text-secondary)]">
                      {org?.roster?.length ?? roster.length} people
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                >
                  <X className="size-5" />
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex shrink-0 gap-1 border-b border-[oklch(1_0_0_/_0.10)] px-6 md:px-8">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
                      tab === t.id
                        ? 'text-[var(--stage-text-primary)] border-b-2 border-[var(--stage-accent)]'
                        : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                    )}
                  >
                    {t.id === 'roster' && <Users className="size-4" />}
                    {t.id === 'settings' && <Settings className="size-4" />}
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Content — scrollable */}
              <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8">
                {org && tab === 'roster' && (
                  <div className="mx-auto max-w-2xl space-y-3">
                    {loading ? (
                      <p className="py-12 text-center text-sm text-[var(--stage-text-secondary)]">
                        Loading roster…
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {roster.map((member) => {
                          const isGhost = !member.profile_id;
                          return (
                            <li key={member.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedMemberId(member.id);
                                  setMemberSheetOpen(true);
                                }}
                                className={cn(
                                  'flex w-full flex-wrap items-center gap-3 rounded-xl border border-[oklch(1_0_0_/_0.10)] px-4 py-3 text-left transition-colors',
                                  'bg-[oklch(1_0_0_/_0.05)] hover:bg-[oklch(1_0_0_/_0.10)]',
                                  isGhost && 'opacity-90'
                                )}
                              >
                                <div
                                  className={cn(
                                    'flex size-10 shrink-0 items-center justify-center rounded-full border-2',
                                    isGhost
                                      ? 'border-[oklch(1_0_0_/_0.20)] bg-transparent border-dashed'
                                      : 'border-transparent bg-[oklch(1_0_0_/_0.10)]'
                                  )}
                                >
                                  <User className="size-5 text-[var(--stage-text-secondary)]" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium tracking-tight text-[var(--stage-text-primary)]">
                                    {member.display_name}
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                    {member.job_title && (
                                      <span className="text-xs text-[var(--stage-text-secondary)]">
                                        {member.job_title}
                                      </span>
                                    )}
                                    <Badge
                                      variant={isGhost ? 'outline' : 'secondary'}
                                      className={cn(
                                        'stage-badge-text',
                                        isGhost && 'border-[oklch(1_0_0_/_0.20)] text-[var(--stage-text-secondary)]'
                                      )}
                                    >
                                      {isGhost ? 'Pending' : 'Active'}
                                    </Badge>
                                  </div>
                                  {member.skill_tags.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {member.skill_tags.slice(0, 4).map((tag) => (
                                        <span
                                          key={tag}
                                          className="rounded bg-[oklch(1_0_0_/_0.10)] px-1.5 py-0.5 stage-badge-text text-[var(--stage-text-secondary)]"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                      {member.skill_tags.length > 4 && (
                                        <span className="text-label text-[var(--stage-text-secondary)]">
                                          +{member.skill_tags.length - 4}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {!loading && roster.length === 0 && (
                      <p className="py-12 text-center text-sm text-[var(--stage-text-secondary)]">
                        No people in this organization yet.
                      </p>
                    )}
                  </div>
                )}

                {org && tab === 'settings' && (
                  <div className="mx-auto max-w-2xl space-y-4 py-4">
                    <p className="text-sm text-[var(--stage-text-secondary)]">
                      Organization settings (name, logo) — coming soon.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <MemberDetailSheet
        orgMemberId={selectedMemberId}
        open={memberSheetOpen}
        onOpenChange={setMemberSheetOpen}
        onSuccess={() => {
          router.refresh();
          if (org?.id) listOrgMembers(org.id).then(setRoster);
        }}
      />
    </>
  );
}
