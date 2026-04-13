'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Plus, MapPin, Building2, User } from 'lucide-react';
import { Command } from 'cmdk';
import { handoverDeal, type HandoverPayload, type HandoverVitals } from '../actions/handover-deal';
import { getVenueSuggestions, searchOmni, getEntityDisplayName, createGhostVenueEntity, type VenueSuggestion, type OmniResult } from '../actions/lookup';
import { STAGE_HEAVY, STAGE_NAV_CROSSFADE } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { DealDetail } from '../actions/get-deal';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';

const STEPS = ['Vitals', 'Gear & inventory'] as const;

type HandoffWizardProps = {
  dealId: string;
  deal: DealDetail;
  stakeholders: DealStakeholderDisplay[];
  onSuccess: (eventId: string) => void;
  onDismiss: () => void;
};

function fromLocalDatetime(local: string): string {
  return new Date(local).toISOString();
}

export function HandoffWizard({ dealId, deal, stakeholders, onSuccess, onDismiss }: HandoffWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proposedDate = deal.proposed_date ?? new Date().toISOString().slice(0, 10);
  const defaultStart = `${proposedDate}T08:00`;
  const defaultEnd = `${proposedDate}T18:00`;

  const [startAt, setStartAt] = useState(defaultStart);
  const [endAt, setEndAt] = useState(defaultEnd);
  const [venueEntityId, setVenueEntityId] = useState(deal.venue_id ?? '');
  const [clientEntityId, setClientEntityId] = useState('');
  const [gearRequirements, setGearRequirements] = useState('');
  const [venueRestrictions, setVenueRestrictions] = useState(deal.notes ?? '');

  // Venue search state
  const [venueQuery, setVenueQuery] = useState('');
  const [venueResults, setVenueResults] = useState<VenueSuggestion[]>([]);
  const [venueLoading, setVenueLoading] = useState(false);
  const [venueCreating, setVenueCreating] = useState(false);
  const [venueOpen, setVenueOpen] = useState(false);
  const [selectedVenueName, setSelectedVenueName] = useState('');

  // Client search state
  const [clientOpen, setClientOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<OmniResult[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [selectedClientName, setSelectedClientName] = useState('');

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const billTo = stakeholders.find((s) => s.role === 'bill_to');

  // Pre-populate client from bill_to stakeholder on mount.
  // deal_stakeholders uses a dual-node pattern (20260227100000_deal_stakeholders_dual_node):
  //   - Individual/couple clients: organization_id holds the person entity, entity_id is null
  //   - Company clients: organization_id is the company, entity_id is the billing-contact person
  // The client portal filters ops.events.client_entity_id by the signed-in person, so in both
  // cases we want the person entity — prefer entity_id (company case) and fall back to
  // organization_id (individual case).
  useEffect(() => {
    if (billTo && !clientEntityId) {
      const name = billTo.organization_name ?? billTo.name ?? '';
      if (name) setSelectedClientName(name);
      const entityId = billTo.entity_id ?? billTo.organization_id ?? '';
      if (entityId) setClientEntityId(entityId);
    }
  }, [billTo, clientEntityId]);

  // Resolve venue display name when deal already has a venue_id pre-populated
  useEffect(() => {
    if (venueEntityId && !selectedVenueName) {
      getEntityDisplayName(venueEntityId).then((name) => {
        if (name) setSelectedVenueName(name);
      });
    }
  }, [venueEntityId, selectedVenueName]);

  // Venue search effect
  useEffect(() => {
    if (venueQuery.length < 1) {
      setVenueResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setVenueLoading(true);
      try {
        const res = await getVenueSuggestions(venueQuery);
        setVenueResults(res);
      } catch {
        setVenueResults([]);
      } finally {
        setVenueLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [venueQuery]);

  // Client search effect
  useEffect(() => {
    if (clientQuery.length < 2) {
      setClientResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setClientLoading(true);
      try {
        const res = await searchOmni(clientQuery);
        setClientResults(res);
      } catch {
        setClientResults([]);
      } finally {
        setClientLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [clientQuery]);

  const buildPayload = useCallback((): HandoverPayload => {
    const vitals: HandoverVitals = {
      start_at: fromLocalDatetime(startAt),
      end_at: fromLocalDatetime(endAt),
      venue_entity_id: venueEntityId.trim() || null,
      client_entity_id: clientEntityId.trim() || null,
    };
    const run_of_show_data = {
      gear_requirements: gearRequirements.trim() || null,
      venue_restrictions: venueRestrictions.trim() || null,
    };
    const hasData =
      !!run_of_show_data.gear_requirements || !!run_of_show_data.venue_restrictions;
    return {
      name: deal.title ?? undefined,
      vitals,
      run_of_show_data: hasData ? run_of_show_data : null,
    };
  }, [startAt, endAt, venueEntityId, clientEntityId, gearRequirements, venueRestrictions, deal.title]);

  const handleNext = useCallback(() => {
    setError(null);
    if (isLast) {
      setSubmitting(true);
      setError(null);
      const payload = buildPayload();
      handoverDeal(dealId, payload)
        .then((result) => {
          if (result.success) {
            onSuccess(result.eventId);
            onDismiss();
          } else {
            setError(result.error);
            setSubmitting(false);
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Handover failed');
          setSubmitting(false);
        });
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [isLast, buildPayload, dealId, onSuccess, onDismiss]);

  const handleBack = useCallback(() => {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={STAGE_HEAVY}
      className="fixed inset-y-0 right-0 z-50 w-full max-w-lg flex flex-col border-l border-[oklch(1_0_0_/_0.10)] shadow-2xl"
      data-surface="raised"
      style={{ background: 'var(--stage-surface-raised)' }}
      aria-modal="true"
      aria-labelledby="handoff-wizard-title"
    >
      <div className="shrink-0 flex items-center justify-between p-4 border-b border-[oklch(1_0_0_/_0.10)]">
        <h2 id="handoff-wizard-title" className="text-[var(--stage-text-primary)] font-medium tracking-tight">
          Hand over to production
        </h2>
        <button
          type="button"
          onClick={onDismiss}
          className="p-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          aria-label="Close"
        >
          <X size={20} strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      <div className="shrink-0 px-4 pt-3 pb-2 flex gap-2">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={cn(
              'stage-label',
              i === stepIndex ? 'text-[var(--stage-text-primary)]' : i < stepIndex ? '' : 'text-[var(--stage-text-tertiary)]'
            )}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          {step === 'Vitals' && (
            <motion.div
              key="vitals"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={STAGE_NAV_CROSSFADE}
              className="flex flex-col gap-5"
            >
              <div className="stage-panel-elevated rounded-[var(--stage-radius-panel)] p-5 border border-[oklch(1_0_0_/_0.10)] space-y-4">
                <p className="stage-label">Date & time</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="handoff-start" className="block stage-field-label mb-1.5">Start</label>
                    <input
                      id="handoff-start"
                      type="datetime-local"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      className="w-full rounded-xl bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.10)] px-3 py-2 text-[var(--stage-text-primary)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="handoff-end" className="block stage-field-label mb-1.5">End</label>
                    <input
                      id="handoff-end"
                      type="datetime-local"
                      value={endAt}
                      onChange={(e) => setEndAt(e.target.value)}
                      className="w-full rounded-xl bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.10)] px-3 py-2 text-[var(--stage-text-primary)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    />
                  </div>
                </div>
              </div>
              <div className="stage-panel-elevated rounded-[var(--stage-radius-panel)] p-5 border border-[oklch(1_0_0_/_0.10)] space-y-4">
                <p className="stage-label">Venue & client</p>

                {/* Venue search */}
                <div>
                  <label htmlFor="handoff-venue" className="block stage-field-label mb-1.5">Venue</label>
                  <div className="relative">
                    <input
                      id="handoff-venue"
                      type="text"
                      placeholder="Search venue…"
                      value={selectedVenueName || venueQuery}
                      onChange={(e) => {
                        setSelectedVenueName('');
                        setVenueEntityId('');
                        setVenueQuery(e.target.value);
                      }}
                      onFocus={() => setVenueOpen(true)}
                      onBlur={() => setTimeout(() => setVenueOpen(false), 200)}
                      className="w-full rounded-md bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.10)] px-3 py-2 text-[var(--stage-text-primary)] text-sm placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    />
                    {venueOpen && venueQuery.length >= 1 && venueResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[180px] overflow-y-auto rounded-xl border border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-void)]/95 shadow-xl">
                        {venueResults.map((r, i) =>
                          r.type === 'venue' ? (
                            <button
                              key={r.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setSelectedVenueName(r.name);
                                setVenueEntityId(r.id);
                                setVenueQuery('');
                                setVenueResults([]);
                                setVenueOpen(false);
                              }}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-[oklch(1_0_0_/_0.05)]"
                            >
                              <MapPin size={16} className="shrink-0 text-[var(--stage-text-secondary)]/60" strokeWidth={1.5} aria-hidden />
                              <span className="text-[var(--stage-text-primary)] truncate">{r.name}</span>
                              {(r.address || r.city) && (
                                <span className="text-[var(--stage-text-secondary)]/50 text-xs truncate shrink-0 max-w-[140px]">
                                  {[r.address, r.city, r.state].filter(Boolean).join(', ')}
                                </span>
                              )}
                            </button>
                          ) : (
                            <button
                              key={`create-${i}`}
                              type="button"
                              disabled={venueCreating}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={async () => {
                                setVenueCreating(true);
                                setVenueOpen(false);
                                const id = await createGhostVenueEntity(r.query);
                                setVenueCreating(false);
                                if (id) {
                                  setSelectedVenueName(r.query);
                                  setVenueEntityId(id);
                                  setVenueQuery('');
                                  setVenueResults([]);
                                }
                              }}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] disabled:opacity-45"
                            >
                              <Plus size={16} className="shrink-0" strokeWidth={1.5} aria-hidden />
                              <span className="truncate">{venueCreating ? 'Creating…' : `Create "${r.query}"`}</span>
                            </button>
                          )
                        )}
                      </div>
                    )}
                    {(venueLoading || venueCreating) && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--stage-text-secondary)]/50">…</span>
                    )}
                  </div>
                </div>

                {/* Client search */}
                <div>
                  <label className="block stage-field-label mb-1.5">
                    Client {billTo ? `— Bill-To: ${billTo.organization_name ?? billTo.name}` : ''}
                  </label>
                  <Command
                    className="rounded-xl border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] overflow-hidden"
                    loop
                  >
                    <Command.Input
                      value={selectedClientName || clientQuery}
                      onValueChange={(v) => {
                        setSelectedClientName('');
                        setClientEntityId('');
                        setClientQuery(v);
                      }}
                      onFocus={() => setClientOpen(true)}
                      onBlur={() => setTimeout(() => setClientOpen(false), 180)}
                      placeholder="Search org or contact…"
                      className="w-full border-0 bg-transparent px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus:ring-0"
                    />
                    {clientOpen && clientResults.length > 0 && (
                      <Command.List className="h-fit max-h-[200px] overflow-y-auto border-t border-[oklch(1_0_0_/_0.10)]">
                        {clientResults.map((r) => (
                          <Command.Item
                            key={`${r.type}-${r.id}`}
                            value={`${r.type}-${r.id}-${r.type === 'org' ? r.name : `${r.first_name} ${r.last_name}`}`}
                            onSelect={() => {
                              if (r.type === 'org') {
                                setSelectedClientName(r.name);
                                setClientEntityId(r.id);
                              } else {
                                setSelectedClientName(`${r.first_name} ${r.last_name}`);
                                setClientEntityId(r.id);
                              }
                              setClientQuery('');
                              setClientResults([]);
                            }}
                            className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[oklch(1_0_0_/_0.05)] data-[selected=true]:bg-[oklch(1_0_0_/_0.05)]"
                          >
                            {r.type === 'org' ? (
                              <Building2 size={16} className="shrink-0 text-[var(--stage-text-secondary)]/60" strokeWidth={1.5} aria-hidden />
                            ) : (
                              <User size={16} className="shrink-0 text-[var(--stage-text-secondary)]/60" strokeWidth={1.5} aria-hidden />
                            )}
                            <span className="text-[var(--stage-text-primary)] truncate">
                              {r.type === 'org' ? r.name : `${r.first_name} ${r.last_name}`}
                            </span>
                            {r.type === 'contact' && r.email && (
                              <span className="text-[var(--stage-text-secondary)]/50 text-xs truncate shrink-0 max-w-[120px]">{r.email}</span>
                            )}
                          </Command.Item>
                        ))}
                      </Command.List>
                    )}
                    {clientLoading && clientQuery.length >= 2 && (
                      <div className="px-3 py-2 text-xs text-[var(--stage-text-secondary)]/50">Searching…</div>
                    )}
                  </Command>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'Gear & inventory' && (
            <motion.div
              key="gear"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={STAGE_NAV_CROSSFADE}
              className="flex flex-col gap-5"
            >
              <div className="stage-panel-elevated rounded-[var(--stage-radius-panel)] p-5 border border-[oklch(1_0_0_/_0.10)] space-y-4">
                <p className="stage-label">Tech & gear</p>
                <div>
                  <label htmlFor="handoff-gear" className="block stage-field-label mb-1.5">Tech specs / gear requirements</label>
                  <textarea
                    id="handoff-gear"
                    rows={3}
                    placeholder="e.g. backline, power drops, rigging"
                    value={gearRequirements}
                    onChange={(e) => setGearRequirements(e.target.value)}
                    className="w-full rounded-md bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.10)] px-3 py-2 text-[var(--stage-text-primary)] text-sm placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] resize-none"
                  />
                </div>
                <div>
                  <label htmlFor="handoff-restrictions" className="block stage-field-label mb-1.5">Venue restrictions</label>
                  <textarea
                    id="handoff-restrictions"
                    rows={3}
                    placeholder="e.g. stairs only, load-in window, noise curfew"
                    value={venueRestrictions}
                    onChange={(e) => setVenueRestrictions(e.target.value)}
                    className="w-full rounded-md bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.10)] px-3 py-2 text-[var(--stage-text-primary)] text-sm placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] resize-none"
                  />
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {error && (
          <p className="mt-4 text-sm text-unusonic-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-between gap-4 p-4 border-t border-[oklch(1_0_0_/_0.10)]">
        <div>
          {!isFirst ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={submitting}
              className="flex items-center gap-2 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-xl py-2 disabled:opacity-45 transition-colors"
            >
              <ChevronLeft size={18} strokeWidth={1.5} aria-hidden />
              Back
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleNext}
          disabled={submitting}
          className="bg-[var(--stage-void)] text-[var(--stage-text-primary)] px-5 py-2.5 rounded-full stage-panel flex items-center gap-2 text-sm font-medium tracking-tight disabled:opacity-45 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors stage-hover overflow-hidden"
        >
          {submitting ? 'Handing over…' : isLast ? 'Hand over' : 'Next'}
          {!submitting && !isLast && <ChevronRight size={18} strokeWidth={1.5} aria-hidden />}
        </button>
      </div>
    </motion.div>
  );
}
