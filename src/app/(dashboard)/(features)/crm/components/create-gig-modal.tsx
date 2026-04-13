'use client';

import { useState, useTransition, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Building2, User, MapPin, Plus, ChevronRight, ChevronDown, Loader2, X } from 'lucide-react';
import { createDeal } from '../actions/deal-actions';
import type { CreateDealInput, CreateDealResult } from '../actions/deal-model';
import { UpgradeInline } from '@/shared/ui/upgrade-prompt';
import { toast } from 'sonner';
import { getWorkspaceLeadSources, type WorkspaceLeadSource } from '@/features/lead-sources';
import { checkDateFeasibility, type FeasibilityStatus, type CheckDateFeasibilityResult } from '../actions/check-date-feasibility';
import { searchOmni, getVenueSuggestions, type OmniResult, type VenueSuggestion } from '../actions/lookup';
import { searchReferrerEntities, type ReferrerSearchResult } from '../actions/search-referrer';
import { CalendarPanel, parseLocalDateString } from './ceramic-date-picker';
import { cn } from '@/shared/lib/utils';
import { TimePicker } from '@/shared/ui/time-picker';
import { STAGE_HEAVY, STAGE_MEDIUM, STAGE_LIGHT, STAGE_NAV_CROSSFADE } from '@/shared/lib/motion-constants';
import { useModalLayer } from '@/shared/lib/use-modal-layer';
import { format } from 'date-fns';
import { Calendar } from 'lucide-react';
import type { OptimisticUpdate } from './crm-production-queue';
import { DEAL_ARCHETYPES, DEAL_ARCHETYPE_LABELS } from '../actions/deal-model';
import { FeasibilityBadge } from './create-gig-modal/feasibility-badge';
import { ClientTypePills, CompanyClientPicker, IndividualClientForm, CoupleClientForm } from './create-gig-modal/client-type-forms';
import { LeadSourceSelector } from './create-gig-modal/lead-source-selector';

