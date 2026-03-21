'use client';

import { useState, useTransition, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { Command } from 'cmdk';
import { Building2, User, MapPin, Plus, ChevronRight, ChevronDown, Heart } from 'lucide-react';
import { createDeal, type CreateDealInput } from '../actions/deal-actions';
import { checkDateFeasibility, type FeasibilityStatus, type CheckDateFeasibilityResult } from '../actions/check-date-feasibility';
import { searchOmni, getVenueSuggestions, type OmniResult, type VenueSuggestion } from '../actions/lookup';
import { CalendarPanel, parseLocalDateString } from './ceramic-date-picker';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { cn } from '@/shared/lib/utils';
import { SIGNAL_PHYSICS, M3_SHARED_AXIS_Y_VARIANTS } from '@/shared/lib/motion-constants';
import { format } from 'date-fns';
import { Calendar } from 'lucide-react';
import type { OptimisticUpdate } from './crm-production-queue';

const EVENT_ARCHETYPES = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'corporate_gala', label: 'Corporate Gala' },
  { value: 'product_launch', label: 'Product Launch' },
  { value: 'private_dinner', label: 'Private Dinner' },
] as const;

function FeasibilityBadge({ status, message }: { status: FeasibilityStatus; message: string }) {
  const styles: Record<FeasibilityStatus, string> = {
    clear: 'border-[var(--color-signal-success)] bg-[var(--color-surface-success)]/20 text-[var(--color-signal-success)]',
    caution: 'border-[var(--color-signal-warning)] bg-[var(--color-surface-warning)]/20 text-[var(--color-signal-warning)]',
    critical: 'border-[var(--color-signal-error)] bg-[var(--color-surface-error)]/20 text-[var(--color-signal-error)]',
  };
  const dots: Record<FeasibilityStatus, string> = {
    clear: 'bg-[var(--color-signal-success)]',
    caution: 'bg-[var(--color-signal-warning)]',
    critical: 'bg-[var(--color-signal-error)]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium',
        styles[status]
      )}
      role="status"
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dots[status])} aria-hidden />
      {message}
    </span>
  );
}

function normalizeTime(v: string): string | null {
  if (!v) return null;
  const parts = v.split(':');
  const h = (parts[0] ?? '00').padStart(2, '0');
  const m = (parts[1] ?? '00').padStart(2, '0').slice(0, 2);
  if (parseInt(h, 10) <= 23 && parseInt(m, 10) <= 59) return `${h}:${m}`;
  return null;
}

function TimeInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  eventDate?: string;
  startTime?: string;
  isStart?: boolean;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^\d:]/g, '');
    const parts = v.split(':');
    if (parts.length > 2) return;
    const h = (parts[0] ?? '').slice(0, 2);
    const m = (parts[1] ?? '').slice(0, 2);
    if (!h) onChange('');
    else if (v.endsWith(':')) onChange(`${h}:`);
    else if (!m) onChange(h);
    else onChange(`${h}:${m}`);
  };
  const handleBlur = () => {
    if (!value) return;
    const n = normalizeTime(value);
    if (n) onChange(n);
  };
  return (
    <div className="flex flex-col gap-0.5">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="9:00 or 14:30"
        maxLength={5}
        className="w-full min-w-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
      <span className="text-[10px] text-ink-muted">24h (14:30 = 2:30 PM)</span>
    </div>
  );
}

type ClientType = 'company' | 'individual' | 'couple';

interface CreateGigModalProps {
  open: boolean;
  onClose: () => void;
  addOptimisticGig: (update: OptimisticUpdate) => void;
  onRefetchList?: () => Promise<void>;
}

