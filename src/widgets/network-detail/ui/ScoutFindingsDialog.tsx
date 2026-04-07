'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Building2, Mail, Phone, MapPin, Tag, Globe, Users } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { ScoutResult } from '@/features/intelligence';
import { useModalLayer } from '@/shared/lib/use-modal-layer';

interface ScoutFindingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findings: ScoutResult | null;
  onConfirm: (data: ScoutResult) => void;
  onDiscard: () => void;
}

import { STAGE_HEAVY } from '@/shared/lib/motion-constants';

function formatAddress(addr: ScoutResult['address']): string {
  if (!addr) return '';
  const parts = [addr.street, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean);
  return parts.join(', ') || '';
}

export function ScoutFindingsDialog({
  open,
  onOpenChange,
  findings,
  onConfirm,
  onDiscard,
}: ScoutFindingsDialogProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleConfirm = React.useCallback(() => {
    if (findings) onConfirm(findings);
    onOpenChange(false);
  }, [findings, onConfirm, onOpenChange]);

  const handleDiscard = React.useCallback(() => {
    onDiscard();
    onOpenChange(false);
  }, [onDiscard, onOpenChange]);

  useModalLayer({ open, onClose: handleDiscard, containerRef });

  const hasAnyFindings = findings && (
    findings.name ||
    findings.doingBusinessAs ||
    findings.logoUrl ||
    findings.website ||
    findings.supportEmail ||
    findings.phone ||
    (findings.address && formatAddress(findings.address)) ||
    (findings.tags?.length ?? 0) > 0 ||
    findings.brandColor ||
    (findings.roster?.length ?? 0) > 0
  );

  const dialog = open ? (
    <AnimatePresence>
      <>
        <motion.div
          role="presentation"
          className="fixed inset-0 z-50 bg-[oklch(0.06_0_0/0.75)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={() => handleDiscard()}
          aria-hidden
        />
        <motion.div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="aion-findings-title"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={STAGE_HEAVY}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] shadow-2xl"
          data-surface="raised"
          onClick={(e) => e.stopPropagation()}
        >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="flex max-h-[90vh] flex-col"
        >
          <div className="shrink-0 px-5 pt-5 pb-3">
            <h2 id="aion-findings-title" className="text-sm font-medium uppercase tracking-widest text-[var(--stage-text-primary)]">
              Aion findings
            </h2>
          </div>

          {findings && hasAnyFindings ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pr-4">
              <div className="space-y-4 pb-2">
                <div className="flex items-start gap-4">
                  {findings.logoUrl && (
                    <div
                      className="size-14 shrink-0 rounded-xl overflow-hidden border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-elevated)] flex items-center justify-center"
                    >
                      <img src={findings.logoUrl} alt="" className="size-full object-contain p-1.5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    {findings.name && (
                      <p className="font-medium text-[var(--stage-text-primary)] truncate">{findings.name}</p>
                    )}
                    {findings.doingBusinessAs && (
                      <p className="text-xs text-[var(--stage-text-secondary)] truncate">{findings.doingBusinessAs}</p>
                    )}
                    {findings.entityType && (
                      <p className="text-[10px] uppercase tracking-widest text-[var(--stage-text-secondary)]/70">
                        {findings.entityType.replace('_', ' ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  {findings.website && (
                    <div className="flex items-center gap-3 min-h-[36px] rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] px-3 py-2">
                      <Globe className="size-4 shrink-0 text-[var(--stage-text-secondary)]" />
                      <span className="truncate font-mono text-xs text-[var(--stage-text-primary)]">{findings.website}</span>
                    </div>
                  )}
                  {findings.supportEmail && (
                    <div className="flex items-center gap-3 min-h-[36px] rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] px-3 py-2">
                      <Mail className="size-4 shrink-0 text-[var(--stage-text-secondary)]" />
                      <span className="truncate font-mono text-xs text-[var(--stage-text-primary)]">{findings.supportEmail}</span>
                    </div>
                  )}
                  {findings.phone && (
                    <div className="flex items-center gap-3 min-h-[36px] rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] px-3 py-2">
                      <Phone className="size-4 shrink-0 text-[var(--stage-text-secondary)]" />
                      <span className="truncate text-xs text-[var(--stage-text-primary)]">{findings.phone}</span>
                    </div>
                  )}
                  {findings.address && formatAddress(findings.address) && (
                    <div className="flex items-start gap-3 min-h-[36px] rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] px-3 py-2">
                      <MapPin className="size-4 shrink-0 mt-0.5 text-[var(--stage-text-secondary)]" />
                      <span className="text-xs leading-relaxed text-[var(--stage-text-secondary)]">{formatAddress(findings.address)}</span>
                    </div>
                  )}
                  {findings.tags && findings.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] px-3 py-2 min-h-[36px]">
                      {findings.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex rounded-md border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0/0.08)] px-2 py-0.5 text-[10px] font-medium text-[var(--stage-text-secondary)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 min-h-[28px] px-1">
                      <Users className="size-4 shrink-0 text-[var(--stage-text-secondary)]" />
                      <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                        {findings.roster && findings.roster.length > 0
                          ? `${findings.roster.length} team member(s)`
                          : 'Team'}
                      </span>
                    </div>
                    {findings.roster && findings.roster.length > 0 ? (
                      <div className="rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] max-h-[200px] overflow-y-auto">
                        <ul className="grid grid-cols-2 gap-2 p-2">
                          {findings.roster.map((m, i) => (
                            <li
                              key={i}
                              className="flex items-center gap-2 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-card)] px-2 py-1.5 min-w-0"
                            >
                              {m.avatarUrl ? (
                                <img
                                  src={m.avatarUrl}
                                  alt=""
                                  className="size-8 rounded-full object-cover border border-[oklch(1_0_0_/_0.08)]"
                                />
                              ) : (
                                <div className="size-8 rounded-full bg-[oklch(1_0_0/0.08)] flex items-center justify-center text-[10px] font-medium text-[var(--stage-text-secondary)]">
                                  {(m.firstName?.[0] ?? '?') + (m.lastName?.[0] ?? '')}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-[var(--stage-text-primary)] truncate">
                                  {m.firstName} {m.lastName}
                                </p>
                                {m.jobTitle && (
                                  <p className="text-[10px] text-[var(--stage-text-secondary)] truncate">{m.jobTitle}</p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--stage-text-secondary)] py-1">No team members found on this site.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center px-5 py-8 text-center">
              <Building2 className="size-10 text-[var(--stage-text-secondary)]/40 mb-3" />
              <p className="text-sm text-[var(--stage-text-secondary)]">No structured data found.</p>
              <p className="mt-1 text-xs text-[var(--stage-text-secondary)]">You can still apply to fill defaults.</p>
            </div>
          )}

          <div className="shrink-0 border-t border-[oklch(1_0_0_/_0.08)] px-5 py-4">
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                className="flex-1 gap-2 border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:bg-[var(--ctx-well)]"
              >
                <X className="size-4" />
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                className="flex-1 gap-2 bg-[var(--stage-accent)] text-[oklch(0.10_0_0)] border border-[var(--stage-accent)] hover:bg-[var(--stage-accent)]/90"
              >
                <Check className="size-4" />
                Apply
              </Button>
            </div>
          </div>
        </motion.div>
        </motion.div>
      </>
    </AnimatePresence>
  ) : null;

  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}
