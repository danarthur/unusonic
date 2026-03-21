'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Package, Users, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { UNUSONIC_PHYSICS } from '@/shared/lib/motion-constants';
import { updateGearItemStatus } from '@/app/(dashboard)/(features)/crm/actions/update-gear-item-status';
import type { PullSheetGearItem, PullSheetCrewItem } from './get-pull-sheet-data';

// ─── Constants ─────────────────────────────────────────────────────────────────

const GEAR_STATUS_CYCLE = ['pending', 'pulled', 'loaded'] as const;
type GearStatus = typeof GEAR_STATUS_CYCLE[number];
const GEAR_STATUS_LABELS: Record<GearStatus, string> = {
  pending: 'Pending',
  pulled: 'Pulled',
  loaded: 'Loaded',
};

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
  const pulledGear = gearItems.filter((i) => i.status === 'pulled').length;
  const loadedGear = gearItems.filter((i) => i.status === 'loaded').length;
  const pendingGear = totalGear - pulledGear - loadedGear;

  const cycleGearStatus = async (item: PullSheetGearItem) => {
    const validStatus = GEAR_STATUS_CYCLE.includes(item.status as GearStatus)
      ? (item.status as GearStatus)
      : 'pending';
    const idx = GEAR_STATUS_CYCLE.indexOf(validStatus);
    const next = GEAR_STATUS_CYCLE[(idx + 1) % GEAR_STATUS_CYCLE.length];

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
      <header className="sticky top-0 z-20 flex items-center gap-3 px-6 py-3 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl print:hidden">
        <Link
          href={`/events/g/${eventId}`}
          className="shrink-0 p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          aria-label="Back to Event Studio"
        >
          <ArrowLeft size={18} />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate">{eventTitle}</p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-ink-muted/60">
            Pull Sheet
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-ink-muted border border-white/10 hover:bg-white/5 hover:text-ceramic transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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
          transition={UNUSONIC_PHYSICS}
        >
          <div className="flex flex-col gap-1 mb-2">
            <h1 className="text-xl font-semibold text-ink tracking-tight">{eventTitle}</h1>
            <div className="flex items-center gap-3 text-sm text-ink-muted">
              {showDate && <span>{showDate}</span>}
              {venue && (
                <>
                  <span className="text-ink-muted/30">·</span>
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
            transition={{ ...UNUSONIC_PHYSICS, delay: 0.03 }}
          >
            <LiquidPanel className="p-5 rounded-[28px]">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="flex flex-col items-center gap-1 pr-6">
                  <span className="text-2xl font-semibold text-ink-muted font-mono">{pendingGear}</span>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-ink-muted/60">To pull</span>
                </div>
                <div className="flex flex-col items-center gap-1 px-6">
                  <span className="text-2xl font-semibold text-[var(--color-neon-blue)] font-mono">{pulledGear}</span>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-ink-muted/60">Pulled</span>
                </div>
                <div className="flex flex-col items-center gap-1 pl-6">
                  <span className="text-2xl font-semibold text-[var(--color-signal-success)] font-mono">{loadedGear}</span>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-ink-muted/60">Loaded</span>
                </div>
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[var(--color-signal-success)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${totalGear > 0 ? Math.round((loadedGear / totalGear) * 100) : 0}%` }}
                  transition={{ ...UNUSONIC_PHYSICS, delay: 0.1 }}
                />
              </div>
            </LiquidPanel>
          </motion.div>
        )}

        {/* ── Gear: empty state ── */}
        {gearItems.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={UNUSONIC_PHYSICS}
            className="flex flex-col items-center gap-4 py-12 text-center"
          >
            <Package size={32} className="text-ink-muted/30" aria-hidden />
            <div>
              <p className="text-ceramic font-medium tracking-tight">No gear on this event</p>
              <p className="text-sm text-ink-muted mt-1">
                Add rental items to the proposal, then sync gear from the Event Studio.
              </p>
            </div>
            <Link
              href={`/events/g/${eventId}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ceramic border border-white/10 hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Go to Event Studio
            </Link>
          </motion.div>
        )}

        {/* ── Gear department sections ── */}
        {departments.map((dept, di) => {
          const deptItems = grouped.get(dept) ?? [];
          const collapsed = collapsedDepts.has(dept);
          const deptLoaded = deptItems.filter((i) => i.status === 'loaded').length;
          const deptTotal = deptItems.length;
          const allLoaded = deptTotal > 0 && deptLoaded === deptTotal;

          return (
            <motion.div
              key={dept}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...UNUSONIC_PHYSICS, delay: 0.05 + di * 0.03 }}
            >
              <LiquidPanel className="rounded-[28px] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleDept(dept)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <h2 className="text-xs font-medium uppercase tracking-widest text-ink-muted">
                      {dept}
                    </h2>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border ${
                      allLoaded
                        ? 'bg-[var(--color-signal-success)]/10 text-[var(--color-signal-success)] border-[var(--color-signal-success)]/20'
                        : 'bg-white/5 text-ink-muted border-white/10'
                    }`}>
                      {deptLoaded}/{deptTotal}
                    </span>
                  </div>
                  <span className="text-ink-muted/50" aria-hidden>
                    {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.ul
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={UNUSONIC_PHYSICS}
                      className="border-t border-white/[0.06]"
                    >
                      {deptItems.map((item, ii) => (
                        <li
                          key={item.id}
                          className={`flex items-center justify-between gap-4 px-5 py-3.5 ${
                            ii < deptItems.length - 1 ? 'border-b border-white/[0.04]' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1 flex items-center gap-2.5">
                            <span className={`text-sm font-medium tracking-tight truncate ${
                              item.status === 'loaded' ? 'text-ink-muted line-through decoration-ink-muted/40' : 'text-ceramic'
                            }`}>
                              {item.name}
                            </span>
                            {item.quantity > 1 && (
                              <span className="shrink-0 text-[10px] font-mono text-ink-muted bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                                ×{item.quantity}
                              </span>
                            )}
                            {item.is_sub_rental && (
                              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-[var(--color-neon-blue)] bg-[var(--color-neon-blue)]/10 border border-[var(--color-neon-blue)]/20 px-1.5 py-0.5 rounded">
                                Sub-rental
                              </span>
                            )}
                          </div>

                          <motion.button
                            type="button"
                            onClick={() => cycleGearStatus(item)}
                            disabled={updatingGear === item.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                            transition={UNUSONIC_PHYSICS}
                            className={`
                              shrink-0 min-w-[80px] px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight
                              border transition-colors text-center
                              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]
                              disabled:opacity-60
                              ${item.status === 'loaded' ? 'bg-[var(--color-signal-success)]/20 text-ceramic border-[var(--color-signal-success)]/40 hover:brightness-110' : ''}
                              ${item.status === 'pulled' ? 'bg-[var(--color-neon-blue)]/15 text-ceramic border-[var(--color-neon-blue)]/30 hover:brightness-110' : ''}
                              ${item.status === 'pending' ? 'bg-white/[0.06] text-ink-muted border-white/10 hover:bg-white/[0.1] hover:text-ceramic' : ''}
                            `}
                          >
                            {updatingGear === item.id
                              ? '…'
                              : GEAR_STATUS_LABELS[item.status as GearStatus] ?? item.status}
                          </motion.button>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </LiquidPanel>
            </motion.div>
          );
        })}

        {/* ── Crew section ── */}
        {crewItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...UNUSONIC_PHYSICS, delay: 0.08 + departments.length * 0.03 }}
          >
            <LiquidPanel className="rounded-[28px] overflow-hidden">
              <button
                type="button"
                onClick={() => setCrewCollapsed((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users size={13} className="text-ink-muted/60" aria-hidden />
                  <h2 className="text-xs font-medium uppercase tracking-widest text-ink-muted">
                    Crew
                  </h2>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border bg-white/5 text-ink-muted border-white/10">
                    {crewItems.length}
                  </span>
                </div>
                <span className="text-ink-muted/50" aria-hidden>
                  {crewCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {!crewCollapsed && (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={UNUSONIC_PHYSICS}
                    className="border-t border-white/[0.06]"
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
                            ii < crewItems.length - 1 ? 'border-b border-white/[0.04]' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-ceramic tracking-tight truncate">
                                {member.assignee_name ?? (
                                  <span className="text-ink-muted/50 italic">Unassigned</span>
                                )}
                              </span>
                              <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                                isConfirmed
                                  ? 'bg-[var(--color-signal-success)]/10 text-[var(--color-signal-success)] border-[var(--color-signal-success)]/20'
                                  : 'bg-white/5 text-ink-muted/60 border-white/10'
                              }`}>
                                {CREW_STATUS_LABELS[member.status] ?? member.status}
                              </span>
                            </div>
                            <p className="text-xs text-ink-muted mt-0.5 truncate">{member.role}</p>
                          </div>

                          {callTimeDisplay && (
                            <span className="shrink-0 text-sm font-mono text-ink-muted tabular-nums">
                              {callTimeDisplay}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </LiquidPanel>
          </motion.div>
        )}

      </div>
    </div>
  );
}