export function CreateGigModal({ open, onClose, addOptimisticGig, onRefetchList }: CreateGigModalProps) {
  const router = useRouter();
  const { hasWorkspace } = useWorkspace();
  const [isPending, startTransition] = useTransition();
  const [stage, setStage] = useState<1 | 2>(1);
  const [eventDate, setEventDate] = useState('');
  const [eventArchetype, setEventArchetype] = useState<string | null>(null);
  const [feasibility, setFeasibility] = useState<CheckDateFeasibilityResult | null>(null);
  const [feasibilityLoading, setFeasibilityLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [eventType, setEventType] = useState<'single' | 'recurring' | 'multi_day'>('single');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [budgetEstimated, setBudgetEstimated] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const budgetEstimatedDisplay = budgetEstimated === undefined ? '' : String(budgetEstimated);

  // Client type selection
  const [clientType, setClientType] = useState<ClientType>('company');

  // Individual client form
  const [individualForm, setIndividualForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });

  // Couple client form
  const [coupleForm, setCoupleForm] = useState({
    partnerAFirst: '', partnerALast: '', partnerAEmail: '',
    partnerBFirst: '', partnerBLast: '', partnerBEmail: '',
  });
  const [coupleDisplayName, setCoupleDisplayName] = useState('');
  const [displayNameMode, setDisplayNameMode] = useState<'auto' | 'manual'>('auto');

  // Auto-generate couple display name
  useEffect(() => {
    if (displayNameMode !== 'auto') return;
    const { partnerAFirst, partnerALast, partnerBFirst, partnerBLast } = coupleForm;
    if (!partnerAFirst && !partnerBFirst) { setCoupleDisplayName(''); return; }
    const sameLast = partnerALast && partnerBLast && partnerALast.trim().toLowerCase() === partnerBLast.trim().toLowerCase();
    if (sameLast) {
      setCoupleDisplayName(`${partnerAFirst} & ${partnerBFirst} ${partnerALast}`.trim());
    } else {
      const a = [partnerAFirst, partnerALast].filter(Boolean).join(' ');
      const b = [partnerBFirst, partnerBLast].filter(Boolean).join(' ');
      setCoupleDisplayName([a, b].filter(Boolean).join(' & '));
    }
  }, [coupleForm, displayNameMode]);

  // Clear error when modal opens or stage changes so stale submit errors don't linger
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  const goToStage = (next: 1 | 2) => {
    setError(null);
    setStage(next);
  };

  // Client OmniBox state (company mode only)
  const [clientOpen, setClientOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<OmniResult[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{
    type: 'org' | 'contact';
    id: string;
    name: string;
    organizationId?: string | null;
  } | null>(null);

  // VenueBox state
  const [venueOpen, setVenueOpen] = useState(false);
  const [venueQuery, setVenueQuery] = useState('');
  const [venueResults, setVenueResults] = useState<VenueSuggestion[]>([]);
  const [venueLoading, setVenueLoading] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<{ id: string; name: string; address?: string | null } | null>(null);

  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const dateBlockRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setCalendarExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!calendarExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dateBlockRef.current?.contains(e.target as Node)) return;
      setCalendarExpanded(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [calendarExpanded]);

  const orgId = selectedClient?.type === 'org' ? selectedClient.id : selectedClient?.organizationId ?? null;

  const runClientSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setClientResults([]);
      return;
    }
    setClientLoading(true);
    try {
      const res = await searchOmni(q);
      setClientResults(res);
    } catch {
      setClientResults([]);
    } finally {
      setClientLoading(false);
    }
  }, []);

  const runVenueSearch = useCallback(async (q: string) => {
    setVenueLoading(true);
    try {
      const res = await getVenueSuggestions(q, orgId);
      setVenueResults(res);
    } catch {
      setVenueResults([]);
    } finally {
      setVenueLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (clientQuery.length < 2) {
      setClientResults([]);
      return;
    }
    const t = setTimeout(() => runClientSearch(clientQuery), 150);
    return () => clearTimeout(t);
  }, [clientQuery, runClientSearch]);

  useEffect(() => {
    if (venueQuery.length < 1) {
      setVenueResults([]);
      return;
    }
    const t = setTimeout(() => runVenueSearch(venueQuery), 150);
    return () => clearTimeout(t);
  }, [venueQuery, orgId, runVenueSearch]);

  // Feasibility check when date and archetype are set
  useEffect(() => {
    if (!eventDate || !eventArchetype || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      setFeasibility(null);
      return;
    }
    let cancelled = false;
    setFeasibilityLoading(true);
    checkDateFeasibility(eventDate)
      .then((res) => {
        if (!cancelled) {
          setFeasibility(res);
        }
      })
      .finally(() => {
        if (!cancelled) setFeasibilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventDate, eventArchetype]);

  // Compute optimistic client name based on type
  const getOptimisticClientName = (): string => {
    if (clientType === 'couple') return coupleDisplayName || 'Couple';
    if (clientType === 'individual') return [individualForm.firstName, individualForm.lastName].filter(Boolean).join(' ') || '';
    return selectedClient?.name ?? '';
  };

  const clientName = getOptimisticClientName();
  const locationStr = selectedVenue
    ? [selectedVenue.name, selectedVenue.address].filter(Boolean).join(', ')
    : venueQuery || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!hasWorkspace) {
      setError('No workspace selected. Complete onboarding first.');
      return;
    }
    if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      setError('Select a proposed date.');
      return;
    }

    const tempId = crypto.randomUUID();
    const optimisticGig = {
      id: tempId,
      title: title.trim() || null,
      status: 'inquiry' as const,
      event_date: eventDate,
      location: locationStr.trim() || null,
      client_name: clientName.trim() || null,
    };

    startTransition(async () => {
      addOptimisticGig({ type: 'add', gig: optimisticGig });

      let dealInput: CreateDealInput;

      if (clientType === 'individual') {
        dealInput = {
          proposedDate: eventDate,
          eventArchetype: (eventArchetype ?? undefined) as CreateDealInput['eventArchetype'],
          title: title.trim() || undefined,
          clientType: 'individual',
          clientFirstName: individualForm.firstName.trim() || undefined,
          clientLastName: individualForm.lastName.trim() || undefined,
          clientEmail: individualForm.email.trim() || undefined,
          clientPhone: individualForm.phone.trim() || undefined,
          status: 'inquiry',
          budgetEstimated: budgetEstimated ?? undefined,
          notes: notesTrimmed || undefined,
          venueId: (selectedVenue?.id && selectedVenue.id.length > 0) ? selectedVenue.id : undefined,
          venueName: (!selectedVenue?.id && selectedVenue?.name) ? selectedVenue.name : undefined,
        };
      } else if (clientType === 'couple') {
        dealInput = {
          proposedDate: eventDate,
          eventArchetype: (eventArchetype ?? undefined) as CreateDealInput['eventArchetype'],
          title: title.trim() || undefined,
          clientType: 'couple',
          clientFirstName: coupleForm.partnerAFirst.trim() || undefined,
          clientLastName: coupleForm.partnerALast.trim() || undefined,
          clientEmail: coupleForm.partnerAEmail.trim() || undefined,
          partnerBFirstName: coupleForm.partnerBFirst.trim() || undefined,
          partnerBLastName: coupleForm.partnerBLast.trim() || undefined,
          partnerBEmail: coupleForm.partnerBEmail.trim() || undefined,
          clientName: coupleDisplayName.trim() || undefined,
          status: 'inquiry',
          budgetEstimated: budgetEstimated ?? undefined,
          notes: notesTrimmed || undefined,
          venueId: (selectedVenue?.id && selectedVenue.id.length > 0) ? selectedVenue.id : undefined,
          venueName: (!selectedVenue?.id && selectedVenue?.name) ? selectedVenue.name : undefined,
        };
      } else {
        // Company (default)
        dealInput = {
          proposedDate: eventDate,
          eventArchetype: (eventArchetype ?? undefined) as CreateDealInput['eventArchetype'],
          title: title.trim() || undefined,
          clientType: 'company',
          organizationId: selectedClient?.type === 'org' && selectedClient.id ? selectedClient.id : selectedClient?.organizationId ?? undefined,
          clientName: (!selectedClient?.id && selectedClient?.name) ? selectedClient.name : undefined,
          mainContactId: selectedClient?.type === 'contact' ? selectedClient.id : undefined,
          status: 'inquiry',
          budgetEstimated: budgetEstimated ?? undefined,
          notes: notesTrimmed || undefined,
          venueId: (selectedVenue?.id && selectedVenue.id.length > 0) ? selectedVenue.id : undefined,
          venueName: (!selectedVenue?.id && selectedVenue?.name) ? selectedVenue.name : undefined,
        };
      }

      const result = await createDeal(dealInput);

      if (result.success) {
        addOptimisticGig({ type: 'replaceId', tempId, realId: result.dealId });
        await onRefetchList?.();
        router.refresh();
        onClose();
        resetForm();
      } else {
        addOptimisticGig({ type: 'revert', tempId });
        setError(result.error);
      }
    });
  };

  const notesTrimmed = notes?.trim() || '';

  function resetForm() {
    setStage(1);
    setCalendarExpanded(false);
    setEventDate('');
    setEventArchetype(null);
    setFeasibility(null);
    setTitle('');
    setEndDate('');
    setStartTime('');
    setEndTime('');
    setSelectedClient(null);
    setSelectedVenue(null);
    setClientQuery('');
    setVenueQuery('');
    setNotes('');
    setBudgetEstimated(undefined);
    setClientType('company');
    setIndividualForm({ firstName: '', lastName: '', email: '', phone: '' });
    setCoupleForm({ partnerAFirst: '', partnerALast: '', partnerAEmail: '', partnerBFirst: '', partnerBLast: '', partnerBEmail: '' });
    setCoupleDisplayName('');
    setDisplayNameMode('auto');
  }

  const handleClientTypeChange = (type: ClientType) => {
    setClientType(type);
    setSelectedClient(null);
    setClientQuery('');
    setClientResults([]);
    if (type !== 'individual') setIndividualForm({ firstName: '', lastName: '', email: '', phone: '' });
    if (type !== 'couple') {
      setCoupleForm({ partnerAFirst: '', partnerALast: '', partnerAEmail: '', partnerBFirst: '', partnerBLast: '', partnerBEmail: '' });
      setCoupleDisplayName('');
      setDisplayNameMode('auto');
    }
  };

  const pillBase = 'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]';
  const pillActive = 'bg-[var(--glass-bg-hover)] text-ink border border-[var(--glass-border)]';
  const pillInactive = 'text-ink-muted hover:text-ink hover:bg-white/5 border border-transparent';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto overflow-x-hidden">
          <motion.div
            className="absolute inset-0 bg-obsidian/50 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SIGNAL_PHYSICS}
            onMouseDown={onClose}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            role="button"
            tabIndex={0}
            aria-label="Close modal"
          />
          <motion.div
            ref={modalContentRef}
            className="relative z-10 my-auto w-full max-w-2xl min-w-0 max-h-[min(90vh,48rem)]"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={SIGNAL_PHYSICS}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
      <LiquidPanel className="flex flex-col overflow-hidden p-0 h-full">
        <div className="p-6 pb-4 shrink-0 min-w-0 overflow-hidden">
          <h2 className="text-lg font-medium text-ink mb-1 truncate">
            {stage === 1 ? 'Set the date' : 'New production'}
          </h2>
          <p className="text-sm text-ink-muted break-words">
            {stage === 1
              ? "Check availability for your date and event type. We'll show you demand at a glance."
              : 'Add client and details. This creates a deal in your pipeline (no event yet).'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="relative flex-1 overflow-y-auto overflow-x-hidden px-6 py-2 min-h-0 min-w-0">
          <div className="grid grid-cols-1 gap-4 auto-rows-auto pb-4 min-w-0">
            {/* Stage 1: Date + Archetype + Feasibility badge */}
            {stage === 1 && (
              <motion.div
                key="stage1"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SIGNAL_PHYSICS}
                className="space-y-4 min-w-0"
              >
                <div ref={dateBlockRef} className="space-y-4 min-w-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="create-gig-proposed-date"
                        className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5"
                      >
                        Proposed date
                      </label>
                      <button
                        id="create-gig-proposed-date"
                        type="button"
                        onClick={() => setCalendarExpanded((o) => !o)}
                        aria-expanded={calendarExpanded}
                        aria-haspopup="dialog"
                        className={cn(
                          'flex w-full min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors duration-200',
                          'border-[var(--glass-border)] bg-[var(--glass-bg)] text-left',
                          'hover:bg-[var(--glass-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-inset'
                        )}
                      >
                        <Calendar size={16} className="shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden />
                        <span className={cn('flex-1 min-w-0 truncate', eventDate ? 'text-ink' : 'text-ink-muted/70')}>
                          {eventDate ? format(parseLocalDateString(eventDate), 'PPP') : 'Select date'}
                        </span>
                        <ChevronDown
                          size={16}
                          className={cn('shrink-0 text-ink-muted transition-transform duration-200', calendarExpanded && 'rotate-180')}
                          aria-hidden
                        />
                      </button>
                    </div>
                    <div>
                      <label
                        htmlFor="create-gig-event-archetype"
                        className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5"
                      >
                        Event archetype
                      </label>
                      <div className="relative">
                        <select
                          id="create-gig-event-archetype"
                          value={eventArchetype ?? ''}
                          onChange={(e) => setEventArchetype(e.target.value || null)}
                          className={cn(
                            'w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] pl-3 pr-9 py-2.5 text-sm appearance-none cursor-pointer',
                            'text-ink placeholder:text-ink-muted/70',
                            'hover:bg-[var(--glass-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-inset'
                          )}
                        >
                          <option value="">Select type</option>
                          {EVENT_ARCHETYPES.map((a) => (
                            <option key={a.value} value={a.value}>{a.label}</option>
                          ))}
                        </select>
                        <ChevronDown
                          size={16}
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
                          aria-hidden
                        />
                      </div>
                    </div>
                  </div>
                  <AnimatePresence>
                    {calendarExpanded && (
                      <motion.div
                        key="calendar-row"
                        initial={M3_SHARED_AXIS_Y_VARIANTS.hidden}
                        animate={M3_SHARED_AXIS_Y_VARIANTS.visible}
                        exit={{ opacity: 0, y: -12 }}
                        transition={SIGNAL_PHYSICS}
                        className="w-full min-w-0"
                      >
                        <CalendarPanel
                          value={eventDate}
                          onChange={(d) => {
                            setEventDate(d);
                            setCalendarExpanded(false);
                          }}
                          onClose={() => setCalendarExpanded(false)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {eventDate && eventArchetype && (
                  <div className="flex items-center gap-2 min-w-0">
                    {feasibilityLoading ? (
                      <span className="text-sm text-ink-muted">Checking availability…</span>
                    ) : feasibility ? (
                      <FeasibilityBadge status={feasibility.status} message={feasibility.message} />
                    ) : null}
                  </div>
                )}
              </motion.div>
            )}

            {/* Stage 2: Title, Client, Venue, Budget, Notes */}
            {stage === 2 && (
              <motion.div
                key="stage2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SIGNAL_PHYSICS}
                className="space-y-4 min-w-0"
              >
            <div className="space-y-4 min-w-0">
              <div>
                <label htmlFor="create-gig-title" className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
                  Title
                </label>
                <input
                  id="create-gig-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Summer Gala 2026"
                  className="w-full min-w-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>

              {/* Client section */}
              <div>
                <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
                  Client
                </label>

                {/* Client type toggle — only show when no existing client is selected (company mode) */}
                {(clientType !== 'company' || !selectedClient) && (
                  <div className="flex gap-1 p-1 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 mb-3">
                    <button
                      type="button"
                      onClick={() => handleClientTypeChange('company')}
                      className={cn(pillBase, clientType === 'company' ? pillActive : pillInactive)}
                    >
                      <Building2 className="inline-block size-3 mr-1" />
                      Company
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClientTypeChange('individual')}
                      className={cn(pillBase, clientType === 'individual' ? pillActive : pillInactive)}
                    >
                      <User className="inline-block size-3 mr-1" />
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClientTypeChange('couple')}
                      className={cn(pillBase, clientType === 'couple' ? pillActive : pillInactive)}
                    >
                      <Heart className="inline-block size-3 mr-1" />
                      Couple
                    </button>
                  </div>
                )}

                {clientType === 'company' && (
                  <Command
                    className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] overflow-hidden min-w-0"
                    loop
                  >
                    <Command.Input
                      value={selectedClient ? selectedClient.name : clientQuery}
                      onValueChange={(v) => {
                        setSelectedClient(null);
                        setClientQuery(v);
                      }}
                      onFocus={() => setClientOpen(true)}
                      onBlur={() => setTimeout(() => setClientOpen(false), 180)}
                      placeholder="Search org or contact…"
                      className="w-full min-w-0 border-0 bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-0 truncate"
                    />
                    {clientOpen && (clientResults.length > 0 || (clientQuery.length >= 2 && !clientLoading)) && (
                    <Command.List className="h-fit max-h-[200px] overflow-y-auto overflow-x-hidden border-t border-[var(--glass-border)]">
                      <>
                          {clientResults.map((r) => (
                            <Command.Item
                              key={`${r.type}-${r.id}`}
                              value={`${r.type}-${r.id}-${r.type === 'org' ? r.name : `${r.first_name} ${r.last_name}`}`}
                              onSelect={() => {
                                if (r.type === 'org') {
                                  setSelectedClient({ type: 'org', id: r.id, name: r.name });
                                } else {
                                  setSelectedClient({
                                    type: 'contact',
                                    id: r.id,
                                    name: `${r.first_name} ${r.last_name}`,
                                    organizationId: r.organization_id,
                                  });
                                }
                                setClientQuery('');
                                setClientResults([]);
                              }}
                              className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[var(--glass-bg-hover)] data-[selected=true]:bg-[var(--glass-bg-hover)] min-w-0"
                            >
                              {r.type === 'org' ? (
                                <Building2 size={16} className="shrink-0 text-ink-muted" strokeWidth={1.5} />
                              ) : (
                                <User size={16} className="shrink-0 text-ink-muted" strokeWidth={1.5} />
                              )}
                              <span className="text-ink truncate min-w-0">
                                {r.type === 'org' ? r.name : `${r.first_name} ${r.last_name}`}
                              </span>
                              {r.type === 'contact' && r.email && (
                                <span className="text-ink-muted text-xs truncate shrink-0 max-w-[120px]">{r.email}</span>
                              )}
                            </Command.Item>
                          ))}
                          {clientQuery.length >= 2 && clientResults.length === 0 && !clientLoading && (
                            <Command.Item
                              value={`create-${clientQuery}`}
                              onSelect={() => {
                                setSelectedClient({ type: 'org', id: '', name: clientQuery.trim() });
                                setClientQuery('');
                                setClientResults([]);
                              }}
                              className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer text-accent-sage hover:bg-[var(--glass-bg-hover)] data-[selected=true]:bg-[var(--glass-bg-hover)] min-w-0"
                            >
                              <Plus size={16} className="shrink-0" strokeWidth={1.5} />
                              <span className="truncate min-w-0">Add &quot;{clientQuery.trim()}&quot; as client</span>
                            </Command.Item>
                          )}
                      </>
                    </Command.List>
                    )}
                  </Command>
                )}

                {clientType === 'individual' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <FloatingLabelInput
                        label="First name"
                        value={individualForm.firstName}
                        onChange={(e) => setIndividualForm((p) => ({ ...p, firstName: e.target.value }))}
                        className="bg-white/5 border-[var(--color-mercury)]"
                      />
                      <FloatingLabelInput
                        label="Last name"
                        value={individualForm.lastName}
                        onChange={(e) => setIndividualForm((p) => ({ ...p, lastName: e.target.value }))}
                        className="bg-white/5 border-[var(--color-mercury)]"
                      />
                    </div>
                    <FloatingLabelInput
                      label="Email (optional)"
                      type="email"
                      value={individualForm.email}
                      onChange={(e) => setIndividualForm((p) => ({ ...p, email: e.target.value }))}
                      className="bg-white/5 border-[var(--color-mercury)]"
                    />
                    <FloatingLabelInput
                      label="Phone (optional)"
                      type="tel"
                      value={individualForm.phone}
                      onChange={(e) => setIndividualForm((p) => ({ ...p, phone: e.target.value }))}
                      className="bg-white/5 border-[var(--color-mercury)]"
                    />
                  </div>
                )}

                {clientType === 'couple' && (
                  <div className="space-y-4">
                    {/* Partner A */}
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted mb-2">Partner A</p>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <FloatingLabelInput
                            label="First name"
                            value={coupleForm.partnerAFirst}
                            onChange={(e) => setCoupleForm((p) => ({ ...p, partnerAFirst: e.target.value }))}
                            className="bg-white/5 border-[var(--color-mercury)]"
                          />
                          <FloatingLabelInput
                            label="Last name"
                            value={coupleForm.partnerALast}
                            onChange={(e) => setCoupleForm((p) => ({ ...p, partnerALast: e.target.value }))}
                            className="bg-white/5 border-[var(--color-mercury)]"
                          />
                        </div>
                        <FloatingLabelInput
                          label="Email (optional)"
                          type="email"
                          value={coupleForm.partnerAEmail}
                          onChange={(e) => setCoupleForm((p) => ({ ...p, partnerAEmail: e.target.value }))}
                          className="bg-white/5 border-[var(--color-mercury)]"
                        />
                      </div>
                    </div>

                    {/* Partner B */}
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted mb-2">Partner B</p>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <FloatingLabelInput
                            label="First name"
                            value={coupleForm.partnerBFirst}
                            onChange={(e) => setCoupleForm((p) => ({ ...p, partnerBFirst: e.target.value }))}
                            className="bg-white/5 border-[var(--color-mercury)]"
                          />
                          <FloatingLabelInput
                            label="Last name"
                            value={coupleForm.partnerBLast}
                            onChange={(e) => setCoupleForm((p) => ({ ...p, partnerBLast: e.target.value }))}
                            className="bg-white/5 border-[var(--color-mercury)]"
                          />
                        </div>
                        <FloatingLabelInput
                          label="Email (optional)"
                          type="email"
                          value={coupleForm.partnerBEmail}
                          onChange={(e) => setCoupleForm((p) => ({ ...p, partnerBEmail: e.target.value }))}
                          className="bg-white/5 border-[var(--color-mercury)]"
                        />
                      </div>
                    </div>

                    {/* Display name (auto/manual) */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Display name</p>
                        {displayNameMode === 'auto' && (
                          <span className="rounded-full border border-[var(--glass-border)] bg-white/5 px-2 py-0.5 text-[10px] text-ink-muted">
                            auto
                          </span>
                        )}
                        {displayNameMode === 'manual' && (
                          <button
                            type="button"
                            onClick={() => setDisplayNameMode('auto')}
                            className="rounded-full border border-[var(--glass-border)] bg-white/5 px-2 py-0.5 text-[10px] text-ink-muted hover:text-ink transition-colors"
                          >
                            reset to auto
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={coupleDisplayName}
                        onChange={(e) => {
                          setCoupleDisplayName(e.target.value);
                          setDisplayNameMode('manual');
                        }}
                        placeholder="e.g. Emma & James Johnson"
                        className="w-full min-w-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Venue Selector */}
            <div className="min-w-0 relative">
              <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
                Venue
              </label>
              <input
                type="text"
                value={selectedVenue ? selectedVenue.name : venueQuery}
                onChange={(e) => {
                  setSelectedVenue(null);
                  setVenueQuery(e.target.value);
                }}
                onFocus={() => setVenueOpen(true)}
                onBlur={() => setTimeout(() => setVenueOpen(false), 200)}
                placeholder="Search venue or type to create…"
                className="w-full min-w-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] truncate"
              />
              {venueOpen && venueQuery.length >= 1 && venueResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[180px] overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-[var(--glass-shadow)]">
                  {venueResults.map((r, i) =>
                    r.type === 'venue' ? (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setSelectedVenue({
                            id: r.id,
                            name: r.name,
                            address: r.address ?? undefined,
                          });
                          setVenueQuery('');
                          setVenueResults([]);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-[var(--glass-bg-hover)] min-w-0"
                      >
                        <MapPin size={16} className="shrink-0 text-ink-muted" strokeWidth={1.5} />
                        <span className="text-ink truncate min-w-0">{r.name}</span>
                        {(r.address || r.city) && (
                          <span className="text-ink-muted text-xs truncate shrink-0 max-w-[140px]">
                            {[r.address, r.city, r.state].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </button>
                    ) : (
                      <button
                        key={`create-${i}`}
                        type="button"
                        onClick={() => {
                          setSelectedVenue({ id: '', name: r.query, address: null });
                          setVenueQuery(r.query);
                          setVenueResults([]);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-accent-sage hover:bg-[var(--glass-bg-hover)] min-w-0"
                      >
                        <Plus size={16} className="shrink-0" strokeWidth={1.5} />
                        <span className="truncate min-w-0">Create venue &quot;{r.query}&quot;</span>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Optional: Rough Budget + Notes */}
            <div>
              <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
                Rough budget (optional)
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={budgetEstimatedDisplay}
                onChange={(e) => {
                  const v = e.target.value;
                  setBudgetEstimated(v === '' ? undefined : Number(v));
                }}
                placeholder="e.g. 25000"
                className="w-full min-w-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes…"
                rows={2}
                className="w-full min-w-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none"
              />
            </div>
            </motion.div>
            )}
          </div>

          </div>

          <div className="flex flex-col gap-2 p-6 pt-4 border-t border-[var(--glass-border)] shrink-0 bg-[var(--glass-bg)]/50 min-w-0 overflow-hidden">
            {!hasWorkspace && (
              <p className="text-sm text-[var(--color-signal-error)] break-words">
                No workspace selected. Complete onboarding first.
              </p>
            )}
            {hasWorkspace && error && (
              <p className="text-sm text-[var(--color-signal-error)] break-words">{error}</p>
            )}
            <div className="flex gap-2 min-w-0">
            {stage === 1 ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-[var(--glass-border)] py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--glass-bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                >
                  Cancel
                </button>
                <button
                    type="button"
                    disabled={!hasWorkspace || !eventDate || !eventArchetype || feasibilityLoading}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      goToStage(2);
                    }}
                    className="flex-1 m3-btn-tonal min-h-[44px] rounded-xl transition-[transform,filter] hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] flex items-center justify-center gap-2"
                  >
                    Next <ChevronRight size={16} />
                  </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    goToStage(1);
                  }}
                  className="flex-1 rounded-xl border border-[var(--glass-border)] py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--glass-bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={!hasWorkspace || isPending}
                  className="flex-1 m3-btn-tonal min-h-[44px] rounded-xl transition-[transform,filter] hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] flex items-center justify-center gap-2"
                >
                  {isPending ? 'Creating…' : 'Create deal'}
                </button>
              </>
            )}
            </div>
          </div>
        </form>
      </LiquidPanel>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
