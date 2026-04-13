'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Calendar,
  MapPin,
  ExternalLink,
  Pencil,
  Check,
  X as XIcon,
} from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { updateEventDates } from '../actions/update-event-dates';
import { updateEventVenue } from '../actions/update-event-venue';
import { updateEventCommand } from '@/features/event-dashboard';
import { getVenueSuggestions, type VenueSuggestion } from '../actions/lookup';
import { DateFieldRow } from './date-field-row';
import { CallTimesCard } from './call-times-card';
import { TransportLogisticsCard } from './transport-logistics-card';
import type { EventSummaryForPrism } from '../actions/get-event-summary';

// ─── Date/time helpers ───────────────────────────────────────────────────────

function formatEventDateTime(startsAt: string | null, endsAt: string | null): {
  date: string;
  startTime: string;
  endTime: string | null;
  multiDay: boolean;
} {
  if (!startsAt) {
    return { date: 'TBD', startTime: '', endTime: null, multiDay: false };
  }
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;

  const multiDay =
    end != null &&
    (end.getDate() !== start.getDate() ||
      end.getMonth() !== start.getMonth() ||
      end.getFullYear() !== start.getFullYear());

  const date = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const startTime = start.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  const endTime = end
    ? end.toLocaleString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        // Show the date on the end time only if the event crosses into another day
        ...(multiDay ? { month: 'short', day: 'numeric' } : {}),
      })
    : null;

  return { date, startTime, endTime, multiDay };
}

