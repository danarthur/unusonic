'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';
import type { PackageWithTags } from '@/features/sales/api/package-actions';
import {
  getCatalogAvailabilityRange,
  type DateAllocation,
} from '@/features/sales/api/catalog-availability';

/* ─── Types ─────────────────────────────────────────────────────────── */

interface CatalogTimelineProps {
  packages: PackageWithTags[];
  workspaceId: string;
}

type RangeMode = 'week' | '2weeks' | 'month';

interface CellAllocations {
  total: number;
  stock: number;
  deals: { dealId: string; dealTitle: string; quantity: number }[];
}

/* ─── Date helpers (UTC) ────────────────────────────────────────────── */

function getMonday(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function rangeDays(rangeMode: RangeMode): number {
  switch (rangeMode) {
    case 'week': return 7;
    case '2weeks': return 14;
    case 'month': return 30;
  }
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dayName(d: Date): string {
  return DAY_NAMES[((d.getUTCDay() + 6) % 7)];
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

/* ─── Component ─────────────────────────────────────────────────────── */

export function CatalogTimeline({ packages, workspaceId }: CatalogTimelineProps) {
  const router = useRouter();
  const [rangeMode, setRangeMode] = useState<RangeMode>('2weeks');
  const [rangeStart, setRangeStart] = useState<Date>(() => getMonday(new Date()));
  const [allocations, setAllocations] = useState<DateAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    cell: CellAllocations;
    itemName: string;
    dateLabel: string;
  } | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rangeEnd = useMemo(() => addDays(rangeStart, rangeDays(rangeMode) - 1), [rangeStart, rangeMode]);

  const dates = useMemo(() => {
    const result: Date[] = [];
    const count = rangeDays(rangeMode);
    for (let i = 0; i < count; i++) {
      result.push(addDays(rangeStart, i));
    }
    return result;
  }, [rangeStart, rangeMode]);

  // Fetch allocations when range changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCatalogAvailabilityRange(workspaceId, toDateStr(rangeStart), toDateStr(rangeEnd))
      .then((data) => {
        if (!cancelled) {
          setAllocations(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAllocations([]);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [workspaceId, rangeStart, rangeEnd]);

  // Build lookup: packageId -> dateStr -> CellAllocations
  const cellMap = useMemo(() => {
    const map = new Map<string, Map<string, CellAllocations>>();
    for (const a of allocations) {
      let pkgMap = map.get(a.catalogPackageId);
      if (!pkgMap) {
        pkgMap = new Map();
        map.set(a.catalogPackageId, pkgMap);
      }
      const dateKey = a.proposedDate;
      let cell = pkgMap.get(dateKey);
      if (!cell) {
        cell = { total: 0, stock: a.stockQuantity, deals: [] };
        pkgMap.set(dateKey, cell);
      }
      cell.total += a.quantityAllocated;
      cell.deals.push({
        dealId: a.dealId,
        dealTitle: a.dealTitle,
        quantity: a.quantityAllocated,
      });
    }
    return map;
  }, [allocations]);

  const handlePrev = useCallback(() => {
    setRangeStart((prev) => addDays(prev, -rangeDays(rangeMode)));
  }, [rangeMode]);

  const handleNext = useCallback(() => {
    setRangeStart((prev) => addDays(prev, rangeDays(rangeMode)));
  }, [rangeMode]);

  const handleToday = useCallback(() => {
    setRangeStart(getMonday(new Date()));
  }, []);

  const handleRangeModeChange = useCallback((mode: RangeMode) => {
    setRangeMode(mode);
    setRangeStart(getMonday(new Date()));
  }, []);

  const handleCellHover = useCallback(
    (e: React.MouseEvent, cell: CellAllocations, itemName: string, dateLabel: string) => {
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setTooltip({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        cell,
        itemName,
        dateLabel,
      });
    },
    []
  );

  const handleCellLeave = useCallback(() => {
    tooltipTimeoutRef.current = setTimeout(() => setTooltip(null), 150);
  }, []);

  const handleCellClick = useCallback(
    (cell: CellAllocations) => {
      if (cell.deals.length === 1) {
        router.push(`/crm/${cell.deals[0].dealId}`);
      }
      // For multiple deals, tooltip shows them — user can decide
    },
    [router]
  );

  // Rental items only (packages prop should already be filtered, but guard)
  const rentalItems = useMemo(
    () => packages.filter((p) => p.category === 'rental' && p.is_active !== false),
    [packages]
  );

  if (rentalItems.length === 0) {
    return (
      <StagePanel className="p-12 rounded-[var(--stage-radius-panel)] text-center">
        <p className="text-[var(--stage-text-secondary)] text-sm">
          No rental items in your catalog. Add rental items to see availability across dates.
        </p>
      </StagePanel>
    );
  }

  const monthLabel = rangeStart.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Navigation bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            className="p-2 rounded-[var(--stage-radius-nested)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors"
            aria-label="Previous period"
          >
            <ChevronLeft size={18} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={handleToday}
            className="px-3 py-1.5 rounded-[var(--stage-radius-nested)] text-xs font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="p-2 rounded-[var(--stage-radius-nested)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors"
            aria-label="Next period"
          >
            <ChevronRight size={18} strokeWidth={1.5} />
          </button>
          <span className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight ml-2">
            {monthLabel}
          </span>
        </div>

        {/* Range mode segmented control */}
        <div
          className="flex items-center gap-0.5 rounded-[var(--stage-radius-nested)] bg-[oklch(1_0_0_/_0.04)] p-0.5"
          role="group"
          aria-label="Date range"
        >
          {([
            { value: 'week' as RangeMode, label: 'Week' },
            { value: '2weeks' as RangeMode, label: '2 weeks' },
            { value: 'month' as RangeMode, label: 'Month' },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleRangeModeChange(opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-[var(--stage-radius-nested)] text-xs font-medium transition-colors',
                rangeMode === opt.value
                  ? 'bg-[var(--stage-surface)] text-[var(--stage-text-primary)] shadow-sm'
                  : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline grid */}
      <StagePanel className="rounded-[var(--stage-radius-panel)] overflow-hidden">
        <div className="overflow-x-auto relative">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr>
                {/* Fixed item column header */}
                <th
                  className="sticky left-0 z-10 bg-[var(--stage-surface)] text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] border-b border-r border-[oklch(1_0_0_/_0.06)] w-[200px] min-w-[200px]"
                >
                  Item
                </th>
                {/* Date column headers */}
                {dates.map((d) => {
                  const today = isToday(d);
                  const weekend = isWeekend(d);
                  return (
                    <th
                      key={toDateStr(d)}
                      className={cn(
                        'px-2 py-3 text-center border-b border-[oklch(1_0_0_/_0.06)] min-w-[64px]',
                        today && 'bg-[oklch(1_0_0_/_0.04)]',
                        weekend && !today && 'bg-[oklch(1_0_0_/_0.02)]'
                      )}
                    >
                      <div className="stage-label">
                        {dayName(d)}
                      </div>
                      <div
                        className={cn(
                          'text-xs tabular-nums mt-0.5',
                          today
                            ? 'text-[var(--stage-text-primary)] font-medium'
                            : 'text-[var(--stage-text-secondary)]'
                        )}
                      >
                        {d.getUTCDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {rentalItems.map((pkg) => {
                  const stock = Number(pkg.stock_quantity) || 0;
                  const pkgAllocations = cellMap.get(pkg.id);

                  return (
                    <motion.tr
                      key={pkg.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={STAGE_LIGHT}
                      className="border-b border-[oklch(1_0_0_/_0.04)] last:border-b-0"
                    >
                      {/* Item name cell — fixed left */}
                      <td
                        className="sticky left-0 z-10 bg-[var(--stage-surface)] px-4 py-3 border-r border-[oklch(1_0_0_/_0.06)] w-[200px] min-w-[200px] cursor-pointer group"
                        onClick={() => router.push(`/catalog/${pkg.id}/edit`)}
                      >
                        <div className="text-sm font-medium text-[var(--stage-text-primary)] group-hover:text-[var(--stage-accent)] transition-colors truncate">
                          {pkg.name}
                        </div>
                        <div className="text-label text-[var(--stage-text-secondary)] tabular-nums mt-0.5">
                          {stock} in stock
                        </div>
                      </td>

                      {/* Date cells */}
                      {dates.map((d) => {
                        const dateStr = toDateStr(d);
                        const cell = pkgAllocations?.get(dateStr);
                        const today = isToday(d);
                        const weekend = isWeekend(d);
                        const hasAllocations = cell && cell.total > 0;

                        let statusClass = '';
                        let barBg = '';
                        let textColor = '';

                        if (hasAllocations) {
                          const ratio = cell.total / (stock || 1);
                          if (ratio >= 1) {
                            statusClass = 'shortage';
                            barBg = 'bg-[var(--color-unusonic-error)]/20';
                            textColor = 'text-[var(--color-unusonic-error)]';
                          } else if (ratio >= 0.5) {
                            statusClass = 'tight';
                            barBg = 'bg-[var(--color-unusonic-warning)]/20';
                            textColor = 'text-[var(--color-unusonic-warning)]';
                          } else {
                            statusClass = 'available';
                            barBg = 'bg-[var(--color-unusonic-success)]/20';
                            textColor = 'text-[var(--color-unusonic-success)]';
                          }
                        }

                        return (
                          <td
                            key={dateStr}
                            className={cn(
                              'px-1 py-2 text-center min-w-[64px] transition-colors',
                              today && 'bg-[oklch(1_0_0_/_0.04)]',
                              weekend && !today && 'bg-[oklch(1_0_0_/_0.02)]',
                              hasAllocations && 'cursor-pointer'
                            )}
                            onMouseEnter={
                              hasAllocations
                                ? (e) =>
                                    handleCellHover(e, cell, pkg.name, `${dayName(d)} ${d.getUTCDate()}`)
                                : undefined
                            }
                            onMouseLeave={hasAllocations ? handleCellLeave : undefined}
                            onClick={
                              hasAllocations
                                ? () => handleCellClick(cell)
                                : undefined
                            }
                          >
                            {hasAllocations && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={STAGE_LIGHT}
                                className={cn(
                                  'mx-auto rounded-[var(--stage-radius-nested)] px-1.5 py-1',
                                  barBg
                                )}
                              >
                                <span
                                  className={cn(
                                    'text-xs font-medium tabular-nums',
                                    textColor
                                  )}
                                >
                                  {cell.total}
                                                                  </span>
                              </motion.div>
                            )}
                          </td>
                        );
                      })}
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>

          {/* Loading overlay */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex items-center justify-center bg-[var(--stage-void)]/75 z-20 rounded-[var(--stage-radius-panel)]"
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-[var(--stage-text-secondary)] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-[var(--stage-text-secondary)]">
                    Loading availability...
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </StagePanel>

      {/* Tooltip (portal to avoid stacking issues) */}
      <AnimatePresence>
        {tooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={STAGE_LIGHT}
            className="fixed z-50 pointer-events-none"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="bg-[var(--stage-surface-elevated)] border border-[oklch(1_0_0_/_0.12)] rounded-[var(--stage-radius-nested)] shadow-lg px-3 py-2 max-w-[240px]">
              <div className="stage-label mb-1.5">
                {tooltip.itemName} — {tooltip.dateLabel}
              </div>
              {tooltip.cell.deals.map((deal, i) => (
                <div
                  key={`${deal.dealId}-${i}`}
                  className="text-xs text-[var(--stage-text-primary)] flex justify-between gap-3"
                >
                  <span className="truncate">{deal.dealTitle}</span>
                  <span className="tabular-nums text-[var(--stage-text-secondary)] shrink-0">
                    {deal.quantity} unit{deal.quantity !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
              <div className="border-t border-[oklch(1_0_0_/_0.08)] mt-1.5 pt-1.5 text-xs font-medium text-[var(--stage-text-primary)] flex justify-between">
                <span>Total</span>
                <span className="tabular-nums">
                  {tooltip.cell.total} / {tooltip.cell.stock} in stock
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
