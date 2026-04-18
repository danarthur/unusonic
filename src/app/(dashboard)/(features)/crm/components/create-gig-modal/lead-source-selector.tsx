'use client';

import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Building2, User, Plus, Loader2, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { WorkspaceLeadSource } from '@/features/lead-sources';
import type { ReferrerSearchResult } from '../../actions/search-referrer';
import { createGhostReferrerEntity } from '../../actions/lookup';
import { useRef } from 'react';

interface LeadSourceSelectorProps {
  leadSources: WorkspaceLeadSource[];
  selectedLeadSourceId: string | null;
  setSelectedLeadSourceId: (v: string | null) => void;
  leadSource: 'referral' | 'repeat_client' | 'website' | 'social' | 'direct' | null;
  setLeadSource: (v: 'referral' | 'repeat_client' | 'website' | 'social' | 'direct' | null) => void;
  leadSourceDetail: string;
  setLeadSourceDetail: (v: string) => void;
  // Referrer state
  referrerEntityId: string | null;
  setReferrerEntityId: (v: string | null) => void;
  referrerName: string;
  setReferrerName: (v: string) => void;
  referrerQuery: string;
  setReferrerQuery: (v: string) => void;
  referrerResults: ReferrerSearchResult[];
  setReferrerResults: (v: ReferrerSearchResult[]) => void;
  referrerSearching: boolean;
  referrerCreating: boolean;
  setReferrerCreating: (v: boolean) => void;
}

