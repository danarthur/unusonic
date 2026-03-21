/**
 * WebsiteStep – Ghost Writer 3-phase flow (Gemini pattern).
 * Phase 1: Minimal "magic" input. Phase 2: ION thinking (pulse + single-line status).
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
import { SIGNAL_PHYSICS, M3_DURATION_S, M3_EASING_ENTER, M3_EASING_EXIT } from '@/shared/lib/motion-constants';

/** Design system: The Signal Spring (20-design-system) */
const springConfig = { type: 'spring' as const, stiffness: 200, damping: 20 };

/** Single-line status messages during Phase 2 (cycles to show ION is working). */
const THINKING_STATUSES = [
  'Scanning your site…',
  'Detecting industry…',
  'Extracting brand…',
  'Calibrating tier…',
];

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
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
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
    statusIntervalRef.current = setInterval(() => {
      setStatusIndex((i) => (i + 1) % THINKING_STATUSES.length);
    }, 1200);

    const scoutResult = await scoutCompanyForOnboarding(trimmed);

    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: M3_DURATION_S, ease: M3_EASING_ENTER }}
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
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-ceramic placeholder:text-mercury text-base font-sans caret-neon-blue"
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
                  whileTap={url.trim() ? { scale: 0.98 } : undefined}
                  transition={springConfig}
                  aria-disabled={!url.trim()}
                  className={`btn-sheen-hover relative overflow-hidden flex-1 min-w-[140px] py-3 rounded-full font-medium text-sm tracking-tight text-ceramic border border-white/10 shadow-[0_4px_24px_-1px_oklch(0_0_0/0.25),inset_0_1px_0_0_oklch(1_0_0/0.08)] bg-neon-blue flex items-center justify-center ${!url.trim() ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <span className="relative z-10">Build with ION</span>
                </motion.button>
                <motion.button
                  type="button"
                  onClick={onSkip}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                  className="py-3 px-5 rounded-full font-medium text-sm text-ceramic/90 border border-[var(--color-mercury)]/40 hover:bg-ink/10 hover:border-[var(--color-mercury)]/60"
                >
                  Configure manually
                </motion.button>
              </div>
            </div>
            {error && <p className="text-sm text-signal-error">{error}</p>}
          </motion.div>
        )}

        {/* Phase 2: Thinking (pulse + single-line status) */}
        {phase === 'thinking' && (
          <motion.div
            key="phase-thinking"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: M3_DURATION_S, ease: M3_EASING_ENTER }}
            className="w-full flex flex-col items-center justify-center gap-8 py-12"
          >
            <div className="liquid-card liquid-levitation rounded-3xl border border-[var(--glass-border)] p-10 flex flex-col items-center gap-6 shadow-[0_4px_24px_-1px_oklch(0_0_0/0.2),inset_0_1px_0_0_var(--color-glass-highlight)]">
              <LivingLogo status="loading" size="xl" className="text-ceramic" />
              <p className="text-sm text-mercury min-h-[1.25rem] text-center max-w-xs">
                {THINKING_STATUSES[statusIndex]}
              </p>
            </div>
            <p className="text-xs uppercase tracking-widest text-mercury/50">
              {url}
            </p>
          </motion.div>
        )}

        {/* Phase 3: Proposal (pre-filled card; user confirms) */}
        {phase === 'proposal' && result && (
          <motion.div
            key="phase-proposal"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: M3_DURATION_S * 1.2, ease: M3_EASING_ENTER }}
            className="w-full liquid-card liquid-levitation rounded-3xl border border-[var(--glass-border)] p-6 md:p-8 flex flex-col gap-6 md:gap-8"
          >
            <p className="text-xs uppercase tracking-widest text-mercury/60">
              ION prepared this from your site — review and confirm.
            </p>

            {/* Profile */}
            <section>
              <span className="text-xs uppercase tracking-widest text-mercury/60">Profile</span>
              <div className="mt-3 flex items-center gap-4">
                {result.data.logoUrl ? (
                  <img
                    src={result.data.logoUrl}
                    alt=""
                    className="size-14 rounded-xl object-cover bg-ink/10 shrink-0"
                  />
                ) : (
                  <div className="size-14 rounded-xl bg-ink/10 flex items-center justify-center shrink-0">
                    <Building2 className="size-7 text-ink-muted" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-medium tracking-tight text-ceramic truncate">
                    {result.data.name?.trim() || 'Company'}
                  </p>
                  {result.data.website && (
                    <p className="text-sm text-mercury truncate">{result.data.website}</p>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[11px] uppercase tracking-widest text-mercury/60">
                Suggested for you: <span className="text-neon normal-case">{personaLabel} · {tierLabel}</span>
              </p>
            </section>

            {/* Commission level — ION recommended badge on suggested tier */}
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
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
                className="flex-1 w-full py-3 rounded-full font-medium text-sm bg-neon-blue text-obsidian hover:brightness-110 flex items-center justify-center gap-2"
              >
                Confirm & Launch
                <ArrowRight className="w-4 h-4" />
              </motion.button>
              <motion.button
                type="button"
                onClick={handleTryAnother}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
                className="py-3 px-5 rounded-full font-medium text-sm text-ceramic/90 border border-[var(--color-mercury)]/40 hover:bg-ink/10 hover:border-[var(--color-mercury)]/60"
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
