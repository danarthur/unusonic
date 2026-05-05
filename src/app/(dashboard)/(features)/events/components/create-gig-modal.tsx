'use client';

import { useState, useTransition, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { StagePanel } from '@/shared/ui/stage-panel';
import { ChevronRight, X } from 'lucide-react';
import { createDeal } from '../actions/deal-actions';
import type { CreateDealInput, CreateDealResult, HostKind } from '../actions/deal-model';
import { UpgradeInline } from '@/shared/ui/upgrade-prompt';
import { toast } from 'sonner';
import { getWorkspaceLeadSources, type WorkspaceLeadSource } from '@/features/lead-sources';
import { checkDateFeasibility, type CheckDateFeasibilityResult } from '../actions/check-date-feasibility';
import { searchOmni, getVenueSuggestions, type OmniResult, type VenueSuggestion } from '../actions/lookup';
import { searchReferrerEntities, type ReferrerSearchResult } from '../actions/search-referrer';
import { STAGE_HEAVY, STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { useModalLayer } from '@/shared/lib/use-modal-layer';
import type { OptimisticUpdate } from './crm-production-queue';
import { DEAL_ARCHETYPE_LABELS } from '../actions/deal-model';
import { FeasibilityChip } from './create-gig-modal/feasibility-chip';
import { LeadSourceSelector } from './create-gig-modal/lead-source-selector';
import {
  Q1HostKindPills,
  IndividualHostForm,
  CoupleHostForm,
  CompanyHostPicker,
  EMPTY_PERSON,
  type PersonHostFormState,
  type CompanyClientSelection,
} from './create-gig-modal/host-cast-forms';
import { CastSummary } from './create-gig-modal/cast-summary';
import { humanizeSlug } from '@/shared/lib/event-archetype';
import { DateStage, type DateKind } from './create-gig-modal/date-stage';
import { PocSelector, type PocChoice, type PocOption } from './create-gig-modal/poc-selector';
import { PlannerPicker } from './create-gig-modal/planner-picker';
import { VenuePicker } from './create-gig-modal/venue-picker';
import { AdditionalDetails } from './create-gig-modal/additional-details';
import type { SeriesRule, SeriesArchetype } from '@/shared/lib/series-rule';

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
  const [dateKind, setDateKind] = useState<DateKind>('single');
  const [proposedEndDate, setProposedEndDate] = useState('');
  const [seriesRule, setSeriesRule] = useState<SeriesRule | null>(null);
  const [seriesArchetype, setSeriesArchetype] = useState<SeriesArchetype | null>(null);
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [budgetEstimated, setBudgetEstimated] = useState<number | undefined>(undefined);
  const [leadSource, setLeadSource] = useState<'referral' | 'repeat_client' | 'website' | 'social' | 'direct' | null>(null);
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

  // ── Q1: who is the show for? ──────────────────────────────────────────────
  const [hostKind, setHostKind] = useState<HostKind>('individual');

  // Individual host
  const [individualForm, setIndividualForm] = useState<PersonHostFormState>(EMPTY_PERSON);

  // Couple host (two partners)
  const [partnerA, setPartnerA] = useState<PersonHostFormState>(EMPTY_PERSON);
  const [partnerB, setPartnerB] = useState<PersonHostFormState>(EMPTY_PERSON);
  const [pairing, setPairing] = useState<'romantic' | 'co_host' | 'family'>('romantic');

  // Company host (existing OmniSearch)
  const [companyClient, setCompanyClient] = useState<CompanyClientSelection | null>(null);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyQuery, setCompanyQuery] = useState('');
  const [companyResults, setCompanyResults] = useState<OmniResult[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);

  // ── Q2: who is the day-of point of contact? ───────────────────────────────
  // Default for couples = first host, individual = the one host, company = no
  // POC needed at this stage (booking contact == POC).
  const [pocChoice, setPocChoice] = useState<PocChoice>(null);
  const [pocSeparateForm, setPocSeparateForm] = useState<PersonHostFormState>(EMPTY_PERSON);

  // ── Planner ───────────────────────────────────────────────────────────────
  // Always-visible search input. selectedPlanner with a real id = existing
  // network entity; selectedPlanner with id === '' = typed-to-create ghost
  // (the typed display name is the source of truth, parsed into first/last
  // at submit time).
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerQuery, setPlannerQuery] = useState('');
  const [plannerResults, setPlannerResults] = useState<ReferrerSearchResult[]>([]);
  const [plannerSearching, setPlannerSearching] = useState(false);
  const [selectedPlanner, setSelectedPlanner] = useState<{ id: string; name: string; subtitle?: string | null } | null>(null);

  // ── Venue ─────────────────────────────────────────────────────────────────
  const [venueOpen, setVenueOpen] = useState(false);
  const [venueQuery, setVenueQuery] = useState('');
  const [venueResults, setVenueResults] = useState<VenueSuggestion[]>([]);
  const [, setVenueLoading] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<{ id: string; name: string; address?: string | null } | null>(null);

  const dateBlockRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  useModalLayer({ open, onClose, containerRef: modalContentRef });

  useEffect(() => {
    if (open) { setError(null); setShowLimitData(null); }
  }, [open]);

  const goToStage = (next: 1 | 2) => {
    setError(null);
    setShowLimitData(null);
    setStage(next);
  };

  // Reset POC choice when host kind changes — defaults below.
  useEffect(() => {
    if (hostKind === 'individual') {
      setPocChoice({ kind: 'host', hostIndex: 1 });
    } else if (hostKind === 'couple') {
      setPocChoice({ kind: 'host', hostIndex: 1 });
    } else {
      // company / venue_concert: the company-flow main contact IS the POC
      setPocChoice(null);
    }
    setPocSeparateForm(EMPTY_PERSON);
  }, [hostKind]);

  const orgId = companyClient?.type === 'org' ? companyClient.id : companyClient?.organizationId ?? null;

  const runClientSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setCompanyResults([]);
      return;
    }
    setCompanyLoading(true);
    try {
      const res = await searchOmni(q);
      setCompanyResults(res);
    } catch {
      setCompanyResults([]);
    } finally {
      setCompanyLoading(false);
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
    if (companyQuery.length < 2) {
      setCompanyResults([]);
      return;
    }
    const t = setTimeout(() => runClientSearch(companyQuery), 150);
    return () => clearTimeout(t);
  }, [companyQuery, runClientSearch]);

  useEffect(() => {
    if (venueQuery.length < 1) {
      setVenueResults([]);
      return;
    }
    const t = setTimeout(() => runVenueSearch(venueQuery), 150);
    return () => clearTimeout(t);
  }, [venueQuery, orgId, runVenueSearch]);

  // Planner search debounce — searches full network
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

  // Feasibility check — single-day only; multi-day and series each get their
  // own per-date feasibility rendering inside DateStage. Runs as soon as a
  // valid date is entered (no archetype gate) so the chip surfaces conflicts
  // at the typing moment per the date-availability-badge-design doc.
  useEffect(() => {
    if (dateKind !== 'single' || !eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      setFeasibility(null);
      return;
    }
    let cancelled = false;
    setFeasibilityLoading(true);
    const handle = setTimeout(() => {
      checkDateFeasibility(eventDate)
        .then((res) => { if (!cancelled) setFeasibility(res); })
        .finally(() => { if (!cancelled) setFeasibilityLoading(false); });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [eventDate, dateKind]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getWorkspaceLeadSources().then((sources) => {
      if (!cancelled) setLeadSources(sources);
    });
    return () => { cancelled = true; };
  }, [open]);

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

  // (Referrer field is always visible in the LeadSourceSelector — every
  // inquiry can have someone who put the client in touch, regardless of the
  // lead source's category.)

  // ── Derived display labels ────────────────────────────────────────────────
  const coupleAutoDisplayName = useMemo(() => {
    if (hostKind !== 'couple') return '';
    const aF = partnerA.firstName.trim();
    const aL = partnerA.lastName.trim();
    const bF = partnerB.firstName.trim();
    const bL = partnerB.lastName.trim();
    if (!aF && !bF) return '';
    const sameLast = aL && bL && aL.toLowerCase() === bL.toLowerCase();
    if (sameLast) return `${aF} & ${bF} ${aL}`.trim();
    const a = [aF, aL].filter(Boolean).join(' ');
    const b = [bF, bL].filter(Boolean).join(' ');
    return [a, b].filter(Boolean).join(' & ');
  }, [hostKind, partnerA, partnerB]);

  const optimisticClientName = (() => {
    if (hostKind === 'individual') return [individualForm.firstName, individualForm.lastName].filter(Boolean).join(' ');
    if (hostKind === 'couple') return coupleAutoDisplayName;
    return companyClient?.name ?? '';
  })();

  // ── Smart title placeholder ───────────────────────────────────────────────
  // When archetype + host names are both populated, suggest a sensible title
  // ("Marlow Wedding", "Acme Corp Product Launch", etc.) the user can accept
  // by leaving the field blank, or override by typing.
  const titlePlaceholder = useMemo(() => {
    // Custom workspace archetypes aren't in DEAL_ARCHETYPE_LABELS. Fall back to
    // a humanized slug ("cigar_tasting" → "Cigar Tasting") so the title
    // suggestion stays readable for owner-defined types.
    const archetypeLabel = eventArchetype
      ? (DEAL_ARCHETYPE_LABELS[eventArchetype as keyof typeof DEAL_ARCHETYPE_LABELS] ?? humanizeSlug(eventArchetype))
      : '';
    let lastName = '';
    if (hostKind === 'individual') {
      lastName = individualForm.lastName.trim();
    } else if (hostKind === 'couple') {
      lastName = partnerA.lastName.trim() || partnerB.lastName.trim();
    } else if (companyClient?.name) {
      lastName = companyClient.name.trim();
    }
    if (lastName && archetypeLabel) return `${lastName} ${archetypeLabel}`;
    if (lastName) return lastName;
    return 'e.g. Summer Gala 2026';
  }, [eventArchetype, hostKind, individualForm.lastName, partnerA.lastName, partnerB.lastName, companyClient?.name]);

  // ── Additional details disclosure ─────────────────────────────────────────
  const [additionalExpanded, setAdditionalExpanded] = useState(false);

  // ── Q2 progressive disclosure ─────────────────────────────────────────────
  // Don't ask "who is the POC" until the user has at least named a host.
  // Reduces visual noise for empty stage 2; the question appears as soon as
  // it has anything to refer to.
  const hostHasName = (() => {
    if (hostKind === 'individual') {
      return Boolean(individualForm.firstName.trim() || individualForm.lastName.trim());
    }
    if (hostKind === 'couple') {
      const a = partnerA.firstName.trim() || partnerA.lastName.trim();
      const b = partnerB.firstName.trim() || partnerB.lastName.trim();
      return Boolean(a || b);
    }
    return Boolean(companyClient?.name);
  })();

  const locationStr = selectedVenue
    ? [selectedVenue.name, selectedVenue.address].filter(Boolean).join(', ')
    : venueQuery || '';

  // Whether a planner / venue is set anywhere on the form — used to surface
  // them as POC options without re-typing.
  const plannerLabel = selectedPlanner?.name || null;
  const venueLabel = selectedVenue?.name || (venueQuery.trim() || null);

  // Helper: split a free-text "First Last" planner name into first/last.
  const splitPlannerName = (raw: string): { firstName?: string; lastName?: string } => {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0] };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  };

  // POC options for the dropdown — grouped by role for the list, flat for lookup.
  const pocOptions: PocOption[] = (() => {
    const opts: PocOption[] = [];
    if (hostKind === 'couple') {
      const aLabel = [partnerA.firstName, partnerA.lastName].filter(Boolean).join(' ').trim() || 'Partner A';
      const bLabel = [partnerB.firstName, partnerB.lastName].filter(Boolean).join(' ').trim() || 'Partner B';
      opts.push({ key: 'host-1', label: aLabel, role: 'Host', choice: { kind: 'host', hostIndex: 1 } });
      opts.push({ key: 'host-2', label: bLabel, role: 'Host', choice: { kind: 'host', hostIndex: 2 } });
    } else if (hostKind === 'individual') {
      const oneLabel = [individualForm.firstName, individualForm.lastName].filter(Boolean).join(' ').trim() || 'The host';
      opts.push({ key: 'host-1', label: oneLabel, role: 'Host', choice: { kind: 'host', hostIndex: 1 } });
    }
    if (plannerLabel) {
      opts.push({ key: 'planner', label: plannerLabel, role: 'Planner', choice: { kind: 'planner' } });
    }
    if (venueLabel) {
      opts.push({ key: 'venue', label: venueLabel, role: 'Venue', choice: { kind: 'venue' } });
    }
    opts.push({ key: 'separate', label: 'Someone else', role: 'Other', choice: { kind: 'separate' } });
    return opts;
  })();

  // Currently selected option (for the trigger label)
  const selectedPocOption = pocOptions.find((opt) => {
    if (!pocChoice || !opt.choice) return false;
    if (pocChoice.kind !== opt.choice.kind) return false;
    if (pocChoice.kind === 'host' && opt.choice.kind === 'host') {
      return pocChoice.hostIndex === opt.choice.hostIndex;
    }
    return true;
  });

  // If the POC was set to planner/venue and that entity gets removed, reset
  // POC back to the primary host.
  useEffect(() => {
    if (pocChoice?.kind === 'planner' && !plannerLabel) {
      setPocChoice({ kind: 'host', hostIndex: 1 });
    }
    if (pocChoice?.kind === 'venue' && !venueLabel) {
      setPocChoice({ kind: 'host', hostIndex: 1 });
    }
  }, [pocChoice, plannerLabel, venueLabel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!hasWorkspace) {
      setError('No workspace selected. Complete onboarding first.');
      return;
    }

    // Resolve the proposed date per tab: single/multi_day use `eventDate`; series
    // uses the rule's primary_date (first active show). The RPC mirrors this
    // resolution server-side, but we still need a date for the optimistic card.
    const effectiveProposedDate =
      dateKind === 'series' ? (seriesRule?.primary_date ?? '') : eventDate;

    if (!effectiveProposedDate || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveProposedDate)) {
      setError(
        dateKind === 'series'
          ? 'Add at least one show to the series.'
          : 'Select a proposed date.'
      );
      return;
    }
    if (dateKind === 'multi_day' && (!proposedEndDate || proposedEndDate < eventDate)) {
      setError('Pick an end date on or after the start date.');
      return;
    }

    // If the user left Title blank but the placeholder suggests something
    // sensible (host name + archetype), accept the suggestion.
    const resolvedTitle = title.trim()
      || (titlePlaceholder !== 'e.g. Summer Gala 2026' ? titlePlaceholder : '');

    const tempId = crypto.randomUUID();
    const optimisticGig = {
      id: tempId,
      title: resolvedTitle || null,
      status: 'inquiry' as const,
      event_date: effectiveProposedDate,
      location: locationStr.trim() || null,
      client_name: optimisticClientName.trim() || null,
    };

    startTransition(async () => {
      addOptimisticGig({ type: 'add', gig: optimisticGig });

      // Build the input for the new RPC contract.
      const dealInput: CreateDealInput = {
        proposedDate: effectiveProposedDate,
        proposedEndDate: dateKind === 'multi_day' ? proposedEndDate : null,
        dateKind,
        seriesRule: dateKind === 'series' ? seriesRule : null,
        seriesArchetype: dateKind === 'series' ? seriesArchetype : null,
        eventArchetype: (eventArchetype ?? undefined) as CreateDealInput['eventArchetype'],
        title: resolvedTitle || undefined,
        hostKind,
        pairing,
        coupleDisplayName: hostKind === 'couple' ? (coupleAutoDisplayName || undefined) : undefined,
        status: 'inquiry',
        budgetEstimated: budgetEstimated ?? undefined,
        notes: notes?.trim() || undefined,
        venueId: (selectedVenue?.id && selectedVenue.id.length > 0) ? selectedVenue.id : undefined,
        venueName: (!selectedVenue?.id && selectedVenue?.name) ? selectedVenue.name : undefined,
        leadSource: leadSource ?? undefined,
        leadSourceId: selectedLeadSourceId ?? undefined,
        leadSourceDetail: leadSourceDetail.trim() || undefined,
        referrerEntityId: referrerEntityId ?? undefined,
        eventStartTime: startTime || undefined,
        eventEndTime: endTime || undefined,
      };

      if (hostKind === 'individual') {
        dealInput.personHosts = [{
          firstName: individualForm.firstName.trim() || undefined,
          lastName: individualForm.lastName.trim() || undefined,
          email: individualForm.email.trim() || null,
          phone: individualForm.phone.trim() || null,
        }];
      } else if (hostKind === 'couple') {
        dealInput.personHosts = [
          {
            firstName: partnerA.firstName.trim() || undefined,
            lastName: partnerA.lastName.trim() || undefined,
            email: partnerA.email.trim() || null,
            phone: partnerA.phone.trim() || null,
          },
          {
            firstName: partnerB.firstName.trim() || undefined,
            lastName: partnerB.lastName.trim() || undefined,
            email: partnerB.email.trim() || null,
            phone: partnerB.phone.trim() || null,
          },
        ];
      } else {
        // company / venue_concert
        dealInput.companyHost = {
          existingId: companyClient?.id && companyClient.id.length > 0 && companyClient.type === 'org'
            ? companyClient.id
            : undefined,
          name: !companyClient?.id && companyClient?.name ? companyClient.name : undefined,
          mainContactId: companyClient?.type === 'contact' ? companyClient.id : null,
        };
      }

      // POC payload — routes by chosen kind
      if (pocChoice?.kind === 'host') {
        dealInput.pocFromHostIndex = pocChoice.hostIndex;
      } else if (pocChoice?.kind === 'planner') {
        // Reuse the planner entity. existingId reuses by uuid; otherwise the
        // typed name becomes a fresh ghost (split into first/last).
        if (selectedPlanner?.id) {
          dealInput.poc = { existingId: selectedPlanner.id };
        } else if (selectedPlanner?.name) {
          dealInput.poc = splitPlannerName(selectedPlanner.name);
        }
      } else if (pocChoice?.kind === 'venue') {
        if (selectedVenue?.id) {
          dealInput.poc = { existingId: selectedVenue.id };
        }
        // No "create new" path here — venues are picked from search; if the
        // user typed a venue name without picking one, the RPC will create
        // the venue entity and we'd need a separate person at the venue,
        // which P0 doesn't capture in this modal.
      } else if (pocChoice?.kind === 'separate') {
        const f = pocSeparateForm.firstName.trim();
        const l = pocSeparateForm.lastName.trim();
        if (f || l) {
          dealInput.poc = {
            firstName: f || undefined,
            lastName: l || undefined,
            email: pocSeparateForm.email.trim() || null,
            phone: pocSeparateForm.phone.trim() || null,
          };
        }
      }

      // Planner payload — derived from selectedPlanner only
      if (selectedPlanner?.id) {
        dealInput.planner = { existingId: selectedPlanner.id };
      } else if (selectedPlanner?.name) {
        dealInput.planner = splitPlannerName(selectedPlanner.name);
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

  function resetForm() {
    setStage(1);
    setEventDate('');
    setProposedEndDate('');
    setDateKind('single');
    setSeriesRule(null);
    setSeriesArchetype(null);
    setEventArchetype(null);
    setFeasibility(null);
    setTitle('');
    setStartTime('');
    setEndTime('');
    setHostKind('individual');
    setIndividualForm(EMPTY_PERSON);
    setPartnerA(EMPTY_PERSON);
    setPartnerB(EMPTY_PERSON);
    setPairing('romantic');
    setCompanyClient(null);
    setCompanyQuery('');
    setCompanyResults([]);
    setPocChoice({ kind: 'host', hostIndex: 1 });
    setPocSeparateForm(EMPTY_PERSON);
    setSelectedPlanner(null);
    setPlannerQuery('');
    setPlannerResults([]);
    setSelectedVenue(null);
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
    setShowLimitData(null);
  }

  const pillBase = 'flex items-center rounded-[var(--stage-radius-input,6px)] px-3 py-1.5 text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]';
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
                      {stage === 1
                        ? 'Set the date'
                        : `New ${
                            eventArchetype
                              ? (DEAL_ARCHETYPE_LABELS[eventArchetype as keyof typeof DEAL_ARCHETYPE_LABELS] ?? humanizeSlug(eventArchetype)).toLowerCase()
                              : 'production'
                          }`}
                    </h2>
                    <p className="text-sm text-[var(--stage-text-secondary)] break-words">
                      {stage === 1
                        ? 'Availability and demand for your date.'
                        : 'Add the cast and details below.'}
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
                    {stage === 1 && (
                      <div ref={dateBlockRef}>
                        <DateStage
                          dateKind={dateKind}
                          setDateKind={setDateKind}
                          eventDate={eventDate}
                          setEventDate={setEventDate}
                          proposedEndDate={proposedEndDate}
                          setProposedEndDate={setProposedEndDate}
                          seriesRule={seriesRule}
                          setSeriesRule={setSeriesRule}
                          seriesArchetype={seriesArchetype}
                          setSeriesArchetype={setSeriesArchetype}
                          eventArchetype={eventArchetype}
                          setEventArchetype={setEventArchetype}
                          startTime={startTime}
                          setStartTime={setStartTime}
                          endTime={endTime}
                          setEndTime={setEndTime}
                        />
                        {dateKind === 'single' && eventDate && (
                          <div className="flex items-center gap-2 min-w-0 mt-3">
                            <FeasibilityChip
                              date={eventDate}
                              feasibility={feasibility}
                              loading={feasibilityLoading}
                              archetypeSlug={eventArchetype}
                            />
                          </div>
                        )}
                      </div>
                    )}

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
                          {/* Live cast preview — builds as the user fills in the form below */}
                          <CastSummary
                            hostKind={hostKind}
                            individualForm={individualForm}
                            partnerA={partnerA}
                            partnerB={partnerB}
                            pairing={pairing}
                            companyClient={companyClient}
                            pocChoice={pocChoice}
                            pocSeparateForm={pocSeparateForm}
                            plannerSelected={selectedPlanner}
                            selectedVenue={selectedVenue}
                            venueQuery={venueQuery}
                            budgetEstimated={budgetEstimated}
                          />

                          <div>
                            <label htmlFor="create-gig-title" className="block stage-label mb-1.5">Title</label>
                            <input
                              id="create-gig-title"
                              type="text"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder={titlePlaceholder}
                              className="stage-input w-full min-w-0"
                            />
                          </div>

                          {/* Q1 — Who is this show for? */}
                          <div>
                            <label className="block stage-label mb-1.5">Who is this show for?</label>
                            <Q1HostKindPills
                              hostKind={hostKind}
                              onChange={setHostKind}
                              pillBase={pillBase}
                              pillActive={pillActive}
                              pillInactive={pillInactive}
                            />
                            <div className="mt-3">
                              {hostKind === 'individual' && (
                                <IndividualHostForm form={individualForm} setForm={setIndividualForm} />
                              )}
                              {hostKind === 'couple' && (
                                <CoupleHostForm
                                  partnerA={partnerA}
                                  setPartnerA={setPartnerA}
                                  partnerB={partnerB}
                                  setPartnerB={setPartnerB}
                                  pairing={pairing}
                                  setPairing={setPairing}
                                />
                              )}
                              {(hostKind === 'company' || hostKind === 'venue_concert') && (
                                <CompanyHostPicker
                                  query={companyQuery}
                                  setQuery={setCompanyQuery}
                                  open={companyOpen}
                                  setOpen={setCompanyOpen}
                                  results={companyResults}
                                  loading={companyLoading}
                                  selected={companyClient}
                                  setSelected={setCompanyClient}
                                  setResults={setCompanyResults}
                                  performerVariant={hostKind === 'venue_concert'}
                                />
                              )}
                            </div>
                          </div>

                          {/* Q2 — Who is the day-of point of contact? Only after a host has a name. */}
                          <AnimatePresence initial={false}>
                          {(hostKind === 'individual' || hostKind === 'couple') && hostHasName && (
                            <motion.div
                              key="q2"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={STAGE_LIGHT}
                              className="overflow-hidden"
                            >
                              <PocSelector
                                pocChoice={pocChoice}
                                setPocChoice={setPocChoice}
                                pocOptions={pocOptions}
                                selectedPocOption={selectedPocOption}
                                pocSeparateForm={pocSeparateForm}
                                setPocSeparateForm={setPocSeparateForm}
                              />
                            </motion.div>
                          )}
                          </AnimatePresence>

                          {/* Planner — always visible, mirrors the Venue field's pattern */}
                          {(hostKind === 'individual' || hostKind === 'couple') && (
                            <PlannerPicker
                              selectedPlanner={selectedPlanner}
                              setSelectedPlanner={setSelectedPlanner}
                              plannerQuery={plannerQuery}
                              setPlannerQuery={setPlannerQuery}
                              plannerOpen={plannerOpen}
                              setPlannerOpen={setPlannerOpen}
                              plannerResults={plannerResults}
                              setPlannerResults={setPlannerResults}
                              plannerSearching={plannerSearching}
                            />
                          )}
                        </div>

                        {/* Venue */}
                        <VenuePicker
                          selectedVenue={selectedVenue}
                          setSelectedVenue={setSelectedVenue}
                          venueQuery={venueQuery}
                          setVenueQuery={setVenueQuery}
                          venueOpen={venueOpen}
                          setVenueOpen={setVenueOpen}
                          venueResults={venueResults}
                          setVenueResults={setVenueResults}
                        />

                        {/* Additional details — collapsed by default */}
                        <AdditionalDetails
                          expanded={additionalExpanded}
                          setExpanded={setAdditionalExpanded}
                          budgetEstimatedDisplay={budgetEstimatedDisplay}
                          setBudgetEstimated={setBudgetEstimated}
                          notes={notes}
                          setNotes={setNotes}
                          leadSourceSelector={
                            <LeadSourceSelector
                              leadSources={leadSources}
                              selectedLeadSourceId={selectedLeadSourceId}
                              setSelectedLeadSourceId={setSelectedLeadSourceId}
                              leadSource={leadSource}
                              setLeadSource={setLeadSource}
                              leadSourceDetail={leadSourceDetail}
                              setLeadSourceDetail={setLeadSourceDetail}
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
                          }
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
                          disabled={
                            !hasWorkspace
                            || !eventArchetype
                            || feasibilityLoading
                            || (dateKind === 'single' && !eventDate)
                            || (dateKind === 'multi_day' && (!eventDate || !proposedEndDate || proposedEndDate < eventDate))
                            || (dateKind === 'series' && (!seriesRule || seriesRule.rdates.length === seriesRule.exdates.length))
                          }
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

export { CreateGigModal as default };
