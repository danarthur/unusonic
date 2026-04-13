'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, Truck, Package, ChevronDown, UserCheck } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { updateFlightCheckStatus } from '../actions/update-flight-check-status';
import { getCrewGearSummary, type CrewGearSummary } from '../actions/deal-crew';
import { normalizeLogistics } from './flight-checks/types';
import type { EventSummaryForPrism } from '../actions/get-event-summary';
import type { TransportMode, TransportStatus } from '@/entities/event/api/get-event-summary';

// ─── Transport constants ─────────────────────────────────────────────────────

/** Status flow for Personal Vehicle and Company Van. */
const VAN_STATUS_FLOW: TransportStatus[] = [
  'pending',
  'loading',
  'dispatched',
  'on_site',
  'returning',
  'complete',
];

/** Status flow for Rental Truck (rental-specific checkpoints). */
const RENTAL_STATUS_FLOW: TransportStatus[] = [
  'pending_rental',
  'truck_picked_up',
  'loading',
  'dispatched',
  'on_site',
  'returning',
  'truck_returned',
];

const TRANSPORT_MODE_OPTIONS: { value: TransportMode; label: string; description: string }[] = [
  { value: 'none', label: 'Self-equipped', description: 'Crew brings everything' },
  { value: 'personal_vehicle', label: 'Personal vehicles', description: 'Crew picks up gear' },
  { value: 'company_van', label: 'Company van', description: 'Company sends a vehicle' },
  { value: 'rental_truck', label: 'Rental truck', description: 'Rental with pickup/return' },
];

/** Self-equipped shows have no transport status flow — just a confirmed state. */
const NONE_STATUS_FLOW: TransportStatus[] = ['complete'];

function getStatusFlow(mode: TransportMode): TransportStatus[] {
  if (mode === 'none') return NONE_STATUS_FLOW;
  return mode === 'rental_truck' ? RENTAL_STATUS_FLOW : VAN_STATUS_FLOW;
}

function getFirstStatusForMode(mode: TransportMode): TransportStatus {
  if (mode === 'none') return 'complete';
  return getStatusFlow(mode)[0];
}

const TRANSPORT_STATUS_LABELS: Record<TransportStatus, string> = {
  pending: 'Pending',
  loading: 'Loading',
  dispatched: 'Dispatched',
  on_site: 'On site',
  returning: 'Returning',
  complete: 'Complete',
  pending_rental: 'Pending rental',
  truck_picked_up: 'Truck picked up',
  truck_returned: 'Truck returned',
};

const TRANSPORT_STATUS_STYLES: Record<
  TransportStatus,
  { bg: string; border: string; text: string }
> = {
  pending: {
    bg: 'bg-[oklch(1_0_0_/_0.05)]',
    border: 'border-[oklch(1_0_0_/_0.10)]',
    text: 'text-[var(--stage-text-secondary)]',
  },
  pending_rental: {
    bg: 'bg-[oklch(1_0_0_/_0.05)]',
    border: 'border-[oklch(1_0_0_/_0.10)]',
    text: 'text-[var(--stage-text-secondary)]',
  },
  truck_picked_up: {
    bg: 'bg-[var(--color-unusonic-warning)]/10',
    border: 'border-[var(--color-unusonic-warning)]/40',
    text: 'text-[var(--color-unusonic-warning)]',
  },
  loading: {
    bg: 'bg-[var(--color-unusonic-warning)]/10',
    border: 'border-[var(--color-unusonic-warning)]/40',
    text: 'text-[var(--color-unusonic-warning)]',
  },
  dispatched: {
    bg: 'bg-[var(--color-unusonic-info)]/10',
    border: 'border-[var(--color-unusonic-info)]/40',
    text: 'text-[var(--color-unusonic-info)]',
  },
  on_site: {
    bg: 'bg-[var(--color-unusonic-success)]/10',
    border: 'border-[var(--color-unusonic-success)]/40',
    text: 'text-[var(--color-unusonic-success)]',
  },
  returning: {
    bg: 'bg-[var(--color-unusonic-info)]/10',
    border: 'border-[var(--color-unusonic-info)]/40',
    text: 'text-[var(--color-unusonic-info)]',
  },
  complete: {
    bg: 'bg-[var(--color-unusonic-success)]/10',
    border: 'border-[var(--color-unusonic-success)]/40',
    text: 'text-[var(--color-unusonic-success)]',
  },
  truck_returned: {
    bg: 'bg-[var(--color-unusonic-success)]/10',
    border: 'border-[var(--color-unusonic-success)]/40',
    text: 'text-[var(--color-unusonic-success)]',
  },
};

