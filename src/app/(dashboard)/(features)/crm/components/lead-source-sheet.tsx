'use client';

/**
 * LeadSourceSheet — portal modal for editing lead source + referrer.
 * Follows overlay-and-modal-system.md: no backdrop-blur, stage-surface-raised,
 * STAGE_HEAVY entry, stage-input class, stage-label class.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_HEAVY, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { getWorkspaceLeadSources, type WorkspaceLeadSource } from '@/features/lead-sources';
import { updateDealScalars } from '../actions/update-deal-scalars';
import { searchNetworkOrgs } from '@/features/network-data';
import { searchCrewMembers } from '../actions/deal-crew';
import { getEntityDisplayName } from '../actions/lookup';
import { toast } from 'sonner';

const CATEGORIES = ['referral', 'digital', 'marketplace', 'offline', 'relationship', 'custom'] as const;

/** Backdrop: 200ms ease-out, not a spring (per overlay spec). */
const BACKDROP_TRANSITION = { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const };
const EXIT_TRANSITION = { duration: 0.15, ease: [0.4, 0, 0.2, 1] as const };

const OVERLAY_SHADOW = '0 24px 64px -12px oklch(0 0 0 / 0.6), 0 8px 24px -4px oklch(0 0 0 / 0.4)';

type Props = {
  open: boolean;
  dealId: string;
  currentLeadSourceId: string | null;
  currentReferrerEntityId: string | null;
  sourceOrgId: string | null;
  onSaved: (sourceLabel?: string | null, referrerName?: string | null) => void;
  onClose: () => void;
};

type ReferrerResult = { id: string; name: string; section: 'team' | 'network' };

