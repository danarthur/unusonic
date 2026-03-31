'use client';

import { motion } from 'framer-motion';
import { MapPin, Calendar, Clock, Truck, AlertTriangle } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { useConflictDetection } from '@/features/ops/hooks/use-conflict-detection';
import { CrewFlightCheck, GearFlightCheck, LogisticsFlightCheck } from './flight-checks';
import { normalizeLogistics } from './flight-checks/types';
import type { DealCrewRow } from '../actions/deal-crew';
import type { EventSummaryForPrism } from '../actions/get-event-summary';

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
};

/** Call time = event start minus 2 hours (Phase 3 spec). */
function getCallTime(startsAt: string | null): string {
  if (!startsAt) return 'TBD';
  const d = new Date(startsAt);
  d.setHours(d.getHours() - 2);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Google Maps search URL for address. */
function googleMapsUrl(address: string): string {
  if (!address || address === '—') return 'https://www.google.com/maps';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function DispatchSummary({
  eventId,
  event,
  crewRows,
  crewLoading,
  onFlightCheckUpdated,
  truckStatus: truckStatusProp,
}: DispatchSummaryProps) {
  const { conflicts } = useConflictDetection({ eventId, enabled: !!eventId });

  const runOfShowData = event.run_of_show_data ?? null;
  const logistics = normalizeLogistics(runOfShowData);

  const truckLabel = truckStatusProp
    ? truckStatusProp === 'in_transit'
      ? 'In Transit'
      : 'Not Loaded'
    : logistics.truck_loaded
      ? 'Loaded'
      : 'Not Loaded';

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


  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
      className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}
    >
      {/* Conflict alert — critical banner when resources are double-booked */}
      {conflicts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_LIGHT}
          className="rounded-[var(--stage-radius-panel)] border border-[var(--color-unusonic-warning)]/50 bg-[var(--color-unusonic-warning)]/10 p-4 flex items-start gap-4"
          role="alert"
        >
          <AlertTriangle size={22} strokeWidth={1.5} className="shrink-0 text-[var(--color-unusonic-warning)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[var(--stage-text-primary)] font-medium tracking-tight">
              Resource conflict{conflicts.length > 1 ? 's' : ''} detected
            </p>
            <p className="text-sm text-[var(--stage-text-secondary)] mt-1 leading-relaxed">
              The following resource{conflicts.length > 1 ? 's are' : ' is'} also booked on overlapping shows:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-[var(--stage-text-secondary)]">
              {conflicts.map((c, i) => (
                <li key={`${c.eventId}-${c.resourceType}-${c.resourceName}-${i}`}>
                  <span className="font-medium text-[var(--stage-text-primary)]">{c.resourceName}</span>
                  {c.resourceType === 'crew' ? ' (crew)' : ' (gear)'} —{' '}
                  <span className="text-[var(--color-unusonic-warning)]">{c.eventName}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      {/* Vitals — Event date, Location, Call time, Truck status, Crew count */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] flex items-center gap-5">
          <Calendar size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-1.5">Show date</p>
            <p className="text-[var(--stage-text-primary)] font-medium tracking-tight leading-none truncate">{displayDate}</p>
          </div>
        </StagePanel>
        <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] flex items-center gap-5">
          <MapPin size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-1.5">Location</p>
            <a
              href={googleMapsUrl(locationAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--stage-text-primary)] font-medium tracking-tight leading-none truncate block hover:text-[var(--stage-accent)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
            >
              {location}
            </a>
          </div>
        </StagePanel>
        <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] flex items-center gap-5">
          <Clock size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-1.5">Call time</p>
            <p className="text-[var(--stage-text-primary)] font-medium tracking-tight leading-none truncate">{callTime}</p>
          </div>
        </StagePanel>
        <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] flex items-center gap-5">
          <Truck size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-1.5">Truck status</p>
            <p className="text-[var(--stage-text-primary)] font-medium tracking-tight leading-none truncate">{truckLabel}</p>
          </div>
        </StagePanel>
      </div>

      {/* Flight check modules — collapsible when long */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CrewFlightCheck
          eventId={eventId}
          crewRows={crewRows}
          crewLoading={crewLoading}
          runOfShowData={runOfShowData}
          onUpdated={onFlightCheckUpdated}
          defaultCollapsed={false}
          maxVisible={5}
        />
        <GearFlightCheck
          eventId={eventId}
          runOfShowData={runOfShowData}
          onUpdated={onFlightCheckUpdated}
          defaultCollapsed={false}
          maxVisible={5}
        />
        <LogisticsFlightCheck
          eventId={eventId}
          runOfShowData={runOfShowData}
          onUpdated={onFlightCheckUpdated}
          defaultCollapsed={false}
        />
      </div>

    </motion.div>
  );
}