function toDatePart(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimePart(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function combineDateAndTime(datePart: string, timePart: string): string {
  return new Date(`${datePart}T${timePart}`).toISOString();
}

function googleMapsUrl(address: string): string {
  if (!address || address === '\u2014') return 'https://www.google.com/maps';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// ─── PlanVitalsRow ───────────────────────────────────────────────────────────

type PlanVitalsRowProps = {
  eventId: string;
  event: EventSummaryForPrism;
  datesLoadIn?: string | null;
  datesLoadOut?: string | null;
  onEventUpdated?: () => void;
};

export function PlanVitalsRow({
  eventId,
  event,
  datesLoadIn,
  datesLoadOut,
  onEventUpdated,
}: PlanVitalsRowProps) {
  const runOfShowData = event.run_of_show_data ?? null;

  const venueEntityId = event.venue_entity_id ?? null;
  const locationName =
    event.venue_name ?? event.location_name ?? null;
  const locationAddress =
    event.venue_address ?? event.location_address ?? event.location_name ?? '';

  // Location card — venue search state
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationMode, setLocationMode] = useState<'view' | 'search'>('view');
  const [venueQuery, setVenueQuery] = useState('');
  const [venueResults, setVenueResults] = useState<VenueSuggestion[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [savingVenue, setSavingVenue] = useState(false);
  const venueSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVenueQueryChange = useCallback((q: string) => {
    setVenueQuery(q);
    if (venueSearchRef.current) clearTimeout(venueSearchRef.current);
    venueSearchRef.current = setTimeout(async () => {
      if (!q.trim()) { setVenueResults([]); return; }
      setVenueSearching(true);
      const results = await getVenueSuggestions(q);
      setVenueSearching(false);
      setVenueResults(results);
    }, 200);
  }, []);

  const selectVenue = useCallback(async (venueId: string) => {
    setSavingVenue(true);
    const result = await updateEventVenue(eventId, venueId);
    setSavingVenue(false);
    if (result.success) {
      setLocationOpen(false);
      setLocationMode('view');
      setVenueQuery('');
      setVenueResults([]);
      onEventUpdated?.();
    }
  }, [eventId, onEventUpdated]);

  const clearVenue = useCallback(async () => {
    setSavingVenue(true);
    const result = await updateEventVenue(eventId, null);
    setSavingVenue(false);
    if (result.success) {
      setLocationOpen(false);
      setLocationMode('view');
      onEventUpdated?.();
    }
  }, [eventId, onEventUpdated]);

  const openLocationSearch = useCallback(() => {
    setLocationMode('search');
    setVenueQuery('');
    setVenueResults([]);
  }, []);

  const dateTime = formatEventDateTime(
    event.starts_at ?? null,
    event.ends_at ?? null
  );

  type DateField = 'date' | 'startTime' | 'endTime';
  const [editingField, setEditingField] = useState<DateField | null>(null);
  const [fieldValue, setFieldValue] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const openField = useCallback((field: DateField) => {
    let val = '';
    if (field === 'date')       val = event.starts_at ? toDatePart(event.starts_at) : '';
    if (field === 'startTime')  val = event.starts_at ? toTimePart(event.starts_at) : '';
    if (field === 'endTime')    val = event.ends_at   ? toTimePart(event.ends_at)   : '';
    setFieldValue(val);
    setEditingField(field);
    setFieldError(null);
  }, [event.starts_at, event.ends_at]);

  const saveField = useCallback(async () => {
    if (!editingField || !event.starts_at) return;
    let newStartsAt = event.starts_at;
    let newEndsAt   = event.ends_at ?? null;

    if (editingField === 'date' && fieldValue) {
      newStartsAt = combineDateAndTime(fieldValue, toTimePart(event.starts_at));
      if (event.ends_at) newEndsAt = combineDateAndTime(fieldValue, toTimePart(event.ends_at));
    } else if (editingField === 'startTime' && fieldValue) {
      newStartsAt = combineDateAndTime(toDatePart(event.starts_at), fieldValue);
    } else if (editingField === 'endTime') {
      newEndsAt = fieldValue
        ? combineDateAndTime(event.ends_at ? toDatePart(event.ends_at) : toDatePart(event.starts_at), fieldValue)
        : null;
    }

    setSavingField(true);
    const result = await updateEventDates(eventId, newStartsAt, newEndsAt);
    setSavingField(false);
    if (!result.success) { setFieldError(result.error); return; }
    setEditingField(null);
    onEventUpdated?.();
  }, [editingField, fieldValue, event.starts_at, event.ends_at, eventId, onEventUpdated]);

  const cancelField = useCallback(() => {
    setEditingField(null);
    setFieldError(null);
  }, []);

  // Load-in / Load-out — separate datetime-local fields
  const [editingLoadField, setEditingLoadField] = useState<'loadIn' | 'loadOut' | null>(null);
  const [loadFieldValue, setLoadFieldValue] = useState('');
  const [savingLoadField, setSavingLoadField] = useState(false);
  const [loadFieldError, setLoadFieldError] = useState<string | null>(null);

  const openLoadField = useCallback((field: 'loadIn' | 'loadOut') => {
    const iso = field === 'loadIn' ? datesLoadIn : datesLoadOut;
    setLoadFieldValue(iso ? iso.slice(0, 16) : '');
    setEditingLoadField(field);
    setLoadFieldError(null);
  }, [datesLoadIn, datesLoadOut]);

  const saveLoadField = useCallback(async () => {
    if (!editingLoadField) return;
    const iso = loadFieldValue ? new Date(loadFieldValue).toISOString() : null;
    setSavingLoadField(true);
    const result = await updateEventCommand(eventId, {
      dates_load_in: editingLoadField === 'loadIn' ? iso : (datesLoadIn ?? null),
      dates_load_out: editingLoadField === 'loadOut' ? iso : (datesLoadOut ?? null),
    });
    setSavingLoadField(false);
    if (!result.ok) { setLoadFieldError(result.error); return; }
    setEditingLoadField(null);
    onEventUpdated?.();
  }, [editingLoadField, loadFieldValue, datesLoadIn, datesLoadOut, eventId, onEventUpdated]);

  const cancelLoadField = useCallback(() => {
    setEditingLoadField(null);
    setLoadFieldError(null);
  }, []);

  // Legacy single-override kept for backward compat (CallTimesCard handles the new slot system)

  return (
    <>
      {/* Event Date/Time — each field independently editable */}
      <StagePanel elevated className="p-6 sm:p-7 rounded-[var(--stage-radius-panel)] flex flex-col gap-6 min-h-[200px]">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Calendar size={14} className="shrink-0 text-[var(--stage-text-secondary)]/70" aria-hidden />
          <p className="stage-label">
            Show date / time
          </p>
        </div>
        {/* Values — stacked vertically so date and times don't get cut off */}
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          <DateFieldRow
            inputType="date"
            display={dateTime.date || 'Set date'}
            isEditing={editingField === 'date'}
            value={fieldValue}
            saving={savingField}
            onChange={setFieldValue}
            onOpen={() => openField('date')}
            onSave={saveField}
            onCancel={cancelField}
            className="font-medium"
          />
          <DateFieldRow
            inputType="time"
            prefix="Start"
            display={dateTime.startTime || '\u2014'}
            isEditing={editingField === 'startTime'}
            value={fieldValue}
            saving={savingField}
            onChange={setFieldValue}
            onOpen={() => openField('startTime')}
            onSave={saveField}
            onCancel={cancelField}
          />
          <DateFieldRow
            inputType="time"
            prefix="End"
            display={dateTime.endTime ?? '\u2014'}
            isEditing={editingField === 'endTime'}
            value={fieldValue}
            saving={savingField}
            onChange={setFieldValue}
            onOpen={() => openField('endTime')}
            onSave={saveField}
            onCancel={cancelField}
          />
          {dateTime.multiDay && (
            <span className="inline-block stage-label px-1.5 py-0.5 rounded bg-[var(--color-unusonic-warning)]/15 text-[var(--color-unusonic-warning)]">
              Multi-day
            </span>
          )}
          {fieldError && (
            <p className="text-label text-[var(--color-unusonic-error)]">{fieldError}</p>
          )}
          <div className="border-t border-[oklch(1_0_0_/_0.05)] pt-3 flex flex-col gap-3">
            {(['loadIn', 'loadOut'] as const).map((field) => {
              const iso = field === 'loadIn' ? datesLoadIn : datesLoadOut;
              const label = field === 'loadIn' ? 'Load-in' : 'Load-out';
              const display = iso
                ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                : '\u2014';
              const isEditing = editingLoadField === field;
              return (
                <div key={field} className="group flex items-center gap-1.5 min-w-0">
                  <span className="stage-label text-[var(--stage-text-tertiary)] shrink-0 leading-none mt-px select-none">
                    {label}
                  </span>
                  {isEditing ? (
                    <>
                      <input
                        type="datetime-local"
                        value={loadFieldValue}
                        onChange={(e) => setLoadFieldValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveLoadField(); }
                          if (e.key === 'Escape') cancelLoadField();
                        }}
                        autoFocus
                        className="min-w-0 flex-1 bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.15)] rounded-md px-1.5 py-0.5 text-[var(--stage-text-primary)] text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={saveLoadField}
                        disabled={savingLoadField}
                        aria-label="Save"
                        className="shrink-0 p-0.5 rounded text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45 transition-colors"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={cancelLoadField}
                        aria-label="Cancel"
                        className="shrink-0 p-0.5 rounded text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors"
                      >
                        <XIcon size={13} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openLoadField(field)}
                      className="flex items-center gap-1.5 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
                    >
                      <span className="stage-readout group-hover:text-[var(--stage-accent)] transition-colors truncate">
                        {display}
                      </span>
                      <Pencil size={11} className="shrink-0 text-transparent group-hover:text-[var(--stage-text-tertiary)] transition-colors" aria-hidden />
                    </button>
                  )}
                </div>
              );
            })}
            {loadFieldError && (
              <p className="text-label text-[var(--color-unusonic-error)]">{loadFieldError}</p>
            )}
          </div>
        </div>
      </StagePanel>

      {/* Location — linked to directory.entities venue */}
      <Popover open={locationOpen} onOpenChange={(o) => {
        setLocationOpen(o);
        if (!o) { setLocationMode('view'); setVenueQuery(''); setVenueResults([]); }
      }}>
        <PopoverTrigger asChild>
          {locationName ? (
            /* Venue set */
            <StagePanel
              interactive
              elevated
              className="p-6 sm:p-7 rounded-[var(--stage-radius-panel)] flex flex-col gap-5 min-h-[130px] cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <MapPin size={14} className="shrink-0 text-[var(--stage-text-secondary)]/70" aria-hidden />
                <p className="stage-label">
                  Location
                </p>
              </div>
              <div className="min-w-0">
                <p className="stage-readout leading-snug truncate group-hover:text-[var(--stage-accent)] transition-colors">
                  {locationName}
                </p>
                {locationAddress && locationAddress !== locationName && (
                  <p className="stage-readout-sm text-[var(--stage-text-secondary)] mt-1 truncate leading-relaxed">
                    {locationAddress}
                  </p>
                )}
                <span className="mt-2 inline-flex items-center gap-1 text-label font-medium text-[var(--stage-text-secondary)]/60 group-hover:text-[var(--stage-text-secondary)] transition-colors">
                  <Pencil size={9} aria-hidden />
                  Edit
                </span>
              </div>
            </StagePanel>
          ) : (
            /* Empty state — dashed invite affordance */
            <button
              type="button"
              className="w-full min-h-[130px] rounded-[var(--stage-radius-panel)] border-2 border-dashed border-[oklch(1_0_0_/_0.08)] hover:border-[var(--stage-accent)]/40 hover:bg-[var(--stage-accent-muted)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] flex flex-col gap-5 p-6 sm:p-7 group text-left"
            >
              <div className="flex items-center gap-2">
                <MapPin size={14} className="shrink-0 text-[var(--stage-text-secondary)]/50 group-hover:text-[var(--stage-text-secondary)] transition-colors" aria-hidden />
                <p className="stage-label/60 group-hover:text-[var(--stage-text-tertiary)] transition-colors">
                  Location
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)] transition-colors">
                  Set venue
                </p>
                <p className="text-xs text-[var(--stage-text-secondary)]/50 mt-0.5">
                  Search your venue network
                </p>
              </div>
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-4">
          {locationMode === 'view' && locationName ? (
            <>
              <p className="stage-readout mb-1">{locationName}</p>
              {locationAddress && locationAddress !== locationName && (
                <p className="stage-readout-sm text-[var(--stage-text-secondary)] mb-3">{locationAddress}</p>
              )}
              <div className="flex flex-col gap-2">
                <a
                  href={googleMapsUrl(locationAddress || locationName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[var(--stage-accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
                >
                  Open in Google Maps
                  <ExternalLink size={14} aria-hidden />
                </a>
                <div className="flex gap-2 mt-2 pt-2 border-t border-[oklch(1_0_0_/_0.10)]">
                  {venueEntityId && (
                    <a
                      href={`/network/entity/${venueEntityId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs py-1.5 px-2 rounded-lg border border-[oklch(1_0_0_/_0.10)] text-[var(--stage-accent)] hover:bg-[var(--stage-accent-muted)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    >
                      View in Network
                      <ExternalLink size={11} aria-hidden />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={openLocationSearch}
                    className="flex-1 text-xs py-1.5 px-2 rounded-lg border border-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  >
                    Change venue
                  </button>
                  {venueEntityId && (
                    <button
                      type="button"
                      onClick={clearVenue}
                      disabled={savingVenue}
                      className="text-xs py-1.5 px-2 rounded-lg border border-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--color-unusonic-error)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
                    >
                      {savingVenue ? '\u2026' : 'Clear'}
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Search mode */
            <div className="space-y-2">
              <p className="stage-label mb-3">
                {locationMode === 'search' && locationName ? 'Change venue' : 'Set venue'}
              </p>
              <input
                autoFocus
                type="text"
                value={venueQuery}
                onChange={(e) => handleVenueQueryChange(e.target.value)}
                placeholder="Search venues\u2026"
                className="w-full rounded-lg border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              />
              {venueSearching && (
                <p className="text-xs text-[var(--stage-text-secondary)] px-1">Searching\u2026</p>
              )}
              {venueResults.length > 0 && (
                <ul className="mt-1 max-h-48 overflow-y-auto stage-panel stage-panel-nested rounded-lg list-none">
                  {venueResults.map((r) =>
                    r.type === 'venue' ? (
                      <li key={r.id}>
                        <button
                          type="button"
                          disabled={savingVenue}
                          onClick={() => selectVenue(r.id)}
                          className="w-full text-left px-3 py-2.5 hover:bg-[oklch(1_0_0_/_0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
                        >
                          <p className="stage-readout truncate">{r.name}</p>
                          {r.address && (
                            <p className="stage-badge-text text-[var(--stage-text-secondary)] truncate mt-0.5">{r.address}</p>
                          )}
                        </button>
                      </li>
                    ) : (
                      <li key="create">
                        <a
                          href="/network"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--stage-accent)] hover:bg-[oklch(1_0_0_/_0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                        >
                          Add &quot;{r.query}&quot; in Network
                          <ExternalLink size={12} aria-hidden />
                        </a>
                      </li>
                    )
                  )}
                </ul>
              )}
              {!venueSearching && venueQuery.length >= 2 && venueResults.length === 0 && (
                <p className="text-xs text-[var(--stage-text-secondary)] px-1">
                  No venues found.{' '}
                  <a
                    href="/network"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--stage-accent)] hover:underline"
                  >
                    Add one in Network \u2192
                  </a>
                </p>
              )}
              {locationName && locationMode === 'search' && (
                <button
                  type="button"
                  onClick={() => setLocationMode('view')}
                  className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] mt-1 ml-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Call Times — named slots + per-crew assignment */}
      <CallTimesCard
        eventId={eventId}
        runOfShowData={runOfShowData}
        startsAt={event.starts_at ?? null}
        onUpdated={onEventUpdated ?? (() => {})}
      />

      {/* Transport (mode + contextual status flow) */}
      <TransportLogisticsCard
        eventId={eventId}
        runOfShowData={runOfShowData}
        onUpdated={onEventUpdated ?? (() => {})}
      />
    </>
  );
}
