/**
 * WebsiteStep – Ghost Writer 3-phase flow (Gemini pattern).
 * Phase 1: Minimal "magic" input. Phase 2: Aion thinking (pulse + single-line status).
 * Phase 3: Proposal reveal (pre-filled Genesis card); user confirms, no form feel.
 * @module features/onboarding/ui/website-step
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Building2 } from 'lucide-react';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { TierSelector, GENESIS_TIERS, type GenesisTierId } from '@/features/org-identity/ui/TierSelector';
import { scoutCompanyForOnboarding } from '../actions/scout-for-onboarding';
import type { ScoutResult } from '@/features/intelligence';
import type { UserPersona } from '../model/subscription-types';
import { PATHFINDING_PERSONAS } from '../model/subscription-types';

import { STAGE_HEAVY } from '@/shared/lib/motion-constants';
const springConfig = STAGE_HEAVY;

/** Single-line status messages during Phase 2 (cycles to show Aion is working).
 *  When the scan crosses `ESCALATION_MS` without returning we swap in the
 *  "still thinking" tail so slow networks don't look like silent failures. */
const THINKING_STATUSES = [
  'Scanning your site…',
  'Detecting industry…',
  'Extracting brand…',
  'Calibrating tier…',
];
const ESCALATED_STATUS = 'Still thinking — slow network, hang on…';
const ESCALATION_MS = 15_000;
const TIMEOUT_MS = 30_000;

export interface ScoutOnboardingPayload {
  data: ScoutResult;
  suggestedPersona: UserPersona;
  suggestedTier: GenesisTierId;
}

interface WebsiteStepProps {
  onUseScout: (payload: ScoutOnboardingPayload) => void;
  onSkip: () => void;
}