const EVENT_ARCHETYPES = DEAL_ARCHETYPES.map((value) => ({ value, label: DEAL_ARCHETYPE_LABELS[value] }));

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
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const [feasibility, setFeasibility] = useState<CheckDateFeasibilityResult | null>(null);
  const [feasibilityLoading, setFeasibilityLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [eventType, setEventType] = useState<'single' | 'recurring' | 'multi_day'>('single');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [budgetEstimated, setBudgetEstimated] = useState<number | undefined>(undefined);
  const [leadSource, setLeadSource] = useState<'referral' | 'repeat_client' | 'website' | 'social' | 'direct' | null>(null);
  // Structured lead source state
  const [leadSources, setLeadSources] = useState<WorkspaceLeadSource[]>([]);
  const [selectedLeadSourceId, setSelectedLeadSourceId] = useState<string | null>(null);
  const [leadSourceDetail, setLeadSourceDetail] = useState('');
  const [referrerEntityId, setReferrerEntityId] = useState<string | null>(null);
  const [referrerName, setReferrerName] = useState('');
  const [referrerQuery, setReferrerQuery] = useState('');
  const [referrerResults, setReferrerResults] = useState<ReferrerSearchResult[]>([]);
  const [referrerSearching, setReferrerSearching] = useState(false);
  const [referrerCreating, setReferrerCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLimitData, setShowLimitData] = useState<{ current: number; limit: number | null } | null>(null);
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
    if (open) { setError(null); setShowLimitData(null); }
  }, [open]);
  const goToStage = (next: 1 | 2) => {
    setError(null);
    setShowLimitData(null);
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

  // PlannerBox state
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerQuery, setPlannerQuery] = useState('');
  const [plannerResults, setPlannerResults] = useState<ReferrerSearchResult[]>([]);
  const [plannerSearching, setPlannerSearching] = useState(false);
  const [selectedPlanner, setSelectedPlanner] = useState<{ id: string; name: string; subtitle?: string | null } | null>(null);

  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const dateBlockRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const archetypeTriggerRef = useRef<HTMLButtonElement>(null);
  const venueTriggerRef = useRef<HTMLInputElement>(null);
  const plannerTriggerRef = useRef<HTMLInputElement>(null);
  const referrerTriggerRef = useRef<HTMLInputElement>(null);

  useModalLayer({ open, onClose, containerRef: modalContentRef });

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

  // Planner search with debounce — searches full network
  useEffect(() => {
    if (plannerQuery.length < 2) {
      setPlannerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setPlannerSearching(true);
      try {
        const res = await searchReferrerEntities(plannerQuery);
        setPlannerResults(res);
      } catch {
        setPlannerResults([]);
      } finally {
        setPlannerSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [plannerQuery]);

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

  // Fetch workspace lead sources on mount
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getWorkspaceLeadSources().then((sources) => {
      if (!cancelled) setLeadSources(sources);
    });
    return () => { cancelled = true; };
  }, [open]);

  // Referrer search with debounce — searches full network (team + connections)
  useEffect(() => {
    if (referrerQuery.length < 2) {
      setReferrerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setReferrerSearching(true);
      try {
        const res = await searchReferrerEntities(referrerQuery);
        setReferrerResults(res);
      } catch {
        setReferrerResults([]);
      } finally {
        setReferrerSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [referrerQuery]);

  const selectedLeadSource = leadSources.find((s) => s.id === selectedLeadSourceId) ?? null;
  // Show referrer picker for: (1) structured lead source with is_referral flag, OR (2) fallback "referral" pill, OR (3) any referral-category structured source
  const showReferrerPicker =
    selectedLeadSource?.is_referral === true ||
    selectedLeadSource?.category === 'referral' ||
    leadSource === 'referral';

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
          leadSource: leadSource ?? undefined,
          leadSourceId: selectedLeadSourceId ?? undefined,
          leadSourceDetail: leadSourceDetail.trim() || undefined,
          referrerEntityId: referrerEntityId ?? undefined,
          plannerEntityId: selectedPlanner?.id ?? undefined,
          eventStartTime: startTime || undefined,
          eventEndTime: endTime || undefined,
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
          leadSource: leadSource ?? undefined,
          leadSourceId: selectedLeadSourceId ?? undefined,
          leadSourceDetail: leadSourceDetail.trim() || undefined,
          referrerEntityId: referrerEntityId ?? undefined,
          plannerEntityId: selectedPlanner?.id ?? undefined,
          eventStartTime: startTime || undefined,
          eventEndTime: endTime || undefined,
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
          leadSource: leadSource ?? undefined,
          leadSourceId: selectedLeadSourceId ?? undefined,
          leadSourceDetail: leadSourceDetail.trim() || undefined,
          referrerEntityId: referrerEntityId ?? undefined,
          plannerEntityId: selectedPlanner?.id ?? undefined,
          eventStartTime: startTime || undefined,
          eventEndTime: endTime || undefined,
        };
      }

      const result: CreateDealResult = await createDeal(dealInput);

      if (result.success) {
        addOptimisticGig({ type: 'replaceId', tempId, realId: result.dealId });
        if (result.warning === 'approaching_show_limit') {
          toast('You are approaching your active show limit.', { description: 'Review your plan in settings.' });
        }
        await onRefetchList?.();
        router.refresh();
        onClose();
        resetForm();
      } else if (result.error === 'show_limit_reached' && 'current' in result) {
        addOptimisticGig({ type: 'revert', tempId });
        setShowLimitData({ current: result.current, limit: result.limit });
        setError(null);
      } else {
        addOptimisticGig({ type: 'revert', tempId });
        setShowLimitData(null);
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
    setSelectedPlanner(null);
    setPlannerQuery('');
    setPlannerResults([]);
    setClientQuery('');
    setVenueQuery('');
    setNotes('');
    setBudgetEstimated(undefined);
    setLeadSource(null);
    setSelectedLeadSourceId(null);
    setLeadSourceDetail('');
    setReferrerEntityId(null);
    setReferrerName('');
    setReferrerQuery('');
    setReferrerResults([]);
    setClientType('company');
    setIndividualForm({ firstName: '', lastName: '', email: '', phone: '' });
    setCoupleForm({ partnerAFirst: '', partnerALast: '', partnerAEmail: '', partnerBFirst: '', partnerBLast: '', partnerBEmail: '' });
    setCoupleDisplayName('');
    setDisplayNameMode('auto');
    setShowLimitData(null);
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

  const pillBase = 'flex-1 rounded-[var(--stage-radius-input,6px)] px-3 py-1.5 text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]';
  const pillActive = 'bg-[var(--ctx-card)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.12)] shadow-sm';
  const pillInactive = 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] border border-transparent';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto overflow-x-hidden">
          <motion.div
            className="fixed inset-0 bg-[oklch(0.06_0_0_/_0.75)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onMouseDown={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={modalContentRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-gig-title"
            className="relative z-10 my-auto w-full max-w-[640px] min-w-0 max-h-[min(90vh,48rem)]"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={STAGE_HEAVY}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
      <StagePanel surface="raised" className="flex flex-col overflow-hidden p-0 h-full rounded-[var(--stage-radius-panel,12px)] border border-[oklch(1_0_0_/_0.10)]">
        <div className="p-6 pb-4 shrink-0 min-w-0 overflow-hidden border-b border-[oklch(1_0_0/0.04)]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="create-gig-title" className="text-lg font-medium tracking-tight text-[var(--stage-text-primary)] mb-1 truncate">
                {stage === 1 ? 'Set the date' : 'New production'}
              </h2>
              <p className="text-sm text-[var(--stage-text-secondary)] break-words">
                {stage === 1
                  ? 'Availability and demand for your date.'
                  : 'Add client and details. This creates a deal in your pipeline.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-[var(--stage-radius-input,6px)] p-1.5 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.08)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              aria-label="Close"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
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
                transition={STAGE_MEDIUM}
                className="flex flex-col min-w-0" style={{ gap: 'var(--stage-gap-wide, 12px)' }}
              >
                <div ref={dateBlockRef} className="flex flex-col min-w-0" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="create-gig-proposed-date"
                        className="block stage-label mb-1.5"
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
                          'flex w-full min-w-0 items-center gap-2 rounded-[var(--stage-radius-input,6px)] border px-3 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] text-left transition-colors duration-75',
                          calendarExpanded
                            ? 'border-[var(--stage-accent)] bg-[var(--ctx-well)] ring-1 ring-[var(--stage-accent)]'
                            : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] hover:border-[oklch(1_0_0_/_0.20)]',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
                        )}
                      >
                        <Calendar size={14} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} aria-hidden />
                        <span className={cn('flex-1 min-w-0 truncate tracking-tight', eventDate ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-tertiary)]')}>
                          {eventDate ? format(parseLocalDateString(eventDate), 'PPP') : 'Select date'}
                        </span>
                        <ChevronDown
                          size={14}
                          className={cn('shrink-0 text-[var(--stage-text-tertiary)] transition-transform duration-[80ms]', calendarExpanded && 'rotate-180')}
                          aria-hidden
                        />
                      </button>
                    </div>
                    <div>
                      <label
                        htmlFor="create-gig-event-archetype"
                        className="block stage-label mb-1.5"
                      >
                        Type
                      </label>
                      <div className="relative">
                        <button
                          ref={archetypeTriggerRef}
                          id="create-gig-event-archetype"
                          type="button"
                          onClick={() => setArchetypeOpen((o) => !o)}
                          onBlur={() => setTimeout(() => setArchetypeOpen(false), 180)}
                          aria-expanded={archetypeOpen}
                          aria-haspopup="listbox"
                          className={cn(
                            'flex w-full min-w-0 items-center gap-2 rounded-[var(--stage-radius-input,6px)] border px-3 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] text-left transition-colors duration-75',
                            archetypeOpen
                              ? 'border-[var(--stage-accent)] bg-[var(--ctx-well)] ring-1 ring-[var(--stage-accent)]'
                              : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] hover:border-[oklch(1_0_0_/_0.20)]',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
                          )}
                        >
                          <span className={cn('flex-1 min-w-0 truncate tracking-tight', eventArchetype ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-tertiary)]')}>
                            {eventArchetype ? DEAL_ARCHETYPE_LABELS[eventArchetype as keyof typeof DEAL_ARCHETYPE_LABELS] : 'Select type'}
                          </span>
                          <ChevronDown
                            size={14}
                            className={cn('shrink-0 text-[var(--stage-text-tertiary)] transition-transform duration-[80ms]', archetypeOpen && 'rotate-180')}
                            aria-hidden
                          />
                        </button>
                        {archetypeOpen && createPortal(
                          <div
                            className="fixed inset-0 z-[60]"
                            onMouseDown={() => setArchetypeOpen(false)}
                          >
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -4 }}
                              transition={STAGE_LIGHT}
                              role="listbox"
                              aria-label="Show archetype"
                              data-surface="raised"
                              onMouseDown={(e) => e.stopPropagation()}
                              style={(() => {
                                const rect = archetypeTriggerRef.current?.getBoundingClientRect();
                                if (!rect) return {};
                                const spaceBelow = window.innerHeight - rect.bottom;
                                const dropUp = spaceBelow < 260;
                                return {
                                  position: 'fixed' as const,
                                  left: rect.left,
                                  width: rect.width,
                                  ...(dropUp
                                    ? { bottom: window.innerHeight - rect.top + 4 }
                                    : { top: rect.bottom + 4 }),
                                };
                              })()}
                              className="max-h-[240px] overflow-y-auto rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]"
                            >
                              {EVENT_ARCHETYPES.map((a) => (
                                <button
                                  key={a.value}
                                  type="button"
                                  role="option"
                                  aria-selected={eventArchetype === a.value}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setEventArchetype(a.value);
                                    setArchetypeOpen(false);
                                  }}
                                  className={cn(
                                    'flex w-full items-center px-3 py-2.5 text-left text-[length:var(--stage-input-font-size,13px)] tracking-tight transition-colors min-w-0',
                                    eventArchetype === a.value
                                      ? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)] font-medium'
                                      : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]'
                                  )}
                                >
                                  {a.label}
                                </button>
                              ))}
                            </motion.div>
                          </div>,
                          document.body
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Event times — show once a date is picked */}
                  <AnimatePresence>
                    {eventDate && !calendarExpanded && (
                      <motion.div
                        key="time-row"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={STAGE_LIGHT}
                        className="grid grid-cols-2 gap-4 overflow-hidden"
                      >
                        <div>
                          <label htmlFor="create-gig-start-time" className="block stage-label mb-1.5">Start time</label>
                          <TimePicker value={startTime || null} onChange={(v) => setStartTime(v ?? '')} placeholder="Start time" context="evening" />
                        </div>
                        <div>
                          <label htmlFor="create-gig-end-time" className="block stage-label mb-1.5">End time</label>
                          <TimePicker value={endTime || null} onChange={(v) => setEndTime(v ?? '')} placeholder="End time" context="evening" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {calendarExpanded && (
                      <motion.div
                        key="calendar-row"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={STAGE_NAV_CROSSFADE}
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
                      <span className="text-sm text-[var(--stage-text-secondary)]">Checking availability…</span>
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
                transition={STAGE_MEDIUM}
                className="flex flex-col min-w-0" style={{ gap: 'var(--stage-gap-wide, 12px)' }}
              >
            <div className="flex flex-col min-w-0" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
              <div>
                <label htmlFor="create-gig-title" className="block stage-label mb-1.5">
                  Title
                </label>
                <input
                  id="create-gig-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Summer Gala 2026"
                  className="stage-input w-full min-w-0"
                />
              </div>

              {/* Client section */}
              <div>
                <label className="block stage-label mb-1.5">
                  Client
                </label>

                {/* Client type toggle — only show when no existing client is selected (company mode) */}
                {(clientType !== 'company' || !selectedClient) && (
                  <ClientTypePills
                    clientType={clientType}
                    onChange={handleClientTypeChange}
                    pillBase={pillBase}
                    pillActive={pillActive}
                    pillInactive={pillInactive}
                  />
                )}

                {clientType === 'company' && (
                  <CompanyClientPicker
                    clientQuery={clientQuery}
                    setClientQuery={setClientQuery}
                    clientOpen={clientOpen}
                    setClientOpen={setClientOpen}
                    clientResults={clientResults}
                    clientLoading={clientLoading}
                    selectedClient={selectedClient}
                    setSelectedClient={setSelectedClient}
                    setClientResults={setClientResults}
                  />
                )}

                {clientType === 'individual' && (
                  <IndividualClientForm form={individualForm} setForm={setIndividualForm} />
                )}

                {clientType === 'couple' && (
                  <CoupleClientForm
                    form={coupleForm}
                    setForm={setCoupleForm}
                    displayName={coupleDisplayName}
                    setDisplayName={setCoupleDisplayName}
                    displayNameMode={displayNameMode}
                    setDisplayNameMode={setDisplayNameMode}
                  />
                )}
              </div>
            </div>

            {/* Venue Selector */}
            <div className="min-w-0">
              <label className="block stage-label mb-1.5">
                Venue
              </label>
              <input
                ref={venueTriggerRef}
                type="text"
                value={selectedVenue ? selectedVenue.name : venueQuery}
                onChange={(e) => {
                  setSelectedVenue(null);
                  setVenueQuery(e.target.value);
                }}
                onFocus={() => setVenueOpen(true)}
                onBlur={() => setTimeout(() => setVenueOpen(false), 200)}
                placeholder="Search venue or type to create…"
                className="stage-input w-full min-w-0 truncate"
              />
              {venueOpen && venueQuery.length >= 1 && venueResults.length > 0 && createPortal(
                <div
                  className="fixed inset-0 z-[60]"
                  onMouseDown={() => setVenueOpen(false)}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={STAGE_LIGHT}
                    data-surface="raised"
                    onMouseDown={(e) => e.stopPropagation()}
                    style={(() => {
                      const rect = venueTriggerRef.current?.getBoundingClientRect();
                      if (!rect) return {};
                      const spaceBelow = window.innerHeight - rect.bottom;
                      const dropUp = spaceBelow < 220;
                      return {
                        position: 'fixed' as const,
                        left: rect.left,
                        width: rect.width,
                        ...(dropUp
                          ? { bottom: window.innerHeight - rect.top + 4 }
                          : { top: rect.bottom + 4 }),
                      };
                    })()}
                    className="max-h-[180px] overflow-y-auto overflow-x-hidden rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]"
                  >
                    {venueResults.map((r, i) =>
                      r.type === 'venue' ? (
                        <button
                          key={r.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedVenue({
                              id: r.id,
                              name: r.name,
                              address: r.address ?? undefined,
                            });
                            setVenueQuery('');
                            setVenueResults([]);
                            setVenueOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[oklch(1_0_0/0.08)] min-w-0"
                        >
                          <MapPin size={16} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
                          <span className="text-[var(--stage-text-primary)] truncate min-w-0">{r.name}</span>
                          {(r.address || r.city) && (
                            <span className="text-[var(--stage-text-secondary)] text-xs truncate shrink-0 max-w-[140px]">
                              {[r.address, r.city, r.state].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </button>
                      ) : (
                        <button
                          key={`create-${i}`}
                          type="button"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedVenue({ id: '', name: r.query, address: null });
                            setVenueQuery(r.query);
                            setVenueResults([]);
                            setVenueOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.08)] min-w-0"
                        >
                          <Plus size={16} className="shrink-0" strokeWidth={1.5} />
                          <span className="truncate min-w-0">Create venue &quot;{r.query}&quot;</span>
                        </button>
                      )
                    )}
                  </motion.div>
                </div>,
                document.body
              )}
            </div>

            {/* Planner Selector */}
            <div className="min-w-0">
              <label className="block stage-label mb-1.5">
                Planner (optional)
              </label>
              {selectedPlanner ? (
                <div className="flex items-center gap-2 stage-input w-full min-w-0">
                  <User size={14} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
                  <span className="text-sm text-[var(--stage-text-primary)] truncate flex-1">
                    {selectedPlanner.name}
                    {selectedPlanner.subtitle && (
                      <span className="text-xs text-[var(--stage-text-tertiary)] ml-1.5">{selectedPlanner.subtitle}</span>
                    )}
                  </span>
                  <button type="button" onClick={() => { setSelectedPlanner(null); setPlannerQuery(''); }} className="shrink-0 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]">
                    <X size={14} strokeWidth={1.5} />
                  </button>
                </div>
              ) : (
                <>
                  <input
                    ref={plannerTriggerRef}
                    type="text"
                    value={plannerQuery}
                    onChange={(e) => setPlannerQuery(e.target.value)}
                    onFocus={() => setPlannerOpen(true)}
                    onBlur={() => setTimeout(() => setPlannerOpen(false), 200)}
                    placeholder="Search planner or coordinator…"
                    className="stage-input w-full min-w-0 truncate"
                  />
                  {plannerOpen && plannerQuery.length >= 2 && plannerResults.length > 0 && createPortal(
                    <div
                      className="fixed inset-0 z-[60]"
                      onMouseDown={() => { setPlannerResults([]); setPlannerQuery(''); }}
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={STAGE_LIGHT}
                        data-surface="raised"
                        onMouseDown={(e) => e.stopPropagation()}
                        style={(() => {
                          const rect = plannerTriggerRef.current?.getBoundingClientRect();
                          if (!rect) return {};
                          const spaceBelow = window.innerHeight - rect.bottom;
                          const dropUp = spaceBelow < 220;
                          return {
                            position: 'fixed' as const,
                            left: rect.left,
                            width: rect.width,
                            ...(dropUp
                              ? { bottom: window.innerHeight - rect.top + 4 }
                              : { top: rect.bottom + 4 }),
                          };
                        })()}
                        className="max-h-[240px] overflow-y-auto overflow-hidden rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]"
                      >
                        {(() => {
                          const teamRes = plannerResults.filter((r) => r.section === 'team');
                          const netRes = plannerResults.filter((r) => r.section === 'network');
                          return (
                            <>
                              {teamRes.length > 0 && (
                                <>
                                  <div className="px-3 pt-2 pb-1 stage-label text-[var(--stage-text-tertiary)]">Team</div>
                                  {teamRes.map((r) => (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        setSelectedPlanner({ id: r.id, name: r.name, subtitle: r.subtitle });
                                        setPlannerQuery('');
                                        setPlannerResults([]);
                                        setPlannerOpen(false);
                                      }}
                                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)] transition-colors min-w-0"
                                    >
                                      <User size={14} className="shrink-0" strokeWidth={1.5} />
                                      <span className="truncate min-w-0 flex items-baseline gap-1.5">
                                        <span>{r.name}</span>
                                        {r.subtitle && <span className="text-xs text-[var(--stage-text-tertiary)]">{r.subtitle}</span>}
                                      </span>
                                    </button>
                                  ))}
                                </>
                              )}
                              {netRes.length > 0 && (
                                <>
                                  <div className="px-3 pt-2 pb-1 stage-label text-[var(--stage-text-tertiary)]">Network</div>
                                  {netRes.map((r) => (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        setSelectedPlanner({ id: r.id, name: r.name, subtitle: r.subtitle });
                                        setPlannerQuery('');
                                        setPlannerResults([]);
                                        setPlannerOpen(false);
                                      }}
                                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)] transition-colors min-w-0"
                                    >
                                      <Building2 size={14} className="shrink-0" strokeWidth={1.5} />
                                      <span className="truncate min-w-0 flex items-baseline gap-1.5">
                                        <span>{r.name}</span>
                                        {r.subtitle && <span className="text-xs text-[var(--stage-text-tertiary)]">{r.subtitle}</span>}
                                      </span>
                                    </button>
                                  ))}
                                </>
                              )}
                            </>
                          );
                        })()}
                      </motion.div>
                    </div>,
                    document.body
                  )}
                </>
              )}
            </div>

            {/* Optional: Rough Budget + Notes */}
            <div>
              <label className="block stage-label mb-1.5">
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
                className="stage-input w-full min-w-0"
              />
            </div>
            <div>
              <label className="block stage-label mb-1.5">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes…"
                rows={2}
                className="stage-input w-full min-w-0 py-2.5 min-h-[calc(var(--stage-input-height,34px)*2)] resize-none"
              />
            </div>
            <LeadSourceSelector
              leadSources={leadSources}
              selectedLeadSourceId={selectedLeadSourceId}
              setSelectedLeadSourceId={setSelectedLeadSourceId}
              leadSource={leadSource}
              setLeadSource={setLeadSource}
              leadSourceDetail={leadSourceDetail}
              setLeadSourceDetail={setLeadSourceDetail}
              showReferrerPicker={showReferrerPicker}
              referrerEntityId={referrerEntityId}
              setReferrerEntityId={setReferrerEntityId}
              referrerName={referrerName}
              setReferrerName={setReferrerName}
              referrerQuery={referrerQuery}
              setReferrerQuery={setReferrerQuery}
              referrerResults={referrerResults}
              setReferrerResults={setReferrerResults}
              referrerSearching={referrerSearching}
              referrerCreating={referrerCreating}
              setReferrerCreating={setReferrerCreating}
            />
            </motion.div>
            )}
          </div>

          </div>

          <div className="flex flex-col gap-2 p-6 pt-4 border-t border-[oklch(1_0_0_/_0.04)] shrink-0 min-w-0 overflow-hidden">
            {!hasWorkspace && (
              <p className="text-[length:var(--stage-input-font-size,13px)] text-[var(--color-unusonic-error)] break-words">
                No workspace selected. Complete onboarding first.
              </p>
            )}
            {hasWorkspace && showLimitData && (
              <UpgradeInline
                type="show_limit"
                current={showLimitData.current}
                limit={showLimitData.limit ?? 0}
              />
            )}
            {hasWorkspace && error && !showLimitData && (
              <p className="text-[length:var(--stage-input-font-size,13px)] text-[var(--color-unusonic-error)] break-words">{error}</p>
            )}
            <div className="flex gap-2 min-w-0">
            {stage === 1 ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight text-[var(--stage-text-secondary)] transition-colors hover:bg-[oklch(1_0_0/0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
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
                    className="flex-1 stage-btn stage-btn-primary h-[var(--stage-input-height,34px)] rounded-[var(--stage-radius-input,6px)] disabled:opacity-45 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] flex items-center justify-center gap-2"
                  >
                    Next <ChevronRight size={14} strokeWidth={1.5} />
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
                  className="flex-1 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight text-[var(--stage-text-secondary)] transition-colors hover:bg-[oklch(1_0_0/0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={!hasWorkspace || isPending || !!showLimitData}
                  className="flex-1 stage-btn stage-btn-primary h-[var(--stage-input-height,34px)] rounded-[var(--stage-radius-input,6px)] disabled:opacity-45 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] flex items-center justify-center gap-2"
                >
                  {isPending ? 'Creating...' : 'Create deal'}
                </button>
              </>
            )}
            </div>
          </div>
        </form>
      </StagePanel>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
