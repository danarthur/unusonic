/**
 * Guardian setup step for the onboarding wizard.
 *
 * Rendered between the website/Scout step and the genesis step for any owner
 * going through first-run setup. Collects guardian rows (name + email),
 * enforces the Shamir threshold (fixed 2-of-3 today; wired through
 * `setGuardianThreshold` for future arbitrary k-of-n), and resolves with
 * either an `accept` or `deferred` decision so the wizard state machine can
 * advance.
 *
 * ### Decision shape
 *
 * The parent passes a single `onDecision` callback and gets back one of:
 *   - `{ kind: 'accept' }` — the user added ≥ threshold guardians and clicked
 *     the primary CTA. The step records acceptance via
 *     `recordGuardianAcceptance` before invoking the callback.
 *   - `{ kind: 'deferred' }` — the user clicked "I'll set this up later" and
 *     confirmed on the warning modal. The step records the deferral via
 *     `recordGuardianDeferral` before invoking the callback.
 *
 * Anything short of those two paths is NOT a decision — the step refuses to
 * surface a third exit. That's the "non-skippable" contract from
 * `docs/reference/login-redesign-design.md` \u00a78.
 *
 * @module features/onboarding/ui/guardian-setup-step
 */

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Plus, Trash2, Loader2, UserRound, AlertCircle } from 'lucide-react';
import {
  STAGE_LIGHT,
  STAGE_MEDIUM,
  M3_EASING_ENTER,
  M3_EASING_EXIT,
} from '@/shared/lib/motion-constants';
import {
  addGuardian,
  listMyGuardians,
  recordGuardianAcceptance,
  recordGuardianDeferral,
  removeGuardian,
  setGuardianThreshold,
  type GuardianRow,
} from '../api/guardian-actions';
import {
  GUARDIAN_DEFAULT_THRESHOLD,
  GUARDIAN_MIN_THRESHOLD,
  GUARDIAN_MAX_THRESHOLD,
} from '../model/guardian-constants';
import { GuardianDeferralWarning } from './guardian-deferral-warning';

/**
 * Threshold options the UI exposes today. The Shamir splitter in
 * `shared/lib/security/sharding.ts` is fixed 2-of-3, so the only currently
 * usable pair is (k=2, n=3). We still render the threshold selector so the
 * UI is in the right shape once the cryptography supports arbitrary k-of-n;
 * until then, other options are disabled.
 */
const THRESHOLD_OPTIONS: Array<{ k: number; n: number; label: string; enabled: boolean }> = [
  { k: 2, n: 3, label: '2 of 3', enabled: true },
  { k: 3, n: 5, label: '3 of 5', enabled: false },
];

export type GuardianStepDecision = { kind: 'accept' } | { kind: 'deferred' };

interface GuardianSetupStepProps {
  /** Invoked with the recorded decision once the server write completes. */
  onDecision: (decision: GuardianStepDecision) => void;
}

/**
 * Visual + behavioral owner of the guardian setup gate. Stateful so the
 * wizard doesn't have to care about add/remove transitions; the only
 * contract it exposes to the wizard is `onDecision`.
 */