export function WebsiteStep({ onUseScout, onSkip }: WebsiteStepProps) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'proposal'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoutOnboardingPayload | null>(null);
  const [selectedTier, setSelectedTier] = useState<GenesisTierId>('scout');
  const [statusIndex, setStatusIndex] = useState(0);
  const [escalated, setEscalated] = useState(false);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const escalationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
      if (escalationTimeoutRef.current) clearTimeout(escalationTimeoutRef.current);
    };
  }, []);

  const handleAutoBuild = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Enter a website URL.');
      return;
    }
    setError(null);
    setPhase('thinking');
    setStatusIndex(0);
    setEscalated(false);
    statusIntervalRef.current = setInterval(() => {
      setStatusIndex((i) => (i + 1) % THINKING_STATUSES.length);
    }, 1200);
    escalationTimeoutRef.current = setTimeout(() => {
      setEscalated(true);
    }, ESCALATION_MS);

    const scoutPromise = scoutCompanyForOnboarding(trimmed);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
    const scoutResult = await Promise.race([scoutPromise, timeoutPromise]);

    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    if (escalationTimeoutRef.current) {
      clearTimeout(escalationTimeoutRef.current);
      escalationTimeoutRef.current = null;
    }

    if (!scoutResult) {
      setError('The scan took too long. Try again or skip this step.');
      setPhase('idle');
      return;
    }

    if (!scoutResult.success || !scoutResult.data) {
      setError(scoutResult.error ?? 'Unable to resolve that site.');
      setPhase('idle');
      return;
    }
    const suggestedTier = scoutResult.suggestedTier ?? 'scout';
    setSelectedTier(suggestedTier);
    setResult({
      data: scoutResult.data,
      suggestedPersona: scoutResult.suggestedPersona ?? 'solo_professional',
      suggestedTier,
    });
    setPhase('proposal');
  };

  const handleConfirm = () => {
    if (result) onUseScout({ ...result, suggestedTier: selectedTier });
  };

  const handleTryAnother = () => {
    setResult(null);
    setPhase('idle');
    setError(null);
  };

  const personaLabel = result ? PATHFINDING_PERSONAS[result.suggestedPersona]?.label ?? 'Solo Planner' : '';
  const tierLabel = result ? GENESIS_TIERS.find((t) => t.id === result.suggestedTier)?.name ?? 'Scout' : '';

  /** Phase order for directional slide transitions: advancing = right-to-left, going back = left-to-right. */
  const PHASE_ORDER: Record<'idle' | 'thinking' | 'proposal', number> = { idle: 0, thinking: 1, proposal: 2 };
  const prevPhaseRef = useRef<'idle' | 'thinking' | 'proposal'>(phase);
  const phaseDirection = useRef<1 | -1>(1);
  if (prevPhaseRef.current !== phase) {
    phaseDirection.current = PHASE_ORDER[phase] > PHASE_ORDER[prevPhaseRef.current] ? 1 : -1;
    prevPhaseRef.current = phase;
  }
  const slideX = phaseDirection.current * 24;
  const phaseTransition = { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      className="w-full max-w-2xl mx-auto flex flex-col items-center"
    >
      <AnimatePresence mode="wait">
        {/* Phase 1: Magic input (clean state) — heading is in shell; liquid-glass shimmer input */}
        {phase === 'idle' && (
          <motion.div
            key="phase-idle"
            initial={{ opacity: 0, x: slideX }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -slideX }}
            transition={phaseTransition}
            className="w-full flex flex-col items-center gap-6 text-center"
          >
            <div className="w-full max-w-md space-y-4">
              <label htmlFor="website-url" className="sr-only">
                Website URL
              </label>
              <div className="liquid-glass-input w-full h-[68px] mx-auto cursor-text">
                <div className="liquid-glass-input-inner flex items-center h-full w-full rounded-[9999px] pl-5 pr-4">
                  <input
                    id="website-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAutoBuild()}
                    placeholder="yourcompany.com"
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] text-base font-sans caret-[var(--stage-accent)]"
                    data-lpignore="true"
                    data-form-type="other"
                    data-1p-ignore
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <motion.button
                  type="button"
                  onClick={() => url.trim() && handleAutoBuild()}
                  transition={springConfig}
                  disabled={!url.trim()}
                  aria-disabled={!url.trim()}
                  className={`btn-sheen-hover relative overflow-hidden flex-1 min-w-[140px] py-3 rounded-full font-medium text-sm tracking-tight text-[var(--stage-text-primary)] border border-[oklch(1_0_0/0.1)] shadow-[0_4px_24px_-1px_oklch(0_0_0/0.25),inset_0_1px_0_0_oklch(1_0_0/0.08)] bg-[var(--stage-accent)] flex items-center justify-center transition-colors ${!url.trim() ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[oklch(1_0_0_/_0.08)]'}`}
                >
                  <span className="relative z-10">Build with Aion</span>
                </motion.button>
                <motion.button
                  type="button"
                  onClick={onSkip}
                  transition={springConfig}
                  className="py-3 px-5 rounded-full font-medium text-sm text-[var(--stage-text-primary)]/90 border border-[oklch(1_0_0_/_0.08)]/40 hover:bg-[oklch(1_0_0_/_0.10)] hover:border-[oklch(1_0_0_/_0.08)]/60 transition-[background-color,border-color]"
                >
                  Configure manually
                </motion.button>
              </div>
            </div>
            {error && <p className="text-sm text-unusonic-error">{error}</p>}
          </motion.div>
        )}

        {/* Phase 2: Thinking (pulse + single-line status) */}
        {phase === 'thinking' && (
          <motion.div
            key="phase-thinking"
            initial={{ opacity: 0, x: slideX }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -slideX }}
            transition={phaseTransition}
            className="w-full flex flex-col items-center justify-center gap-6 py-8"
          >
            <div className="stage-panel liquid-levitation rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] p-8 flex flex-col items-center gap-6 shadow-[0_4px_24px_-1px_oklch(0_0_0/0.2),inset_0_1px_0_0_oklch(1_0_0/0.06)]">
              <LivingLogo status="loading" size="xl" className="text-[var(--stage-text-primary)]" />
              <p className="text-sm text-[var(--stage-text-tertiary)] min-h-[1.25rem] text-center max-w-xs">
                {escalated ? ESCALATED_STATUS : THINKING_STATUSES[statusIndex]}
              </p>
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={springConfig}
              className="text-center w-full max-w-xs"
            >
              <p className="text-xs text-[var(--stage-text-primary)]/40 font-mono truncate">{url.trim()}</p>
            </motion.div>
            {/* Skeleton preview — shape of the proposal card */}
            <div className="w-full stage-panel rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] p-6 opacity-50">
              <div className="flex items-center gap-4 mb-4">
                <div className="size-14 rounded-xl bg-[oklch(1_0_0_/_0.10)] stage-skeleton shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 rounded-md bg-[oklch(1_0_0_/_0.10)] stage-skeleton w-3/4" />
                  <div className="h-3 rounded-md bg-[oklch(1_0_0_/_0.10)] stage-skeleton w-1/2" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-6 rounded-full bg-[oklch(1_0_0_/_0.10)] stage-skeleton w-20" />
                <div className="h-6 rounded-full bg-[oklch(1_0_0_/_0.10)] stage-skeleton w-16" />
                <div className="h-6 rounded-full bg-[oklch(1_0_0_/_0.10)] stage-skeleton w-24" />
              </div>
            </div>
          </motion.div>
        )}

        {/* Phase 3: Proposal (pre-filled card; user confirms) */}
        {phase === 'proposal' && result && (
          <motion.div
            key="phase-proposal"
            initial={{ opacity: 0, x: slideX }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -slideX }}
            transition={phaseTransition}
            className="w-full stage-panel liquid-levitation rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] p-6 md:p-8 flex flex-col gap-6 md:gap-8"
          >
            <p className="text-xs uppercase tracking-widest text-[var(--stage-text-tertiary)]/60">
              Aion prepared this from your site — review and confirm.
            </p>

            {/* Profile */}
            <section>
              <span className="text-xs uppercase tracking-widest text-[var(--stage-text-tertiary)]/60">Profile</span>
              <div className="mt-3 flex items-center gap-4">
                {result.data.logoUrl ? (
                  <img
                    src={result.data.logoUrl}
                    alt=""
                    className="size-14 rounded-xl object-cover bg-[oklch(1_0_0_/_0.10)] shrink-0"
                  />
                ) : (
                  <div className="size-14 rounded-xl bg-[oklch(1_0_0_/_0.10)] flex items-center justify-center shrink-0">
                    <Building2 className="size-7 text-[var(--stage-text-secondary)]" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-medium tracking-tight text-[var(--stage-text-primary)] truncate">
                    {result.data.name?.trim() || 'Company'}
                  </p>
                  {result.data.website && (
                    <p className="text-sm text-[var(--stage-text-tertiary)] truncate">{result.data.website}</p>
                  )}
                </div>
              </div>
              <p className="mt-2 stage-label text-[var(--stage-text-tertiary)]/60">
                Suggested for you: <span className="text-[var(--stage-accent)] normal-case">{personaLabel} · {tierLabel}</span>
              </p>
            </section>

            {/* Commission level — Aion recommended badge on suggested tier */}
            <section>
              <TierSelector
                value={selectedTier}
                onChange={setSelectedTier}
                label="Commission level"
                suggestedTier={result.suggestedTier}
              />
            </section>

            {/* Actions — pill buttons like before */}
            <div className="flex flex-col gap-3 pt-2">
              <motion.button
                type="button"
                onClick={handleConfirm}
                transition={springConfig}
                className="flex-1 w-full py-3 rounded-full font-medium text-sm bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors flex items-center justify-center gap-2"
              >
                Confirm & Launch
                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </motion.button>
              <motion.button
                type="button"
                onClick={handleTryAnother}
                transition={springConfig}
                className="py-3 px-5 rounded-full font-medium text-sm text-[var(--stage-text-primary)]/90 border border-[oklch(1_0_0_/_0.08)]/40 hover:bg-[oklch(1_0_0_/_0.10)] hover:border-[oklch(1_0_0_/_0.08)]/60 transition-[background-color,border-color]"
              >
                Try another URL
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