export function LeadSourceSelector({
  leadSources, selectedLeadSourceId, setSelectedLeadSourceId,
  leadSource, setLeadSource, leadSourceDetail, setLeadSourceDetail,
  referrerEntityId, setReferrerEntityId,
  referrerName, setReferrerName, referrerQuery, setReferrerQuery,
  referrerResults, setReferrerResults, referrerSearching, referrerCreating, setReferrerCreating,
}: LeadSourceSelectorProps) {
  const referrerTriggerRef = useRef<HTMLInputElement>(null);

  // Selected = elevated (lighter than the modal surface). Inactive = subtle
  // border on transparent so the pill reads as "selectable, not yet chosen."
  // Same pattern as the host-kind pills above.
  const pillClass = (active: boolean) => cn(
    'rounded-[var(--stage-radius-input,6px)] border px-3 py-1.5 text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight transition-colors duration-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
    active
      ? 'border-[oklch(1_0_0_/_0.16)] bg-[var(--ctx-card)] text-[var(--stage-text-primary)] shadow-sm'
      : 'border-[oklch(1_0_0_/_0.08)] bg-transparent text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.16)] hover:bg-[oklch(1_0_0_/_0.04)]'
  );

  return (
    <div>
      {/* Referred by — leads, because "who sent this client" is the most
          actionable signal. Source pills sit below it as classification. */}
      <label htmlFor="referrer-input" className="block stage-label mb-1.5">
        Referred by <span className="text-[var(--stage-text-tertiary)] font-normal">(optional)</span>
      </label>
            {referrerEntityId ? (
              <div className="flex items-center gap-2 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] px-3 py-2">
                <User className="size-3.5 text-[var(--stage-text-secondary)]/60 shrink-0" />
                <span className="text-sm text-[var(--stage-text-primary)] truncate flex-1">{referrerName}</span>
                <button
                  type="button"
                  onClick={() => { setReferrerEntityId(null); setReferrerName(''); setReferrerQuery(''); }}
                  className="shrink-0 rounded-lg p-0.5 text-[var(--stage-text-secondary)]/40 hover:text-[var(--stage-text-secondary)] transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  ref={referrerTriggerRef}
                  value={referrerQuery}
                  onChange={(e) => setReferrerQuery(e.target.value)}
                  placeholder="Who referred this client?"
                  className="stage-input w-full min-w-0"
                />
                {(referrerSearching || referrerCreating) && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-[var(--stage-text-secondary)]/40" />
                )}
                {referrerQuery.length >= 2 && !referrerSearching && (referrerResults.length > 0 || !referrerCreating) && createPortal(
                  <div
                    className="fixed inset-0 z-[60]"
                    onMouseDown={() => {
                      setReferrerResults([]);
                      setReferrerQuery('');
                    }}
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={STAGE_LIGHT}
                      data-surface="raised"
                      onMouseDown={(e) => e.stopPropagation()}
                      style={(() => {
                        const rect = referrerTriggerRef.current?.getBoundingClientRect();
                        if (!rect) return {};
                        const spaceBelow = window.innerHeight - rect.bottom;
                        const dropUp = spaceBelow < 200;
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
                        const teamRes = referrerResults.filter((r) => r.section === 'team');
                        const netRes = referrerResults.filter((r) => r.section === 'network');
                        const ReferrerRow = ({ r }: { r: ReferrerSearchResult }) => (
                          <button
                            key={r.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setReferrerEntityId(r.id);
                              setReferrerName(r.subtitle ? `${r.name} (${r.subtitle})` : r.name);
                              setReferrerQuery('');
                              setReferrerResults([]);
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)] transition-colors min-w-0"
                          >
                            {r.subtitle ? (
                              <User size={14} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
                            ) : (
                              <Building2 size={14} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
                            )}
                            <span className="truncate min-w-0 flex items-baseline gap-1.5">
                              <span>{r.name}</span>
                              {r.subtitle && (
                                <span className="text-xs text-[var(--stage-text-tertiary)]">{r.subtitle}</span>
                              )}
                            </span>
                          </button>
                        );
                        return (
                          <>
                            {teamRes.length > 0 && (
                              <>
                                <div className="px-3 pt-2 pb-1 stage-label text-[var(--stage-text-tertiary)]">Team</div>
                                {teamRes.map((r) => <ReferrerRow key={r.id} r={r} />)}
                              </>
                            )}
                            {netRes.length > 0 && (
                              <>
                                <div className="px-3 pt-2 pb-1 stage-label text-[var(--stage-text-tertiary)]">Network</div>
                                {netRes.map((r) => <ReferrerRow key={r.id} r={r} />)}
                              </>
                            )}
                          </>
                        );
                      })()}
                      {referrerResults.length === 0 && !referrerCreating && (
                        <button
                          type="button"
                          onMouseDown={async (e) => {
                            e.stopPropagation();
                            const name = referrerQuery.trim();
                            if (!name) return;
                            setReferrerCreating(true);
                            try {
                              const result = await createGhostReferrerEntity(name);
                              if (result) {
                                setReferrerEntityId(result.id);
                                setReferrerName(result.name);
                                setReferrerQuery('');
                                setReferrerResults([]);
                              }
                            } finally {
                              setReferrerCreating(false);
                            }
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.08)] transition-colors min-w-0"
                        >
                          <Plus size={14} className="shrink-0" strokeWidth={1.5} />
                          <span className="truncate min-w-0">Add &quot;{referrerQuery.trim()}&quot; as referrer</span>
                        </button>
                      )}
                    </motion.div>
                  </div>,
                  document.body
                )}
              </div>
            )}

      {/* Lead source — classification, sits below the referrer */}
      <div className="mt-3">
        <label className="block stage-label mb-1.5">Lead source</label>
        {leadSources.length > 0 ? (
          <div className="space-y-2.5">
            {(['referral', 'digital', 'marketplace', 'offline', 'relationship', 'custom'] as const).map((cat) => {
              const group = leadSources.filter((s) => s.category === cat);
              if (group.length === 0) return null;
              return (
                <div key={cat}>
                  <span className="block stage-micro text-[var(--stage-text-tertiary)] mb-1">
                    {cat}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.map((source) => (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => {
                          if (selectedLeadSourceId === source.id) {
                            setSelectedLeadSourceId(null);
                            setLeadSource(null);
                          } else {
                            setSelectedLeadSourceId(source.id);
                            setLeadSource(null);
                          }
                        }}
                        className={pillClass(selectedLeadSourceId === source.id)}
                      >
                        {source.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {([
              { value: 'referral', label: 'Referral' },
              { value: 'repeat_client', label: 'Repeat client' },
              { value: 'website', label: 'Website' },
              { value: 'social', label: 'Social' },
              { value: 'direct', label: 'Direct' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setLeadSource(leadSource === value ? null : value)}
                className={pillClass(leadSource === value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