export function GuardianSetupStep({ onDecision }: GuardianSetupStepProps) {
  const [guardians, setGuardians] = useState<GuardianRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(GUARDIAN_DEFAULT_THRESHOLD);
  const [warningOpen, setWarningOpen] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const [isAdding, startAdd] = useTransition();
  const [isRemoving, startRemove] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listMyGuardians().then((rows) => {
      if (cancelled) return;
      setGuardians(rows);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const thresholdMet = useMemo(
    () => guardians.length >= threshold,
    [guardians.length, threshold],
  );

  function handleAdd() {
    setFormError(null);
    const name = formName.trim();
    const email = formEmail.trim();
    if (!email) {
      setFormError("Enter the guardian's email.");
      return;
    }
    startAdd(async () => {
      const result = await addGuardian({ name, email });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      // Refresh from source of truth rather than optimistic-splicing — we
      // need the canonical id / created_at to render the list and pass back
      // to removeGuardian later.
      const rows = await listMyGuardians();
      setGuardians(rows);
      setFormName('');
      setFormEmail('');
    });
  }

  function handleRemove(id: string) {
    setFormError(null);
    startRemove(async () => {
      const result = await removeGuardian(id);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setGuardians((prev) => prev.filter((row) => row.id !== id));
    });
  }

  async function handleAccept() {
    if (!thresholdMet || submittingDecision) return;
    setSubmittingDecision(true);
    // Fire both writes in parallel — `setGuardianThreshold` is a no-op
    // today but wiring it now keeps the decision self-contained.
    const [, acceptResult] = await Promise.all([
      setGuardianThreshold({ threshold }),
      recordGuardianAcceptance(),
    ]);
    setSubmittingDecision(false);
    if (!acceptResult.ok) {
      setFormError(acceptResult.error);
      return;
    }
    onDecision({ kind: 'accept' });
  }

  async function handleConfirmSkip() {
    if (submittingDecision) return;
    setSubmittingDecision(true);
    const result = await recordGuardianDeferral();
    setSubmittingDecision(false);
    if (!result.ok) {
      setFormError(result.error);
      setWarningOpen(false);
      return;
    }
    setWarningOpen(false);
    onDecision({ kind: 'deferred' });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: M3_EASING_ENTER }}
      className="w-full flex flex-col items-stretch gap-6"
    >
      {/* Panel — stage-panel owns radius, border, and surface bg; redeclaring them would bypass density tokens. */}
      <div className="stage-panel p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck
            className="h-5 w-5 text-[var(--stage-accent)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <h2 className="text-base font-medium text-[var(--stage-text-primary)]">
            Set up recovery guardians
          </h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[var(--stage-text-secondary)]">
          Guardians help you regain access if you lose your passkey. Choose people you
          trust &mdash; typically {GUARDIAN_MIN_THRESHOLD} to {GUARDIAN_MAX_THRESHOLD}{' '}
          people.
        </p>

        {/* Threshold selector */}
        <div className="mt-5">
          <div role="radiogroup" aria-label="Recovery threshold" className="flex flex-wrap gap-2">
            {THRESHOLD_OPTIONS.map((opt) => {
              const active = threshold === opt.k;
              return (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!opt.enabled || submittingDecision}
                  onClick={() => {
                    if (!opt.enabled) return;
                    setThreshold(opt.k);
                  }}
                  className={
                    active
                      ? 'stage-btn stage-btn-primary px-4'
                      : 'stage-btn stage-btn-secondary px-4'
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--stage-text-secondary)]">
            Any {threshold} of your guardians can help you back in.
          </p>
        </div>

        {/* Guardian list */}
        <div className="mt-6 space-y-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {guardians.map((g) => (
              <motion.div
                key={g.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6, transition: { duration: 0.12, ease: M3_EASING_EXIT } }}
                transition={STAGE_LIGHT}
                className="flex items-center gap-3 rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] px-4 py-3"
              >
                <UserRound
                  className="h-4 w-4 text-[var(--stage-text-secondary)]"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--stage-text-primary)]">
                    {g.name || g.email}
                  </p>
                  {g.name ? (
                    <p className="truncate text-xs text-[var(--stage-text-secondary)]">
                      {g.email}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(g.id)}
                  disabled={isRemoving || submittingDecision}
                  aria-label={`Remove ${g.name || g.email}`}
                  className="rounded-lg p-1.5 text-[var(--stage-text-secondary)] transition-colors hover:bg-[oklch(1_0_0_/_0.08)] hover:text-[var(--color-unusonic-error)] disabled:opacity-45"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {loaded && guardians.length === 0 ? (
            <p className="text-xs text-[var(--stage-text-secondary)]">
              No guardians yet. Add at least {threshold} to continue.
            </p>
          ) : null}
        </div>

        {/* Add form */}
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <input
            type="text"
            value={formName}
            onChange={(e) => {
              setFormName(e.target.value);
              setFormError(null);
            }}
            placeholder="Name (optional)"
            className="stage-input"
            disabled={isAdding || submittingDecision}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <input
            type="email"
            value={formEmail}
            onChange={(e) => {
              setFormEmail(e.target.value);
              setFormError(null);
            }}
            placeholder="guardian@example.com"
            className="stage-input"
            disabled={isAdding || submittingDecision}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={isAdding || submittingDecision || formEmail.trim().length === 0}
            className="stage-btn stage-btn-secondary px-4"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Plus className="h-4 w-4" strokeWidth={1.5} />
            )}
            {isAdding ? 'Adding' : 'Add'}
          </button>
        </div>

        {formError ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={STAGE_MEDIUM}
            className="mt-3 flex items-start gap-2 text-sm text-[var(--color-unusonic-error)]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="leading-relaxed">{formError}</span>
          </motion.div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={() => setWarningOpen(true)}
          disabled={submittingDecision}
          className="stage-btn stage-btn-ghost px-5"
          data-testid="guardian-defer"
        >
          I&rsquo;ll set this up later
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={!thresholdMet || submittingDecision}
          className="stage-btn stage-btn-primary px-5"
          data-testid="guardian-continue"
        >
          {submittingDecision ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              Saving&hellip;
            </>
          ) : (
            'Continue with these guardians'
          )}
        </button>
      </div>

      <GuardianDeferralWarning
        open={warningOpen}
        submitting={submittingDecision}
        onCancel={() => {
          if (submittingDecision) return;
          setWarningOpen(false);
        }}
        onConfirmSkip={handleConfirmSkip}
      />
    </motion.div>
  );
}
