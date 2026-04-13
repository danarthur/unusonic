'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Package, Users, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { updateGearItemStatus } from '@/app/(dashboard)/(features)/crm/actions/update-gear-item-status';
import {
  GEAR_LIFECYCLE_ORDER,
  GEAR_STATUS_LABELS,
  type GearStatus,
} from '@/app/(dashboard)/(features)/crm/components/flight-checks/types';
import type { PullSheetGearItem, PullSheetCrewItem } from './get-pull-sheet-data';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Pull sheet cycles through the full linear lifecycle so field crew can
 *  mark gear on_site and returned directly from the sheet. */
const PULL_SHEET_CYCLE: GearStatus[] = [...GEAR_LIFECYCLE_ORDER];

const CREW_STATUS_LABELS: Record<string, string> = {
  requested: 'Invited',
  confirmed: 'Confirmed',
  dispatched: 'Dispatched',
};

const DEPARTMENT_ORDER = [
  'Audio',
  'Lighting',
  'Video',
  'Staging',
  'Power',
  'Backline',
  'General',
];

function sortDepartments(departments: string[]): string[] {
  return [...departments].sort((a, b) => {
    const ai = DEPARTMENT_ORDER.indexOf(a);
    const bi = DEPARTMENT_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function formatCallTime(iso: string | null, eventStartsAt: string): string {
  const base = iso ?? new Date(new Date(eventStartsAt).getTime() - 2 * 60 * 60 * 1000).toISOString();
  return new Date(base).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ─── Component ─────────────────────────────────────────────────────────────────

type PullSheetClientProps = {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  venue: string | null;
  gearItems: PullSheetGearItem[];
  crewItems: PullSheetCrewItem[];
};

export function PullSheetClient({
  eventId,
  eventTitle,
  startsAt,
  venue,
  gearItems: initialGearItems,
  crewItems,
}: PullSheetClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [gearItems, setGearItems] = useState<PullSheetGearItem[]>(initialGearItems);
  const [updatingGear, setUpdatingGear] = useState<string | null>(null);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [crewCollapsed, setCrewCollapsed] = useState(false);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  // ── Gear grouping ──────────────────────────────────────────────────────────

  const grouped = new Map<string, PullSheetGearItem[]>();
  for (const item of gearItems) {
    const dept = item.department?.trim() || 'General';
    if (!grouped.has(dept)) grouped.set(dept, []);
    grouped.get(dept)!.push(item);
  }
  const departments = sortDepartments([...grouped.keys()]);

  // ── Gear stats ─────────────────────────────────────────────────────────────

  const totalGear = gearItems.length;
  const pulledGear = gearItems.filter((i) => GEAR_LIFECYCLE_ORDER.indexOf(i.status as GearStatus) >= 1).length;
  const loadedGear = gearItems.filter((i) => GEAR_LIFECYCLE_ORDER.indexOf(i.status as GearStatus) >= 3).length;
  const pendingGear = totalGear - pulledGear;

  const cycleGearStatus = async (item: PullSheetGearItem) => {
    const currentStatus = PULL_SHEET_CYCLE.includes(item.status as GearStatus)
      ? (item.status as GearStatus)
      : 'allocated';
    const idx = PULL_SHEET_CYCLE.indexOf(currentStatus);
    const next = PULL_SHEET_CYCLE[(idx + 1) % PULL_SHEET_CYCLE.length];

    setGearItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: next } : i))
    );
    setUpdatingGear(item.id);

    const result = await updateGearItemStatus(item.id, next);
    setUpdatingGear(null);

    if (!result.success) {
      setGearItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i))
      );
    } else {
      refresh();
    }
  };

  const toggleDept = (dept: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  // ── Display helpers ────────────────────────────────────────────────────────

  const showDate = startsAt
    ? new Date(startsAt).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-6 py-3 border-b border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] print:hidden">
        <Link
          href={`/events/g/${eventId}`}
          className="stage-hover overflow-hidden shrink-0 p-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          aria-label="Back to Event Studio"
        >
          <ArrowLeft size={18} />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">{eventTitle}</p>
          <p className="stage-label text-[var(--stage-text-secondary)]/60">
            Pull Sheet
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--stage-text-secondary)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
        >
          <Printer size={13} />
          Print
        </button>
      </header>

      <div className="p-6 flex flex-col gap-6 max-w-3xl mx-auto w-full">

        {/* ── Event info ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_LIGHT}
        >
          <div className="flex flex-col gap-1 mb-2">
            <h1 className="text-xl font-semibold text-[var(--stage-text-primary)] tracking-tight">{eventTitle}</h1>
            <div className="flex items-center gap-3 text-sm text-[var(--stage-text-secondary)]">
              {showDate && <span>{showDate}</span>}
              {venue && (
                <>
                  <span className="text-[var(--stage-text-secondary)]/30">·</span>
                  <span>{venue}</span>
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Gear stats bar ── */}
        {totalGear > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...STAGE_LIGHT, delay: 0.03 }}
          >
            <StagePanel className="p-5 rounded-[var(--stage-radius-panel)]">
              <div className="grid grid-cols-3 divide-x divide-[oklch(1_0_0_/_0.10)]">
                <div className="flex flex-col items-center gap-1 pr-6">
                  <span className="text-2xl font-semibold text-[var(--stage-text-secondary)] font-mono">{pendingGear}</span>
                  <span className="stage-label text-[var(--stage-text-secondary)]/60">To pull</span>
                </div>
                <div className="flex flex-col items-center gap-1 px-6">
                  <span className="text-2xl font-semibold text-[var(--stage-accent)] font-mono">{pulledGear}</span>
                  <span className="stage-label text-[var(--stage-text-secondary)]/60">Pulled</span>
                </div>
                <div className="flex flex-col items-center gap-1 pl-6">
                  <span className="text-2xl font-semibold text-[var(--color-unusonic-success)] font-mono">{loadedGear}</span>
                  <span className="stage-label text-[var(--stage-text-secondary)]/60">Loaded</span>
                </div>
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-[oklch(1_0_0_/_0.10)] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[var(--color-unusonic-success)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${totalGear > 0 ? Math.round((loadedGear / totalGear) * 100) : 0}%` }}
                  transition={{ ...STAGE_LIGHT, delay: 0.1 }}
                />
              </div>
            </StagePanel>
          </motion.div>
        )}

        {/* ── Gear: empty state ── */}
        {gearItems.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={STAGE_LIGHT}
            className="flex flex-col items-center gap-4 py-12 text-center"
          >
            <Package size={32} className="text-[var(--stage-text-secondary)]/30" aria-hidden />
            <div>
              <p className="text-[var(--stage-text-primary)] font-medium tracking-tight">No gear on this event</p>
              <p className="text-sm text-[var(--stage-text-secondary)] mt-1">
                Add rental items to the proposal, then sync gear from the Event Studio.
              </p>
            </div>
            <Link
              href={`/events/g/${eventId}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            >
              Go to Event Studio
            </Link>
          </motion.div>
        )}

        {/* ── Gear department sections ── */}
        {departments.map((dept, di) => {
          const deptItems = grouped.get(dept) ?? [];
          const collapsed = collapsedDepts.has(dept);
          const deptLoaded = deptItems.filter((i) => GEAR_LIFECYCLE_ORDER.indexOf(i.status as GearStatus) >= 3).length;
          const deptTotal = deptItems.length;
          const allLoaded = deptTotal > 0 && deptLoaded === deptTotal;

          return (
            <motion.div
              key={dept}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...STAGE_LIGHT, delay: 0.05 + di * 0.03 }}
            >
              <StagePanel className="rounded-[var(--stage-radius-panel)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleDept(dept)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] hover:bg-[oklch(1_0_0_/_0.02)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                      {dept}
                    </h2>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border ${
                      allLoaded
                        ? 'bg-[var(--color-unusonic-success)]/10 text-[var(--color-unusonic-success)] border-[var(--color-unusonic-success)]/20'
                        : 'bg-[oklch(1_0_0_/_0.05)] text-[var(--stage-text-secondary)] border-[oklch(1_0_0_/_0.10)]'
                    }`}>
                      {deptLoaded}/{deptTotal}
                    </span>
                  </div>
                  <span className="text-[var(--stage-text-secondary)]/50" aria-hidden>
                    {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.ul
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={STAGE_LIGHT}
                      className="border-t border-[oklch(1_0_0_/_0.06)]"
                    >
                      {deptItems.map((item, ii) => (
                        <li
                          key={item.id}
                          className={`flex items-center justify-between gap-4 px-5 py-3.5 ${
                            ii < deptItems.length - 1 ? 'border-b border-[oklch(1_0_0_/_0.04)]' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2.5">
                            <span className={`text-sm font-medium tracking-tight truncate ${
                              GEAR_LIFECYCLE_ORDER.indexOf(item.status as GearStatus) >= 3 ? 'text-[var(--stage-text-secondary)] line-through decoration-[var(--stage-text-secondary)]/40' : 'text-[var(--stage-text-primary)]'
                            }`}>
                              {item.name}
                            </span>
                            {item.quantity > 1 && (
                              <span className="shrink-0 text-label font-mono text-[var(--stage-text-secondary)] bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.10)] px-1.5 py-0.5 rounded">
                                ×{item.quantity}
                              </span>
                            )}
                            {item.is_sub_rental && (
                              <span className="shrink-0 stage-label text-[var(--stage-accent)] bg-[var(--stage-accent)]/10 border border-[var(--stage-accent)]/20 px-1.5 py-0.5 rounded">
                                Sub-rental
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => cycleGearStatus(item)}
                            disabled={updatingGear === item.id}
                            className={`
                              shrink-0 min-w-[80px] px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight
                              border transition-colors text-center
                              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]
                              disabled:opacity-45
                              ${GEAR_LIFECYCLE_ORDER.indexOf(item.status as GearStatus) >= 3 ? 'bg-[var(--color-unusonic-success)]/20 text-[var(--stage-text-primary)] border-[var(--color-unusonic-success)]/40' : ''}
                              ${GEAR_LIFECYCLE_ORDER.indexOf(item.status as GearStatus) >= 1 && GEAR_LIFECYCLE_ORDER.indexOf(item.status as GearStatus) < 3 ? 'bg-[var(--stage-accent)]/15 text-[var(--stage-text-primary)] border-[var(--stage-accent)]/30' : ''}
                              ${item.status === 'allocated' || !GEAR_LIFECYCLE_ORDER.includes(item.status as GearStatus) ? 'bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)] border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.10)] hover:text-[var(--stage-text-primary)]' : ''}
                            `}
                          >
                            {updatingGear === item.id
                              ? '…'
                              : GEAR_STATUS_LABELS[item.status as GearStatus] ?? item.status}
                          </button>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </StagePanel>
            </motion.div>
          );
        })}

        {/* ── Crew section ── */}
        {crewItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...STAGE_LIGHT, delay: 0.08 + departments.length * 0.03 }}
          >
            <StagePanel className="rounded-[var(--stage-radius-panel)] overflow-hidden">
              <button
                type="button"
                onClick={() => setCrewCollapsed((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] hover:bg-[oklch(1_0_0_/_0.02)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users size={13} className="text-[var(--stage-text-secondary)]/60" aria-hidden />
                  <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                    Crew
                  </h2>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border bg-[oklch(1_0_0_/_0.05)] text-[var(--stage-text-secondary)] border-[oklch(1_0_0_/_0.10)]">
                    {crewItems.length}
                  </span>
                </div>
                <span className="text-[var(--stage-text-secondary)]/50" aria-hidden>
                  {crewCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {!crewCollapsed && (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={STAGE_LIGHT}
                    className="border-t border-[oklch(1_0_0_/_0.06)]"
                  >
                    {crewItems.map((member, ii) => {
                      const callTimeDisplay = startsAt
                        ? formatCallTime(member.call_time, startsAt)
                        : null;
                      const isConfirmed = member.status === 'confirmed' || member.status === 'dispatched';

                      return (
                        <li
                          key={member.id}
                          className={`flex items-center justify-between gap-4 px-5 py-3.5 ${
                            ii < crewItems.length - 1 ? 'border-b border-[oklch(1_0_0_/_0.04)]' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
                                {member.assignee_name ?? (
                                  <span className="text-[var(--stage-text-secondary)]/50 italic">Unassigned</span>
                                )}
                              </span>
                              <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-md stage-badge-text border ${
                                isConfirmed
                                  ? 'bg-[var(--color-unusonic-success)]/10 text-[var(--color-unusonic-success)] border-[var(--color-unusonic-success)]/20'
                                  : 'bg-[oklch(1_0_0_/_0.05)] text-[var(--stage-text-secondary)]/60 border-[oklch(1_0_0_/_0.10)]'
                              }`}>
                                {CREW_STATUS_LABELS[member.status] ?? member.status}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5 truncate">{member.role}</p>
                          </div>

                          {callTimeDisplay && (
                            <span className="shrink-0 text-sm font-mono text-[var(--stage-text-secondary)] tabular-nums">
                              {callTimeDisplay}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </StagePanel>
          </motion.div>
        )}

      </div>
    </div>
  );
}
