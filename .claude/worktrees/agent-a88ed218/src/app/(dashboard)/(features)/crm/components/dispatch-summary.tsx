'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { MapPin, Calendar, Users, Clock, Truck, AlertTriangle } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import { useConflictDetection } from '@/features/ops/hooks/use-conflict-detection';
import { CrewFlightCheck, GearFlightCheck, LogisticsFlightCheck } from './flight-checks';
import { normalizeCrewItems, normalizeLogistics } from './flight-checks/types';
import type { EventSummaryForPrism } from '../actions/get-event-summary';

type DispatchSummaryProps = {
  eventId: string;
  event: EventSummaryForPrism;
  /** Called when a flight check status is updated; parent can refetch event summary. */
  onFlightCheckUpdated?: () => void;
  /** Optional overrides for vitals when not using run_of_show_data */
  crewConfirmed?: number;
  crewTotal?: number;
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
  onFlightCheckUpdated,
  crewConfirmed: crewConfirmedProp,
  crewTotal: crewTotalProp,
  truckStatus: truckStatusProp,
}: DispatchSummaryProps) {
  const { conflicts, isChecking } = useConflictDetection({ eventId, enabled: !!eventId });

  const runOfShowData = event.run_of_show_data ?? null;
  const crewItems = normalizeCrewItems(runOfShowData);
  const logistics = normalizeLogistics(runOfShowData);
  const crewConfirmed =
    crewConfirmedProp ??
    crewItems.filter((c) => c.status === 'confirmed' || c.status === 'dispatched').length;
  const crewTotal = crewTotalProp ?? (crewItems.length || 0);
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
  const crewLabel = crewTotal > 0 ? `${crewConfirmed}/${crewTotal} Assigned` : '—';
  const callTime = getCallTime(event.starts_at ?? null);


  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SIGNAL_PHYSICS}
      className="flex flex-col gap-6"
    >
      {/* Conflict alert — critical banner when resources are double-booked */}
      {conflicts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SIGNAL_PHYSICS}
          className="rounded-[28px] border border-[var(--color-signal-warning)]/50 bg-[var(--color-signal-warning)]/10 p-4 flex items-start gap-4"
          role="alert"
        >
          <AlertTriangle size={22} className="shrink-0 text-[var(--color-signal-warning)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-ceramic font-medium tracking-tight">
              Resource conflict{conflicts.length > 1 ? 's' : ''} detected
            </p>
            <p className="text-sm text-ink-muted mt-1 leading-relaxed">
              The following resource{conflicts.length > 1 ? 's are' : ' is'} also booked on overlapping events:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink-muted">
              {conflicts.map((c, i) => (
                <li key={`${c.eventId}-${c.resourceType}-${c.resourceName}-${i}`}>
                  <span className="font-medium text-ceramic">{c.resourceName}</span>
                  {c.resourceType === 'crew' ? ' (crew)' : ' (gear)'} —{' '}
                  <span className="text-[var(--color-signal-warning)]">{c.eventName}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      {/* Vitals — Event date, Location, Call time, Truck status, Crew count */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <LiquidPanel className="p-5 rounded-[28px] flex items-center gap-5">
          <Calendar size={20} className="shrink-0 text-ink-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5">Event date</p>
            <p className="text-ceramic font-medium tracking-tight leading-none truncate">{displayDate}</p>
          </div>
        </LiquidPanel>
        <LiquidPanel className="p-5 rounded-[28px] flex items-center gap-5">
          <MapPin size={20} className="shrink-0 text-ink-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5">Location</p>
            <a
              href={googleMapsUrl(locationAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ceramic font-medium tracking-tight leading-none truncate block hover:text-[var(--color-neon-blue)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
            >
              {location}
            </a>
          </div>
        </LiquidPanel>
        <LiquidPanel className="p-5 rounded-[28px] flex items-center gap-5">
          <Clock size={20} className="shrink-0 text-ink-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5">Call time</p>
            <p className="text-ceramic font-medium tracking-tight leading-none truncate">{callTime}</p>
          </div>
        </LiquidPanel>
        <LiquidPanel className="p-5 rounded-[28px] flex items-center gap-5">
          <Truck size={20} className="shrink-0 text-ink-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5">Truck status</p>
            <p className="text-ceramic font-medium tracking-tight leading-none truncate">{truckLabel}</p>
          </div>
        </LiquidPanel>
        <LiquidPanel className="p-5 rounded-[28px] flex items-center gap-5 sm:col-span-2 lg:col-span-1">
          <Users size={20} className="shrink-0 text-ink-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-1.5">Crew count</p>
            <p className="text-ceramic font-medium tracking-tight leading-none">
              <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)] text-xs font-mono">
                {isChecking ? '…' : crewLabel}
              </span>
            </p>
          </div>
        </LiquidPanel>
      </div>

      {/* Flight check modules — collapsible when long */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <CrewFlightCheck
          eventId={eventId}
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

      {/* Launch Event Studio */}
      <Link
        href={`/events/g/${eventId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center justify-center min-h-[140px] rounded-[28px] border-2 border-dashed border-[var(--glass-border)] liquid-card p-8 text-center transition-all hover:border-[var(--color-neon-blue)]/40 hover:bg-[var(--color-neon-blue)]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
      >
        <p className="text-ceramic font-medium tracking-tight leading-none">Launch Event Studio</p>
        <p className="text-sm text-ink-muted leading-relaxed mt-2">Run of show, crewing, and full studio</p>
      </Link>
    </motion.div>
  );
}
