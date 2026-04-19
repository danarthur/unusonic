'use client';

/**
 * Full-screen consent modal for the Aion card beta.
 *
 * Shown from:
 *   - /settings/aion (when admin hasn't accepted current term version)
 *   - First /crm visit with flag=OFF + admin role + not yet accepted (future wiring)
 *
 * Shape C rules (design §21):
 *   - Owner/admin only. Members see a read-only "Request access" view.
 *   - Re-consent required when any term version bumps.
 *   - Cadence opt-in is a nested secondary choice — requires main consent first.
 *   - Disable is always available from settings once accepted.
 */

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Sparkles, Check, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { StagePanel } from '@/shared/ui/stage-panel';
import { CONSENT_TERMS, type ConsentTermKey } from '@/shared/lib/consent';
import { acceptAionCardBeta } from '../actions/consent-actions';

export type FeatureConsentModalProps = {
  open: boolean;
  onClose: () => void;
  /** Reason for reopening: fresh flip vs version bump. Drives the headline. */
  mode: 'first_run' | 'reconsent';
  /** Whether cadence consent was previously granted (so we default the toggle on) */
  cadencePreviouslyAccepted: boolean;
};

const PARAGRAPHS_OF = (key: ConsentTermKey): string[] =>
  CONSENT_TERMS[key].body.split('\n\n').map((p) => p.trim()).filter(Boolean);

export function FeatureConsentModal({
  open,
  onClose,
  mode,
  cadencePreviouslyAccepted,
}: FeatureConsentModalProps) {
  const [enableCadence, setEnableCadence] = useState(cadencePreviouslyAccepted);
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const cardTerm = CONSENT_TERMS.aion_card_beta;
  const cadenceTerm = CONSENT_TERMS.owner_cadence_learning;

  const handleAccept = () => {
    startTransition(async () => {
      const result = await acceptAionCardBeta({
        enableCadenceLearning: enableCadence,
      });
      if (!result.success) {
        toast.error(result.error ?? 'Could not enable.');
        return;
      }
      toast.success(
        mode === 'reconsent'
          ? 'Updated terms accepted.'
          : 'Aion card beta turned on.',
      );
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aion-consent-title"
    >
      <StagePanel
        elevated
        padding="lg"
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto space-y-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="shrink-0" />
            <h2 id="aion-consent-title" className="text-lg tracking-tight">
              {mode === 'reconsent' ? 'Updated terms' : cardTerm.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={isPending}
            className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Reconsent banner */}
        {mode === 'reconsent' && (
          <div
            className="rounded-md px-3 py-2 text-xs"
            style={{
              backgroundColor:
                'color-mix(in oklch, var(--stage-text-primary) 6%, transparent)',
              color: 'var(--stage-text-secondary)',
            }}
          >
            We&rsquo;ve updated how this beta works. Please review and accept
            the current terms to keep using the Aion card.
          </div>
        )}

        {/* Card-beta body */}
        <section className="space-y-3">
          {PARAGRAPHS_OF('aion_card_beta').map((p, i) => (
            <p
              key={i}
              className="leading-relaxed"
              style={{
                fontSize: 'var(--stage-text-body, 13px)',
                color: 'var(--stage-text-secondary)',
              }}
            >
              {p}
            </p>
          ))}
        </section>

        {/* Cadence opt-in nested toggle */}
        <section
          className={cn(
            'rounded-md border p-3 space-y-3',
            'border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3
                className="text-sm font-medium"
                style={{ color: 'var(--stage-text-primary)' }}
              >
                {cadenceTerm.title}
              </h3>
              <p
                className="mt-1 text-xs leading-relaxed"
                style={{ color: 'var(--stage-text-secondary)' }}
              >
                {PARAGRAPHS_OF('owner_cadence_learning')[0]}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enableCadence}
              aria-label="Enable cadence learning"
              disabled={isPending}
              onClick={() => setEnableCadence((v) => !v)}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                enableCadence
                  ? 'bg-[var(--stage-text-primary)]/90'
                  : 'bg-[var(--stage-edge-subtle)]',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-block size-4 rounded-full bg-[var(--stage-surface)] transition-transform',
                  enableCadence ? 'translate-x-[18px]' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>

          {enableCadence && (
            <details className="text-xs">
              <summary
                className="cursor-help underline decoration-dotted underline-offset-2"
                style={{ color: 'var(--stage-text-tertiary, var(--stage-text-secondary))' }}
              >
                Full cadence terms
              </summary>
              <div className="mt-2 space-y-2">
                {PARAGRAPHS_OF('owner_cadence_learning').slice(1).map((p, i) => (
                  <p
                    key={i}
                    className="leading-relaxed"
                    style={{ color: 'var(--stage-text-secondary)' }}
                  >
                    {p}
                  </p>
                ))}
              </div>
            </details>
          )}
        </section>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <p
            className="text-xs"
            style={{ color: 'var(--stage-text-tertiary, var(--stage-text-secondary))' }}
          >
            Terms version {cardTerm.version}
            {enableCadence ? ` · Cadence version ${cadenceTerm.version}` : ''}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isPending}
            >
              Not now
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleAccept}
              disabled={isPending}
            >
              <Check />
              {mode === 'reconsent' ? 'Accept updated terms' : 'Accept and turn on'}
            </Button>
          </div>
        </div>
      </StagePanel>
    </div>
  );
}