export function LeadSourceSheet({
  open, dealId, currentLeadSourceId, currentReferrerEntityId, sourceOrgId, onSaved, onClose,
}: Props) {
  const [sources, setSources] = useState<WorkspaceLeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(currentLeadSourceId);
  const [saving, setSaving] = useState(false);

  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [referrerEntityId, setReferrerEntityId] = useState<string | null>(currentReferrerEntityId);
  const [referrerQuery, setReferrerQuery] = useState('');
  const [referrerResults, setReferrerResults] = useState<ReferrerResult[]>([]);
  const [referrerSearching, setReferrerSearching] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedSource = sources.find((s) => s.id === selectedSourceId);
  // Show referrer section if: source is a referral type, OR a referrer is already linked
  const isReferral = selectedSource?.is_referral ?? false;
  const showReferrerSection = isReferral || !!referrerEntityId;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSelectedSourceId(currentLeadSourceId);
    setReferrerEntityId(currentReferrerEntityId);
    setReferrerQuery('');
    setReferrerResults([]);
    Promise.all([
      getWorkspaceLeadSources(),
      currentReferrerEntityId ? getEntityDisplayName(currentReferrerEntityId) : Promise.resolve(null),
    ]).then(([s, name]) => {
      if (cancelled) return;
      setSources(s);
      setReferrerName(name);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, currentLeadSourceId, currentReferrerEntityId]);

  useEffect(() => {
    if (referrerQuery.length < 2 || !sourceOrgId) { setReferrerResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setReferrerSearching(true);
      const [net, crew] = await Promise.all([
        searchNetworkOrgs(sourceOrgId, referrerQuery),
        searchCrewMembers(sourceOrgId, referrerQuery),
      ]);
      const seen = new Set<string>();
      const out: ReferrerResult[] = [];
      for (const r of crew) { if (!seen.has(r.entity_id)) { seen.add(r.entity_id); out.push({ id: r.entity_id, name: r.name, section: 'team' }); } }
      for (const r of net) { const eid = r.entity_uuid ?? r.id; if (!seen.has(eid)) { seen.add(eid); out.push({ id: eid, name: r.name, section: 'network' }); } }
      setReferrerResults(out);
      setReferrerSearching(false);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [referrerQuery, sourceOrgId]);

  const handleSelectSource = useCallback(async (source: WorkspaceLeadSource) => {
    setSelectedSourceId(source.id);
    const clearRef = !source.is_referral && referrerEntityId;
    if (clearRef) { setReferrerEntityId(null); setReferrerName(null); }
    setSaving(true);
    const result = await updateDealScalars(dealId, {
      lead_source_id: source.id, lead_source: source.label, ...(clearRef ? { referrer_entity_id: null } : {}),
    });
    setSaving(false);
    if (result.success) {
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500);
      onSaved(source.label, clearRef ? null : referrerName);
    } else { toast.error(result.error ?? 'Failed to save'); }
  }, [dealId, referrerEntityId, referrerName, onSaved]);

  const handleClearSource = useCallback(async () => {
    setSelectedSourceId(null); setReferrerEntityId(null); setReferrerName(null);
    setSaving(true);
    const result = await updateDealScalars(dealId, { lead_source_id: null, lead_source: null, referrer_entity_id: null });
    setSaving(false);
    if (result.success) {
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500);
      onSaved(null, null);
    } else { toast.error(result.error ?? 'Failed to save'); }
  }, [dealId, onSaved]);

  const handleSelectReferrer = useCallback(async (entityId: string, name: string) => {
    setReferrerEntityId(entityId); setReferrerName(name); setReferrerQuery(''); setReferrerResults([]);
    setSaving(true);
    const result = await updateDealScalars(dealId, { referrer_entity_id: entityId });
    setSaving(false);
    if (result.success) {
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500);
      onSaved(undefined, name);
    } else {
      toast.error(result.error ?? 'Failed to save');
      setReferrerEntityId(currentReferrerEntityId); setReferrerName(null);
    }
  }, [dealId, currentReferrerEntityId, onSaved]);

  const handleClearReferrer = useCallback(async () => {
    setReferrerEntityId(null); setReferrerName(null);
    setSaving(true);
    const result = await updateDealScalars(dealId, { referrer_entity_id: null });
    setSaving(false);
    if (result.success) {
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500);
      onSaved(undefined, null);
    } else { toast.error(result.error ?? 'Failed to save'); }
  }, [dealId, onSaved]);

  const handleClose = () => { if (!saving) onClose(); };

  if (typeof window === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
          {/* Backdrop — no blur per overlay spec */}
          <motion.div
            className="absolute inset-0 bg-[oklch(0.06_0_0/0.75)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_TRANSITION}
            onClick={handleClose}
          />

          {/* Modal — stage-surface-raised, overlay shadow, STAGE_HEAVY spring */}
          <motion.div
            className="relative z-10 w-full max-w-[480px]"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={STAGE_HEAVY}
          >
            <div
              className="flex flex-col max-h-[80vh]"
              style={{
                background: 'var(--stage-surface-raised, oklch(0.26 0.004 50))',
                border: '1px solid oklch(1 0 0 / 0.08)',
                borderRadius: 'var(--stage-radius-panel, 12px)',
                boxShadow: OVERLAY_SHADOW,
              }}
            >
              {/* Header — sticky */}
              <div
                className="flex items-start justify-between gap-3 p-5 pb-4 shrink-0"
                style={{ borderBottom: '1px solid var(--stage-edge-subtle, oklch(1 0 0 / 0.03))' }}
              >
                <div>
                  <p className="stage-label" style={{ color: 'var(--stage-text-secondary)' }}>
                    Lead source
                  </p>
                  <h2 className="text-[var(--stage-text-primary)] font-medium tracking-tight text-base leading-tight mt-1">
                    How did they find you?
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content — scrollable */}
              <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-[var(--stage-text-tertiary)]" />
                  </div>
                )}

                {!loading && (
                  <div className="flex flex-col gap-3">
                    {CATEGORIES.map((cat) => {
                      const group = sources.filter((s) => s.category === cat);
                      if (group.length === 0) return null;
                      return (
                        <div key={cat}>
                          <span className="stage-label" style={{ color: 'var(--stage-text-tertiary)' }}>
                            {cat}
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {group.map((source) => {
                              const active = selectedSourceId === source.id;
                              return (
                                <motion.button
                                  key={source.id}
                                  type="button"
                                  disabled={saving}
                                  onClick={() => handleSelectSource(source)}
                                  transition={STAGE_LIGHT}
                                  className={cn(
                                    'rounded-full border px-3 py-1 text-[11px] font-medium tracking-tight transition-colors focus:outline-none disabled:opacity-45 hover:bg-[var(--stage-surface-hover)]',
                                    active
                                      ? 'border-[var(--stage-accent)]/40 bg-[var(--stage-accent)]/10 text-[var(--stage-text-primary)]'
                                      : 'border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[var(--stage-edge-top)]',
                                  )}
                                >
                                  {source.label}
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {selectedSourceId && (
                      <button
                        type="button"
                        onClick={handleClearSource}
                        disabled={saving}
                        className="self-start text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors disabled:opacity-45"
                      >
                        Clear source
                      </button>
                    )}
                  </div>
                )}

                {/* Referrer section */}
                {showReferrerSection && !loading && (
                  <motion.div
                    key="referrer"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={STAGE_LIGHT}
                  >
                    <div style={{ borderTop: '1px solid var(--stage-edge-subtle, oklch(1 0 0 / 0.03))', paddingTop: 16 }}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="stage-label" style={{ color: 'var(--stage-text-secondary)' }}>
                          Referred by
                        </p>
                        {referrerName && (
                          <button
                            type="button"
                            onClick={handleClearReferrer}
                            disabled={saving}
                            className="text-[10px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors disabled:opacity-45"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {referrerName ? (
                        <div
                          className="flex items-center gap-2.5"
                          style={{
                            height: 'var(--stage-input-height, 34px)',
                            padding: '0 var(--stage-input-padding-x, 12px)',
                            background: 'var(--stage-surface-elevated, oklch(0.22 0.004 50))',
                            border: '1px solid var(--stage-accent, oklch(1 0 0))',
                            borderRadius: 'var(--stage-radius-input, 6px)',
                          }}
                        >
                          <span
                            className="truncate flex-1"
                            style={{
                              fontSize: 'var(--stage-input-font-size, 13px)',
                              color: 'var(--stage-text-primary)',
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {referrerName}
                          </span>
                          <button
                            type="button"
                            onClick={handleClearReferrer}
                            disabled={saving}
                            className="shrink-0 p-0.5 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-colors disabled:opacity-45"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Search bar — elevated surface, not recessed (per input-and-form-system.md) */}
                          <div className="relative">
                            <Search
                              className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-[var(--stage-text-tertiary)]"
                              style={{ left: 'var(--stage-input-padding-x, 12px)', width: 14, height: 14 }}
                            />
                            <input
                              value={referrerQuery}
                              onChange={(e) => setReferrerQuery(e.target.value)}
                              placeholder="Search team and network…"
                              autoFocus
                              className="w-full transition-[border-color] duration-100 ease-out"
                              style={{
                                height: 'var(--stage-input-height, 34px)',
                                paddingLeft: 'calc(var(--stage-input-padding-x, 12px) + 20px)',
                                paddingRight: 'var(--stage-input-padding-x, 12px)',
                                fontSize: 'var(--stage-input-font-size, 13px)',
                                fontFamily: 'var(--font-sans)',
                                color: 'var(--stage-text-primary)',
                                background: 'var(--stage-surface-elevated, oklch(0.22 0.004 50))',
                                border: '1px solid oklch(1 0 0 / 0.08)',
                                borderRadius: 'var(--stage-radius-input, 6px)',
                                outline: 'none',
                              }}
                              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--stage-accent, oklch(1 0 0))'; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = 'oklch(1 0 0 / 0.08)'; }}
                            />
                          </div>

                          {referrerSearching && (
                            <div className="flex items-center justify-center py-3">
                              <Loader2 className="size-3.5 animate-spin text-[var(--stage-text-tertiary)]" />
                            </div>
                          )}

                          {!referrerSearching && referrerResults.length > 0 && (() => {
                            const teamRes = referrerResults.filter((r) => r.section === 'team');
                            const netRes = referrerResults.filter((r) => r.section === 'network');
                            return (
                              <div
                                className="mt-2 max-h-[180px] overflow-y-auto"
                                style={{
                                  background: 'var(--stage-surface-elevated, oklch(0.22 0.004 50))',
                                  border: '1px solid var(--stage-edge-subtle)',
                                  borderRadius: 'var(--stage-radius-input, 6px)',
                                }}
                              >
                                {teamRes.length > 0 && (
                                  <>
                                    <p className="px-3 pt-2.5 pb-1 stage-label" style={{ color: 'var(--stage-text-tertiary)' }}>Team</p>
                                    {teamRes.map((r) => (
                                      <button
                                        key={r.id}
                                        type="button"
                                        disabled={saving}
                                        onClick={() => handleSelectReferrer(r.id, r.name)}
                                        className="w-full text-left px-3 py-2 text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-surface-hover)] transition-colors truncate disabled:opacity-45"
                                      >
                                        {r.name}
                                      </button>
                                    ))}
                                  </>
                                )}
                                {netRes.length > 0 && (
                                  <>
                                    <p className="px-3 pt-2.5 pb-1 stage-label" style={{ color: 'var(--stage-text-tertiary)' }}>Network</p>
                                    {netRes.map((r) => (
                                      <button
                                        key={r.id}
                                        type="button"
                                        disabled={saving}
                                        onClick={() => handleSelectReferrer(r.id, r.name)}
                                        className="w-full text-left px-3 py-2 text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-surface-hover)] transition-colors truncate disabled:opacity-45"
                                      >
                                        {r.name}
                                      </button>
                                    ))}
                                  </>
                                )}
                              </div>
                            );
                          })()}

                          {!referrerSearching && referrerQuery.length >= 2 && referrerResults.length === 0 && (
                            <p className="py-3 text-xs text-[var(--stage-text-tertiary)] text-center">No results</p>
                          )}
                        </>
                      )}
                    </div>
                  </motion.div>
                )}

                <AnimatePresence mode="wait">
                  {saving && (
                    <motion.div
                      key="saving"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center justify-center gap-2 py-1"
                    >
                      <Loader2 className="size-3.5 animate-spin text-[var(--stage-text-tertiary)]" />
                      <span className="text-xs text-[var(--stage-text-tertiary)]">Saving…</span>
                    </motion.div>
                  )}
                  {!saving && savedFlash && (
                    <motion.div
                      key="saved"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center justify-center gap-1.5 py-1"
                    >
                      <span className="size-3.5 rounded-full flex items-center justify-center" style={{ background: 'var(--color-unusonic-success)', color: 'oklch(0.10 0 0)' }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-unusonic-success)' }}>Saved</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
