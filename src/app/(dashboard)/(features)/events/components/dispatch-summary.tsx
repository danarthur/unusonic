'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Calendar, Clock, Truck, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Check, Loader2, X, Package } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { useConflictDetection } from '@/features/ops/hooks/use-conflict-detection';
import type { EventConflict } from '@/features/ops/actions/get-event-conflicts';
import { GearFlightCheck } from './flight-checks';
import { normalizeLogistics } from './flight-checks/types';
import { getCallTime, googleMapsUrl } from '../lib/day-sheet-utils';
import { getEventLoadDates } from '../actions/get-event-summary';
import { updateEventLoadDates } from '../actions/update-event-dates';
import { swapCrewMember, searchAvailableAlternatives, acceptGearConflict, type AlternativeCrewResult } from '../actions/conflict-resolution';
import { toast } from 'sonner';
import type { DealCrewRow } from '../actions/deal-crew';
import type { EventSummaryForPrism } from '../actions/get-event-summary';

// Transport mode display labels
const TRANSPORT_MODE_LABELS: Record<string, string> = {
  none: 'Self-equipped',
  personal_vehicle: 'Personal vehicle',
  company_van: 'Company van',
  rental_truck: 'Rental truck',
};

const TRANSPORT_STATUS_LABELS: Record<string, string> = {
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

/** Format ISO date string to a short local date */
function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type DispatchSummaryProps = {
  eventId: string;
  dealId: string | null;
  event: EventSummaryForPrism;
  /** Crew rows from PlanLens — single source of truth */
  crewRows: DealCrewRow[];
  crewLoading: boolean;
  /** Called when a flight check status is updated; parent refetches crew + event summary. */
  onFlightCheckUpdated?: () => void;
  /** Optional override for truck status when not using run_of_show_data */
  truckStatus?: 'not_loaded' | 'in_transit';
  /** When true, skip the vitals grid (date, location, call time, truck) — parent header already shows these. */
  hideVitals?: boolean;
  /** Org ID for crew search (needed for swap picker). */
  sourceOrgId?: string | null;
  /** Lifted rail handler — click a crew-sourced gear chip to open the Crew Hub. */
  onOpenCrewDetail?: (row: DealCrewRow) => void;
};

// getCallTime and googleMapsUrl imported from ../lib/day-sheet-utils

// =============================================================================
// Inline Swap Picker — searches for available alternatives to a conflicting crew member
// =============================================================================

function SwapPicker({
  sourceOrgId,
  roleHint,
  excludeEntityIds,
  onSelect,
  onClose,
}: {
  sourceOrgId: string;
  roleHint: string | null;
  excludeEntityIds: string[];
  onSelect: (result: AlternativeCrewResult) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AlternativeCrewResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(
    (q: string) => {
      const gen = ++searchGenRef.current;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!q.trim() && !roleHint) {
        setResults([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        const r = await searchAvailableAlternatives(sourceOrgId, q, roleHint, excludeEntityIds);
        if (searchGenRef.current !== gen) return;
        setResults(r);
        setLoading(false);
      }, q ? 250 : 0);
    },
    [sourceOrgId, roleHint, excludeEntityIds],
  );

  useEffect(() => {
    inputRef.current?.focus();
    if (roleHint) doSearch('');
  }, []);

  const handleSelect = async (result: AlternativeCrewResult) => {
    setSelecting(result.id);
    await onSelect(result);
    setSelecting(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={STAGE_LIGHT}
      className="overflow-hidden"
    >
      <div className="mt-2 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well,oklch(1_0_0_/_0.04))] overflow-hidden">
        <div className="flex items-center">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              doSearch(e.target.value);
            }}
            placeholder={roleHint ? `Search ${roleHint} alternatives\u2026` : 'Search crew\u2026'}
            className="flex-1 bg-transparent px-3 py-2.5 text-sm tracking-tight text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-2.5 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
            aria-label="Close"
          >
            <X size={14} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        {loading && (
          <div className="flex items-center justify-center py-3 border-t border-[oklch(1_0_0_/_0.06)]">
            <Loader2 className="size-3.5 animate-spin text-[var(--stage-text-tertiary)]" />
          </div>
        )}
        <div className="max-h-[200px] overflow-y-auto">
          {!loading && results.length === 0 && (query || roleHint) && (
            <p className="px-3 py-3 text-xs text-[var(--stage-text-tertiary)] tracking-tight border-t border-[oklch(1_0_0_/_0.06)]">
              No available alternatives
            </p>
          )}
          {!loading && results.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={selecting === r.id}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2.5 flex items-center gap-3 border-t border-[oklch(1_0_0_/_0.06)] stage-hover overflow-hidden transition-colors disabled:opacity-45"
            >
              <div className="min-w-0 flex-1">
                <p className="stage-readout truncate">{r.name}</p>
                {r.jobTitle && (
                  <p className="stage-badge-text text-[var(--stage-text-tertiary)] truncate">{r.jobTitle}</p>
                )}
              </div>
              {r.dayRate != null && (
                <span className="stage-badge-text text-[var(--stage-text-tertiary)] shrink-0">
                  ${r.dayRate}/day
                </span>
              )}
              {selecting === r.id ? (
                <Loader2 className="size-3.5 animate-spin text-[var(--stage-text-tertiary)] shrink-0" />
              ) : (
                <ArrowLeftRight size={14} strokeWidth={1.5} className="text-[var(--stage-text-tertiary)] shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// ConflictRow — individual conflict with action buttons
// =============================================================================

function ConflictRow({
  conflict,
  dealId,
  sourceOrgId,
  crewRows,
  eventId,
  onResolved,
}: {
  conflict: EventConflict;
  dealId: string | null;
  sourceOrgId: string | null;
  crewRows: DealCrewRow[];
  eventId: string;
  onResolved: () => void;
}) {
  const [swapOpen, setSwapOpen] = useState(false);
  const [acceptingGear, setAcceptingGear] = useState(false);
  const [gearNote, setGearNote] = useState('');
  const [submittingGearAccept, setSubmittingGearAccept] = useState(false);

  const isCrew = conflict.resourceType === 'crew';
  const canSwap = isCrew && !!dealId && !!sourceOrgId && !!conflict.dealCrewId;

  // Find the matching deal_crew row for context
  const matchingCrewRow = isCrew && conflict.entityId
    ? crewRows.find((r) => r.entity_id === conflict.entityId)
    : null;
  const roleHint = matchingCrewRow?.role_note ?? null;

  // Collect entity IDs already assigned to this deal to exclude from search
  const excludeEntityIds = crewRows
    .filter((r) => r.entity_id)
    .map((r) => r.entity_id!);

  const handleSwapSelect = async (result: AlternativeCrewResult) => {
    if (!dealId || !conflict.dealCrewId) return;
    const res = await swapCrewMember(dealId, conflict.dealCrewId, result.id, roleHint);
    if (res.success) {
      toast.success(`Swapped to ${result.name}`);
      setSwapOpen(false);
      onResolved();
    } else {
      toast.error(res.error ?? 'Swap failed');
    }
  };

  const handleAcceptGearConflict = async () => {
    setSubmittingGearAccept(true);
    const res = await acceptGearConflict(eventId, conflict.resourceName, gearNote || 'Accepted');
    setSubmittingGearAccept(false);
    if (res.success) {
      toast.success('Conflict accepted');
      setAcceptingGear(false);
      onResolved();
    } else {
      toast.error(res.error ?? 'Failed to accept conflict');
    }
  };

  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className="stage-readout">{conflict.resourceName}</span>
          {isCrew ? ' (crew)' : ' (gear)'} —{' '}
          <span className="text-[var(--color-unusonic-warning)]">{conflict.eventName}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isCrew && canSwap && !swapOpen && (
            <button
              type="button"
              onClick={() => setSwapOpen(true)}
              className="inline-flex items-center gap-1.5 stage-badge-text text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
            >
              <ArrowLeftRight size={12} strokeWidth={1.5} />
              Swap
            </button>
          )}
          {!isCrew && !acceptingGear && (
            <button
              type="button"
              onClick={() => setAcceptingGear(true)}
              className="inline-flex items-center gap-1.5 stage-badge-text text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
            >
              <Check size={12} strokeWidth={1.5} />
              Accept
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {/* Crew swap picker */}
        {swapOpen && sourceOrgId && (
          <SwapPicker
            sourceOrgId={sourceOrgId}
            roleHint={roleHint}
            excludeEntityIds={excludeEntityIds}
            onSelect={handleSwapSelect}
            onClose={() => setSwapOpen(false)}
          />
        )}

        {/* Gear accept with note */}
        {acceptingGear && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_LIGHT}
            className="overflow-hidden"
          >
            <div className="mt-2 flex items-center gap-2">
              <input
                value={gearNote}
                onChange={(e) => setGearNote(e.target.value)}
                maxLength={500}
                placeholder="Note (e.g. using backup unit)"
                className="flex-1 bg-[var(--ctx-well,oklch(1_0_0_/_0.04))] border border-[oklch(1_0_0_/_0.08)] rounded-[var(--stage-radius-input,6px)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAcceptGearConflict();
                  if (e.key === 'Escape') setAcceptingGear(false);
                }}
              />
              <button
                type="button"
                onClick={handleAcceptGearConflict}
                disabled={submittingGearAccept}
                className="inline-flex items-center gap-1.5 px-3 py-2 stage-badge-text rounded-[var(--stage-radius-input,6px)] bg-[var(--stage-surface-raised)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] stage-hover overflow-hidden transition-colors disabled:opacity-45"
              >
                {submittingGearAccept ? <Loader2 className="size-3 animate-spin" /> : <Check size={12} strokeWidth={1.5} />}
                Accept
              </button>
              <button
                type="button"
                onClick={() => setAcceptingGear(false)}
                className="px-2 py-2 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DispatchSummary({
  eventId,
  dealId,
  event,
  crewRows,
  crewLoading,
  onFlightCheckUpdated,
  truckStatus: truckStatusProp,
  hideVitals,
  sourceOrgId,
  onOpenCrewDetail,
}: DispatchSummaryProps) {
  const { conflicts, refetch: refetchConflicts } = useConflictDetection({ eventId, enabled: !!eventId });

  const runOfShowData = event.run_of_show_data ?? null;
  const logistics = normalizeLogistics(runOfShowData);

  const truckLabel = truckStatusProp
    ? truckStatusProp === 'in_transit'
      ? 'In transit'
      : 'Not loaded'
    : logistics.truck_loaded
      ? 'Loaded'
      : 'Not loaded';

  const displayDate = event.starts_at
    ? new Date(event.starts_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'TBD';
  const location = event.location_name ?? event.location_address ?? '—';
  const locationAddress = event.location_address ?? event.location_name ?? '';
  const callTime = getCallTime(event.starts_at ?? null);

  // Transport mode/status from RunOfShowData
  const transportMode = runOfShowData?.transport_mode ?? runOfShowData?.logistics?.transport_mode ?? null;
  const transportStatus = runOfShowData?.transport_status ?? runOfShowData?.logistics?.transport_status ?? null;
  const hasTransport = !!(transportMode || transportStatus);

  // Venue restrictions
  const venueRestrictions = runOfShowData?.venue_restrictions ?? null;
  const hasVenueRestrictions = typeof venueRestrictions === 'string' && venueRestrictions.trim().length > 0;

  // Load-in / Load-out dates
  const [loadIn, setLoadIn] = useState<string | null>(null);
  const [loadOut, setLoadOut] = useState<string | null>(null);
  const [loadDatesLoaded, setLoadDatesLoaded] = useState(false);
  const [savingLoadDates, setSavingLoadDates] = useState(false);

  const fetchLoadDates = useCallback(async () => {
    const result = await getEventLoadDates(eventId);
    setLoadIn(result.loadIn);
    setLoadOut(result.loadOut);
    setLoadDatesLoaded(true);
  }, [eventId]);

  useEffect(() => { fetchLoadDates(); }, [fetchLoadDates]);

  const handleLoadDateChange = async (field: 'loadIn' | 'loadOut', value: string) => {
    if (!value) {
      // Clear the field
      const newLoadIn = field === 'loadIn' ? null : loadIn;
      const newLoadOut = field === 'loadOut' ? null : loadOut;
      if (field === 'loadIn') setLoadIn(null);
      else setLoadOut(null);
      setSavingLoadDates(true);
      const result = await updateEventLoadDates(eventId, newLoadIn, newLoadOut);
      setSavingLoadDates(false);
      if (!result.success) toast.error(result.error);
      return;
    }
    const iso = new Date(value).toISOString();
    const newLoadIn = field === 'loadIn' ? iso : loadIn;
    const newLoadOut = field === 'loadOut' ? iso : loadOut;
    if (field === 'loadIn') setLoadIn(iso);
    else setLoadOut(iso);
    setSavingLoadDates(true);
    const result = await updateEventLoadDates(eventId, newLoadIn, newLoadOut);
    setSavingLoadDates(false);
    if (!result.success) toast.error(result.error);
    else onFlightCheckUpdated?.();
  };

  /** Convert ISO to datetime-local input value */
  const isoToDatetimeLocal = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };


  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      <StagePanel style={{ padding: 'var(--stage-padding, 16px)' }}>
      <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
        <div className="flex items-center gap-3">
          <Package size={18} strokeWidth={1.5} className="shrink-0" style={{ color: 'var(--stage-text-secondary)' }} aria-hidden />
          <p className="stage-label">Gear &amp; dispatch</p>
        </div>

      {/* Conflict alert — actionable banner when resources are double-booked */}
      {conflicts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_LIGHT}
          className="rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] border-l-[3px] border-l-[var(--color-unusonic-warning)] bg-[var(--stage-surface)] p-4"
          role="alert"
        >
          <div className="flex items-start gap-4">
            <AlertTriangle size={22} strokeWidth={1.5} className="shrink-0 text-[var(--color-unusonic-warning)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[var(--stage-text-primary)] font-medium tracking-tight">
                Resource conflict{conflicts.length > 1 ? 's' : ''} detected
              </p>
              <p className="text-sm text-[var(--stage-text-secondary)] mt-1 leading-relaxed">
                The following resource{conflicts.length > 1 ? 's are' : ' is'} also booked on overlapping shows.
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-0 divide-y divide-[oklch(1_0_0_/_0.06)]">
            {conflicts.map((c, i) => (
              <ConflictRow
                key={`${c.eventId}-${c.resourceType}-${c.resourceName}-${i}`}
                conflict={c}
                dealId={dealId}
                sourceOrgId={sourceOrgId ?? null}
                crewRows={crewRows}
                eventId={eventId}
                onResolved={() => {
                  refetchConflicts();
                  onFlightCheckUpdated?.();
                }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Vitals — Event date, Location, Call time, Truck status (hidden when parent header covers these) */}
      {!hideVitals && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] flex items-center gap-5">
            <Calendar size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="stage-label mb-1.5">Show date</p>
              <p className="stage-readout leading-none truncate">{displayDate}</p>
            </div>
          </StagePanel>
          <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] flex items-center gap-5">
            <MapPin size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="stage-label mb-1.5">Location</p>
              <a
                href={googleMapsUrl(locationAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="stage-readout leading-none truncate block hover:text-[var(--stage-accent)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
              >
                {location}
              </a>
            </div>
          </StagePanel>
          <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] flex items-center gap-5">
            <Clock size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="stage-label mb-1.5">Call time</p>
              <p className="stage-readout leading-none truncate">{callTime}</p>
            </div>
          </StagePanel>
          <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] flex items-center gap-5">
            <Truck size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="stage-label mb-1.5">Truck status</p>
              <p className="stage-readout leading-none truncate">{truckLabel}</p>
            </div>
          </StagePanel>
          {/* Transport mode/status — shown when set in run_of_show_data */}
          {hasTransport && (
            <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] flex items-center gap-5">
              <Truck size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="stage-label mb-1.5">Transport</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {transportMode && (
                    <span
                      className="stage-panel-nested stage-readout px-2 py-0.5"
                      style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                    >
                      {TRANSPORT_MODE_LABELS[transportMode] ?? transportMode}
                    </span>
                  )}
                  {transportStatus && (
                    <span className="stage-badge-text text-[var(--stage-text-secondary)]">
                      {TRANSPORT_STATUS_LABELS[transportStatus] ?? transportStatus}
                    </span>
                  )}
                </div>
              </div>
            </StagePanel>
          )}
          {/* Load-in date */}
          {loadDatesLoaded && (
            <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] flex items-center gap-5">
              <ArrowDownToLine size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="stage-label mb-1.5">Load-in</p>
                {loadIn ? (
                  <p className="stage-readout leading-none truncate">{formatShortDate(loadIn)}</p>
                ) : (
                  <p className="stage-field-label text-[var(--stage-text-tertiary)] leading-none">Not set</p>
                )}
                <input
                  type="datetime-local"
                  value={isoToDatetimeLocal(loadIn)}
                  onChange={(e) => handleLoadDateChange('loadIn', e.target.value)}
                  className="mt-1.5 w-full bg-[var(--ctx-well,oklch(1_0_0_/_0.04))] border border-[oklch(1_0_0_/_0.08)] px-2 py-1 text-xs text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  style={{ borderRadius: 'var(--stage-radius-input, 6px)', colorScheme: 'dark' }}
                />
              </div>
            </StagePanel>
          )}
          {/* Load-out date */}
          {loadDatesLoaded && (
            <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] flex items-center gap-5">
              <ArrowUpFromLine size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="stage-label mb-1.5">Load-out</p>
                {loadOut ? (
                  <p className="stage-readout leading-none truncate">{formatShortDate(loadOut)}</p>
                ) : (
                  <p className="stage-field-label text-[var(--stage-text-tertiary)] leading-none">Not set</p>
                )}
                <input
                  type="datetime-local"
                  value={isoToDatetimeLocal(loadOut)}
                  onChange={(e) => handleLoadDateChange('loadOut', e.target.value)}
                  className="mt-1.5 w-full bg-[var(--ctx-well,oklch(1_0_0_/_0.04))] border border-[oklch(1_0_0_/_0.08)] px-2 py-1 text-xs text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  style={{ borderRadius: 'var(--stage-radius-input, 6px)', colorScheme: 'dark' }}
                />
              </div>
            </StagePanel>
          )}
        </div>
      )}

      {/* Venue restrictions banner — amber alert when restrictions are set */}
      {hasVenueRestrictions && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_LIGHT}
          className="stage-panel-nested"
          style={{ padding: 'var(--stage-padding, 16px)', borderLeft: '3px solid var(--color-unusonic-warning)' }}
        >
          <p className="stage-label" style={{ color: 'var(--color-unusonic-warning)', marginBottom: '4px' }}>
            Venue restrictions
          </p>
          <p className="text-sm" style={{ color: 'var(--stage-text-primary)' }}>
            {venueRestrictions}
          </p>
        </motion.div>
      )}

      {/* Gear flight check (logistics toggles moved to AdvancingChecklist).
          `bare` so the card renders flat inside the surrounding "Gear &
          dispatch" StagePanel — no card-inside-a-card. */}
      <GearFlightCheck
        eventId={eventId}
        eventStartsAt={event.starts_at ?? null}
        eventEndsAt={event.ends_at ?? null}
        crewRows={crewRows}
        onUpdated={onFlightCheckUpdated}
        defaultCollapsed={false}
        maxVisible={5}
        onOpenCrewDetail={onOpenCrewDetail}
        bare
      />

      </div>
      </StagePanel>
    </motion.div>
  );
}