/** Resolve effective transport mode and status from run_of_show_data (with legacy truck_status fallback). */
function resolveTransport(
  runOfShowData: EventSummaryForPrism['run_of_show_data'],
  logistics: Record<string, unknown>
): { mode: TransportMode; status: TransportStatus } {
  const mode = (runOfShowData?.transport_mode ?? 'none') as TransportMode;
  const flow = getStatusFlow(mode);
  const raw = runOfShowData?.transport_status ?? logistics.truck_status ?? null;
  const validStatus = raw && flow.includes(raw as TransportStatus) ? (raw as TransportStatus) : flow[0];
  return { mode, status: validStatus };
}

const MODE_ICONS = {
  none: UserCheck,
  personal_vehicle: Car,
  company_van: Truck,
  rental_truck: Package,
} as const;

// ─── Component ───────────────────────────────────────────────────────────────

export type TransportLogisticsCardProps = {
  eventId: string;
  runOfShowData: EventSummaryForPrism['run_of_show_data'];
  onUpdated: () => void;
};

export function TransportLogisticsCard({
  eventId,
  runOfShowData,
  onUpdated,
}: TransportLogisticsCardProps) {
  const logistics = normalizeLogistics(runOfShowData);
  const { mode: initialMode, status: initialStatus } = resolveTransport(runOfShowData, logistics);

  const [optimisticMode, setOptimisticMode] = useState<TransportMode | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<TransportStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [gearSummary, setGearSummary] = useState<CrewGearSummary | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Fetch crew gear summary for auto-suggestion
  useEffect(() => {
    getCrewGearSummary(eventId).then(setGearSummary);
  }, [eventId]);

  const displayMode = optimisticMode ?? initialMode;
  const flow = getStatusFlow(displayMode);
  const displayStatus = optimisticStatus ?? initialStatus;
  const style = TRANSPORT_STATUS_STYLES[displayStatus];
  const ModeIcon = MODE_ICONS[displayMode];

  const cycleStatus = useCallback(async () => {
    const idx = flow.indexOf(displayStatus);
    const nextIdx = (idx + 1) % flow.length;
    const next = flow[nextIdx];
    setOptimisticStatus(next);
    setUpdating(true);
    const result = await updateFlightCheckStatus(eventId, {
      transport_status: next,
    });
    setUpdating(false);
    setOptimisticStatus(null);
    if (result.success) {
      onUpdated();
    } else {
      toast.error(result.error ?? 'Failed to update transport status.');
    }
  }, [eventId, displayStatus, flow, onUpdated]);

  const setMode = useCallback(
    async (newMode: TransportMode) => {
      setModeOpen(false);
      if (newMode === displayMode) return;
      const firstStatus = getFirstStatusForMode(newMode);
      setOptimisticMode(newMode);
      setOptimisticStatus(firstStatus);
      setUpdating(true);
      const result = await updateFlightCheckStatus(eventId, {
        transport_mode: newMode,
        transport_status: firstStatus,
      });
      setUpdating(false);
      setOptimisticMode(null);
      setOptimisticStatus(null);
      if (result.success) {
        onUpdated();
      } else {
        toast.error(result.error ?? 'Failed to update transport mode.');
      }
    },
    [eventId, displayMode, onUpdated]
  );

  // ── Gear-based transport suggestion ──────────────────────────────────────────
  // Only suggest when: crew exists, gear data implies a different mode, and user hasn't dismissed.
  const suggestedMode: TransportMode | null = (() => {
    if (!gearSummary || gearSummary.total === 0 || suggestionDismissed) return null;
    const allSelfEquipped = gearSummary.selfEquipped === gearSummary.total;
    if (allSelfEquipped && displayMode !== 'none' && displayMode !== 'personal_vehicle') return 'none';
    if (!allSelfEquipped && gearSummary.selfEquipped < gearSummary.total && (displayMode === 'none' || displayMode === 'personal_vehicle')) return 'company_van';
    return null;
  })();

  const applySuggestion = () => {
    if (suggestedMode) {
      setSuggestionDismissed(true);
      setMode(suggestedMode);
    }
  };

  const dismissSuggestion = () => setSuggestionDismissed(true);

  return (
    <motion.div
      layout
      transition={STAGE_LIGHT}
      className={`rounded-[var(--stage-radius-panel)] border ${style.border} ${style.bg} transition-colors`}
    >
      <StagePanel elevated className="p-6 sm:p-7 rounded-[var(--stage-radius-panel)] flex flex-col gap-5 min-h-[130px]">
        <div className="flex items-center gap-4">
          <ModeIcon
            size={22}
            className={`shrink-0 ${style.text}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="stage-label text-[var(--stage-text-tertiary)] mb-2">
              Transport
            </p>
            <Popover open={modeOpen} onOpenChange={setModeOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={updating}
                  className="inline-flex items-center gap-1.5 text-[var(--stage-text-primary)] font-medium tracking-tight leading-snug hover:text-[var(--stage-accent)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded disabled:opacity-45"
                >
                  {TRANSPORT_MODE_OPTIONS.find((o) => o.value === displayMode)?.label ?? displayMode}
                  <ChevronDown size={14} className="text-[var(--stage-text-tertiary)]" aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1">
                {TRANSPORT_MODE_OPTIONS.map((opt) => {
                  const OptIcon = MODE_ICONS[opt.value];
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMode(opt.value)}
                      className="w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-2.5 hover:bg-[oklch(1_0_0_/_0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    >
                      <OptIcon size={14} className="shrink-0 mt-0.5" style={{ color: opt.value === displayMode ? 'var(--stage-text-primary)' : 'var(--stage-text-tertiary)' }} />
                      <div className="min-w-0">
                        <p className="stage-readout" style={{ color: 'var(--stage-text-primary)' }}>{opt.label}</p>
                        <p className="text-label tracking-tight" style={{ color: 'var(--stage-text-tertiary)' }}>{opt.description}</p>
                      </div>
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Gear-based suggestion banner */}
        <AnimatePresence>
          {suggestedMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={STAGE_LIGHT}
              style={{ overflow: 'hidden' }}
            >
              <div className="rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.04)] px-3.5 py-2.5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="stage-field-label">
                    {gearSummary!.selfEquipped === gearSummary!.total
                      ? `All ${gearSummary!.total} crew are self-equipped`
                      : `${gearSummary!.total - gearSummary!.selfEquipped} of ${gearSummary!.total} crew need company gear`}
                  </p>
                  <p className="text-label text-[var(--stage-text-tertiary)] mt-0.5">
                    Suggested: {TRANSPORT_MODE_OPTIONS.find((o) => o.value === suggestedMode)?.label}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={applySuggestion}
                    disabled={updating}
                    className="text-label font-medium text-[var(--stage-text-primary)] hover:text-[var(--stage-accent)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={dismissSuggestion}
                    className="text-label text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status cycling — hidden for self-equipped (no transport to track) */}
        {displayMode !== 'none' && (
          <button
            type="button"
            onClick={updating ? undefined : cycleStatus}
            disabled={updating}
            className="mt-3 flex items-center justify-between gap-3 w-full rounded-xl border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.05)] py-3 px-4 hover:bg-[oklch(1_0_0_/_0.10)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45 text-left"
          >
            <motion.span
              key={displayStatus}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={STAGE_LIGHT}
              className={`stage-readout truncate ${style.text}`}
            >
              {updating ? '\u2026' : TRANSPORT_STATUS_LABELS[displayStatus]}
            </motion.span>
            <span className="stage-badge-text text-[var(--stage-text-tertiary)] shrink-0">Next</span>
          </button>
        )}
        {displayMode === 'none' && (
          <p className="mt-2 text-xs tracking-tight" style={{ color: 'var(--stage-text-tertiary)' }}>
            No vehicle logistics for this show
          </p>
        )}
      </StagePanel>
    </motion.div>
  );
}
