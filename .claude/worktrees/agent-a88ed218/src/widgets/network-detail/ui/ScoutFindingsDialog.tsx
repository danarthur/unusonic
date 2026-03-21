'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Building2, Mail, Phone, MapPin, Tag, Globe, Users } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { ScoutResult } from '@/features/intelligence';

interface ScoutFindingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findings: ScoutResult | null;
  onConfirm: (data: ScoutResult) => void;
  onDiscard: () => void;
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

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
  const handleConfirm = React.useCallback(() => {
    if (findings) onConfirm(findings);
    onOpenChange(false);
  }, [findings, onConfirm, onOpenChange]);

  const handleDiscard = React.useCallback(() => {
    onDiscard();
    onOpenChange(false);
  }, [onDiscard, onOpenChange]);

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
          className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={spring}
          onClick={() => handleDiscard()}
          aria-hidden
        />
        <motion.div
          role="dialog"
          aria-modal
          aria-labelledby="ion-findings-title"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={spring}
          className="fixed left-1/2 top-1/2 z-[9999] flex max-h-[90vh] w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-[var(--color-mercury)] bg-[var(--color-glass-surface)] shadow-2xl backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 px-5 pt-5 pb-3">
            <h2 id="ion-findings-title" className="text-sm font-semibold uppercase tracking-widest text-[var(--color-silk)]">
              ION findings
            </h2>
          </div>

          {findings && hasAnyFindings ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pr-4">
              <div className="space-y-4 pb-2">
                <div className="flex items-start gap-4">
                  {findings.logoUrl && (
                    <div
                      className="size-14 shrink-0 rounded-xl overflow-hidden border border-[var(--color-mercury)] flex items-center justify-center"
                      style={{
                        background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(248,250,252,0.7) 0%, rgba(226,232,240,0.4) 50%, transparent 100%)',
                      }}
                    >
                      <img src={findings.logoUrl} alt="" className="size-full object-contain p-1.5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    {findings.name && (
                      <p className="font-medium text-[var(--color-ink)] truncate">{findings.name}</p>
                    )}
                    {findings.doingBusinessAs && (
                      <p className="text-xs text-[var(--color-ink-muted)] truncate">{findings.doingBusinessAs}</p>
                    )}
                    {findings.entityType && (
                      <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]/70">
                        {findings.entityType.replace('_', ' ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  {findings.website && (
                    <div className="flex items-center gap-3 min-h-[36px] rounded-lg border border-[var(--color-mercury)] bg-white/5 px-3 py-2">
                      <Globe className="size-4 shrink-0 text-[var(--color-ink-muted)]" />
                      <span className="truncate font-mono text-xs text-[var(--color-ink)]">{findings.website}</span>
                    </div>
                  )}
                  {findings.supportEmail && (
                    <div className="flex items-center gap-3 min-h-[36px] rounded-lg border border-[var(--color-mercury)] bg-white/5 px-3 py-2">
                      <Mail className="size-4 shrink-0 text-[var(--color-ink-muted)]" />
                      <span className="truncate font-mono text-xs text-[var(--color-ink)]">{findings.supportEmail}</span>
                    </div>
                  )}
                  {findings.phone && (
                    <div className="flex items-center gap-3 min-h-[36px] rounded-lg border border-[var(--color-mercury)] bg-white/5 px-3 py-2">
                      <Phone className="size-4 shrink-0 text-[var(--color-ink-muted)]" />
                      <span className="truncate text-xs text-[var(--color-ink)]">{findings.phone}</span>
                    </div>
                  )}
                  {findings.address && formatAddress(findings.address) && (
                    <div className="flex items-start gap-3 min-h-[36px] rounded-lg border border-[var(--color-mercury)] bg-white/5 px-3 py-2">
                      <MapPin className="size-4 shrink-0 mt-0.5 text-[var(--color-ink-muted)]" />
                      <span className="text-xs leading-relaxed text-[var(--color-ink-muted)]">{formatAddress(findings.address)}</span>
                    </div>
                  )}
                  {findings.tags && findings.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--color-mercury)] bg-white/5 px-3 py-2 min-h-[36px]">
                      {findings.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex rounded-md border border-[var(--color-mercury)] bg-white/5 px-2 py-0.5 text-[10px] font-medium text-[var(--color-ink-muted)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 min-h-[28px] px-1">
                      <Users className="size-4 shrink-0 text-[var(--color-ink-muted)]" />
                      <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
                        {findings.roster && findings.roster.length > 0
                          ? `${findings.roster.length} team member(s)`
                          : 'Team'}
                      </span>
                    </div>
                    {findings.roster && findings.roster.length > 0 ? (
                      <div className="rounded-lg border border-[var(--color-mercury)] bg-white/5 max-h-[200px] overflow-y-auto">
                        <ul className="grid grid-cols-2 gap-2 p-2">
                          {findings.roster.map((m, i) => (
                            <li
                              key={i}
                              className="flex items-center gap-2 rounded-lg border border-[var(--color-mercury)] bg-white/5 px-2 py-1.5 min-w-0"
                            >
                              {m.avatarUrl ? (
                                <img
                                  src={m.avatarUrl}
                                  alt=""
                                  className="size-8 rounded-full object-cover border border-[var(--color-mercury)]"
                                />
                              ) : (
                                <div className="size-8 rounded-full bg-[var(--color-mercury)]/30 flex items-center justify-center text-[10px] font-medium text-[var(--color-ink-muted)]">
                                  {(m.firstName?.[0] ?? '?') + (m.lastName?.[0] ?? '')}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-[var(--color-ink)] truncate">
                                  {m.firstName} {m.lastName}
                                </p>
                                {m.jobTitle && (
                                  <p className="text-[10px] text-[var(--color-ink-muted)] truncate">{m.jobTitle}</p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--color-ink-muted)]/80 py-1">No team members found on this site.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center px-5 py-8 text-center">
              <Building2 className="size-10 text-[var(--color-ink-muted)]/40 mb-3" />
              <p className="text-sm text-[var(--color-ink-muted)]">No structured data found.</p>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]/70">You can still apply to fill defaults.</p>
            </div>
          )}

          <div className="shrink-0 border-t border-[var(--color-mercury)] px-5 py-4">
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                className="flex-1 gap-2 border-[var(--color-mercury)] text-[var(--color-ink-muted)] hover:bg-white/5"
              >
                <X className="size-4" />
                Discard
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                className="flex-1 gap-2 bg-[var(--color-silk)]/20 text-[var(--color-silk)] border border-[var(--color-silk)]/40 hover:bg-[var(--color-silk)]/30"
              >
                <Check className="size-4" />
                Apply
              </Button>
            </div>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  ) : null;

  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}
