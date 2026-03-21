'use client';

import React, { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  StatusPill,
  TeamPile,
  updateEventCommand,
} from '@/features/event-dashboard';
import type { EventCommandDTO, EventLifecycleStatus } from '@/entities/event';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { SaveBar } from '@/shared/ui/surfaces';
import { Textarea } from '@/shared/ui/textarea';
import { CurrencyInput } from '@/shared/ui/currency-input';
import { TimeCapsule } from '@/widgets/event-dashboard/ui/logistics';
import { DollarSign, FileText, Calendar } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/** From ISO string to yyyy-MM-dd (local date). */
function isoToDateString(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(new Date(iso), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

/** From ISO string to HH:mm (local time, 24h). */
function isoToTimeString(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(new Date(iso), 'HH:mm');
  } catch {
    return '';
  }
}

/** Build ISO string from date (yyyy-MM-dd) and optional time (HH:mm or HH:mm:ss). */
function buildISOFromDateAndTime(dateStr: string, timeStr: string): string | null {
  if (!dateStr?.trim()) return null;
  const time = timeStr?.trim() ? timeStr : '00:00';
  const normalized = time.includes(':') && time.split(':').length >= 2
    ? `${time.split(':').slice(0, 2).join(':')}:00`
    : '00:00:00';
  try {
    return new Date(`${dateStr}T${normalized}`).toISOString();
  } catch {
    return null;
  }
}

/** Start of selected date (00:00:00) as ISO. */
function buildISOStartOfDay(dateStr: string): string | null {
  if (!dateStr?.trim()) return null;
  try {
    return new Date(`${dateStr}T00:00:00`).toISOString();
  } catch {
    return null;
  }
}

/** End of selected date (23:59:59.999) – full 24 hours of that day. */
function buildISOEndOfDay(dateStr: string): string | null {
  if (!dateStr?.trim()) return null;
  try {
    return new Date(`${dateStr}T23:59:59.999`).toISOString();
  } catch {
    return null;
  }
}

export interface EventCommandFormValues {
  title: string;
  internal_code: string;
  lifecycle_status: EventLifecycleStatus;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  set_by_time: boolean;
  set_time: string;
  multi_day: boolean;
  show_load_in_out: boolean;
  load_in_date: string;
  load_in_time: string;
  load_out_date: string;
  load_out_time: string;
  venue_name: string;
  venue_address: string;
  crm_probability: number;
  crm_estimated_value: number;
  guest_count_expected: number | '';
  guest_count_actual: number | '';
  notes: string;
  tech_requirements_json: string;
}

function eventToDefaultValues(event: EventCommandDTO): EventCommandFormValues {
  const techReq = event.tech_requirements;
  const techStr =
    techReq && typeof techReq === 'object' && !Array.isArray(techReq)
      ? JSON.stringify(techReq, null, 2)
      : '';
  const hasLoadIn = !!(event.dates_load_in ?? event.dates_load_out);
  const startDate = isoToDateString(event.starts_at ?? null);
  const endDate = isoToDateString(event.ends_at ?? null);
  const isMultiDay = !!(startDate && endDate && startDate !== endDate);
  return {
    title: event.title ?? '',
    internal_code: event.internal_code ?? '',
    lifecycle_status: (event.lifecycle_status ?? 'lead') as EventLifecycleStatus,
    start_date: startDate,
    start_time: isoToTimeString(event.starts_at ?? null),
    end_date: endDate || startDate,
    end_time: isoToTimeString(event.ends_at ?? null),
    set_by_time: true,
    set_time: '',
    multi_day: isMultiDay,
    show_load_in_out: hasLoadIn,
    load_in_date: isoToDateString(event.dates_load_in ?? null),
    load_in_time: isoToTimeString(event.dates_load_in ?? null),
    load_out_date: isoToDateString(event.dates_load_out ?? null),
    load_out_time: isoToTimeString(event.dates_load_out ?? null),
    venue_name: event.venue_name ?? event.location_name ?? '',
    venue_address: event.venue_address ?? event.location_address ?? '',
    crm_probability: event.crm_probability ?? 0,
    crm_estimated_value: event.crm_estimated_value ?? 0,
    guest_count_expected: event.guest_count_expected ?? '',
    guest_count_actual: event.guest_count_actual ?? '',
    notes: event.notes ?? '',
    tech_requirements_json: techStr,
  };
}

const inputBase =
  'w-full min-w-0 rounded-xl border border-[var(--glass-border)] bg-ceramic/5 px-3 py-2 text-ink placeholder:text-ink-muted outline-none transition-[box-shadow,border-color] focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--glass-border-hover)]';

interface EventCommandGridProps {
  event: EventCommandDTO;
}

export function EventCommandGrid({ event: initialEvent }: EventCommandGridProps) {
  const defaultValues = useMemo(
    () => eventToDefaultValues(initialEvent),
    [initialEvent]
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isDirty },
    setError,
  } = useForm<EventCommandFormValues>({
    defaultValues,
    values: defaultValues,
  });

  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onReset = useCallback(() => {
    reset(defaultValues);
    setSaveError(null);
  }, [reset, defaultValues]);

  const onSubmit = useCallback(
    (values: EventCommandFormValues) => {
      setSaveError(null);
      startTransition(async () => {
        const startsAt = values.set_by_time
          ? (buildISOFromDateAndTime(values.start_date, values.start_time) ?? initialEvent.starts_at)
          : (buildISOStartOfDay(values.start_date) ?? initialEvent.starts_at);
        const endDateForRange = values.multi_day ? values.end_date : values.start_date;
        const endsAt = values.set_by_time
          ? (buildISOFromDateAndTime(values.end_date, values.end_time) ?? initialEvent.ends_at)
          : (buildISOEndOfDay(endDateForRange) ?? initialEvent.ends_at);
        let techRequirements: EventCommandDTO['tech_requirements'] = null;
        if (values.tech_requirements_json?.trim()) {
          try {
            techRequirements = JSON.parse(values.tech_requirements_json) as EventCommandDTO['tech_requirements'];
          } catch {
            setError('tech_requirements_json', { message: 'Invalid JSON' });
            return;
          }
        }
        const datesLoadIn =
          values.show_load_in_out && values.load_in_date
            ? buildISOFromDateAndTime(values.load_in_date, values.set_by_time ? values.load_in_time : '')
            : null;
        const datesLoadOut =
          values.show_load_in_out && values.load_out_date
            ? buildISOFromDateAndTime(values.load_out_date, values.set_by_time ? values.load_out_time : '')
            : null;
        const payload = {
          title: values.title || undefined,
          lifecycle_status: values.lifecycle_status,
          starts_at: startsAt,
          ends_at: endsAt,
          dates_load_in: values.show_load_in_out ? (datesLoadIn ?? undefined) : null,
          dates_load_out: values.show_load_in_out ? (datesLoadOut ?? undefined) : null,
          venue_name: values.venue_name || undefined,
          venue_address: values.venue_address || undefined,
          crm_probability: values.crm_probability,
          crm_estimated_value: values.crm_estimated_value,
          guest_count_expected: values.guest_count_expected === '' ? undefined : values.guest_count_expected,
          guest_count_actual: values.guest_count_actual === '' ? undefined : values.guest_count_actual,
          notes: values.notes || undefined,
          tech_requirements: techRequirements ?? undefined,
        };
        const res = await updateEventCommand(initialEvent.id, payload);
        if (res.ok) {
          reset(values);
          toast.success('Event Updated.');
        } else {
          setSaveError(res.error ?? 'Failed to save');
        }
      });
    },
    [initialEvent.id, initialEvent.starts_at, initialEvent.ends_at, reset, setError]
  );

  const teamMembers = useMemo(() => {
    const out: { id: string; name: string | null; avatarUrl?: string | null; role?: string }[] = [];
    if (initialEvent.producer_id) {
      out.push({
        id: initialEvent.producer_id,
        name: initialEvent.producer_name ?? null,
        role: 'Producer',
      });
    }
    if (initialEvent.pm_id) {
      out.push({
        id: initialEvent.pm_id,
        name: initialEvent.pm_name ?? null,
        role: 'PM',
      });
    }
    return out;
  }, [initialEvent.producer_id, initialEvent.producer_name, initialEvent.pm_id, initialEvent.pm_name]);

  return (
    <div className="relative pb-24">
      <SaveBar
        isDirty={isDirty}
        onReset={onReset}
        onSubmit={handleSubmit(onSubmit)}
        isSubmitting={pending}
        error={saveError}
      />

      <form
        className="grid grid-cols-1 md:grid-cols-12 gap-4 p-6 auto-rows-[minmax(180px,auto)]"
        noValidate
      >
        {/* Zone A: Hero – Title, Internal Code, Lifecycle Status */}
        <div className="md:col-span-12">
          <LiquidPanel className="relative min-h-[140px] flex flex-col justify-end p-6 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-silk/6 via-transparent to-transparent pointer-events-none rounded-[inherit]" aria-hidden />
            <div className="relative z-10 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <input
                  {...register('title')}
                  placeholder="Event title"
                  className={cn(
                    'w-full min-w-0 rounded-xl border border-mercury bg-transparent py-2 px-3 text-2xl md:text-3xl font-light text-ink tracking-tight placeholder:text-ink-muted outline-none transition-[border-color,box-shadow]',
                    'ring-1 ring-silk/15 focus:ring-2 focus:ring-neon-blue/30 focus:border-silk/30'
                  )}
                />
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    className="text-sm font-mono text-ink-muted bg-ceramic/5 px-2 py-0.5 rounded-md border border-[var(--glass-border)]"
                    title="Internal code (read-only)"
                  >
                    {defaultValues.internal_code || '—'}
                  </span>
                  <Controller
                    name="lifecycle_status"
                    control={control}
                    render={({ field }) => (
                      <StatusPill
                        value={field.value}
                        onSave={async (v) => {
                          field.onChange(v);
                          return { ok: true };
                        }}
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </LiquidPanel>
        </div>

        {/* Zone B: TimeCapsule (Dates, Times, Load-In/Out + Elastic features) */}
        <div className="md:col-span-6">
          <TimeCapsule
            control={control}
            watch={watch}
            setValue={setValue}
          />
        </div>
        <div className="md:col-span-6">
          <LiquidPanel className="h-full flex flex-col">
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
              Venue
            </h3>
            <div className="space-y-3">
              <input
                {...register('venue_name')}
                placeholder="Venue name"
                className={inputBase}
              />
              <Textarea
                {...register('venue_address')}
                placeholder="Address"
                rows={3}
                className={cn(inputBase, 'resize-y')}
              />
            </div>
          </LiquidPanel>
        </div>

        {/* Zone C: CRM & Context */}
        <div className="md:col-span-6">
          <LiquidPanel className="h-full flex flex-col">
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
              CRM & context
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-ink-muted uppercase tracking-wider block mb-1">
                  Probability ({watch('crm_probability')}%)
                </label>
                <Controller
                  name="crm_probability"
                  control={control}
                  render={({ field }) => (
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none bg-ceramic/10 accent-ink"
                    />
                  )}
                />
              </div>
              <div>
                <label htmlFor="event-crm-estimated-value" className="text-xs font-medium text-ink-muted uppercase tracking-wider block mb-1">
                  Est. value
                </label>
                <Controller
                  name="crm_estimated_value"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput
                      id="event-crm-estimated-value"
                      value={field.value != null ? String(field.value) : ''}
                      onChange={(v) => field.onChange(v.trim() === '' ? 0 : Number(v))}
                      placeholder="0.00"
                    />
                  )}
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wider block mb-1">
                    Guest count (expected)
                  </label>
                  <input
                    type="number"
                    min={0}
                    {...register('guest_count_expected', { setValueAs: (v) => (v === '' || Number.isNaN(Number(v)) ? '' : Number(v)) })}
                    placeholder="—"
                    className={inputBase}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-ink-muted uppercase tracking-wider block mb-1">
                    Guest count (actual)
                  </label>
                  <input
                    type="number"
                    min={0}
                    {...register('guest_count_actual', { setValueAs: (v) => (v === '' || Number.isNaN(Number(v)) ? '' : Number(v)) })}
                    placeholder="—"
                    className={inputBase}
                  />
                </div>
              </div>
            </div>
          </LiquidPanel>
        </div>

        {/* Zone D: Notes + Tech */}
        <div className="md:col-span-6">
          <LiquidPanel className="h-full flex flex-col">
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
              Notes
            </h3>
            <Textarea
              {...register('notes')}
              placeholder="General notes…"
              rows={4}
              className={cn(inputBase, 'resize-y')}
            />
          </LiquidPanel>
        </div>
        <div className="md:col-span-6">
          <LiquidPanel className="h-full flex flex-col">
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
              Tech requirements
            </h3>
            <Textarea
              {...register('tech_requirements_json')}
              placeholder='{ "audio": "", "video": "", "lighting": "", "notes": "" }'
              rows={4}
              className={cn(inputBase, 'resize-y font-mono text-sm')}
            />
          </LiquidPanel>
        </div>

        {/* Team + Launchpad */}
        <div className="md:col-span-6">
          <LiquidPanel className="h-full flex flex-col">
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
              Team
            </h3>
            <TeamPile members={teamMembers} size="md" />
          </LiquidPanel>
        </div>
        <div className="md:col-span-6">
          <LiquidPanel className="h-full flex flex-col" hoverEffect>
            <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
              Launchpad
            </h3>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/events/${initialEvent.id}/finance`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink bg-silk/30 hover:bg-silk/50 transition-colors"
              >
                <DollarSign className="size-4" />
                Finance
              </Link>
              <Link
                href={`/events/${initialEvent.id}/deal`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-muted hover:text-ink hover:bg-ceramic/5 transition-colors"
              >
                <FileText className="size-4" />
                Deal room
              </Link>
              <Link
                href="/calendar"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-muted hover:text-ink hover:bg-ceramic/5 transition-colors"
              >
                <Calendar className="size-4" />
                Calendar
              </Link>
            </div>
          </LiquidPanel>
        </div>
      </form>
    </div>
  );
}
