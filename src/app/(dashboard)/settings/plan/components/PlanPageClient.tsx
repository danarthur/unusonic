'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Sparkles, Lock } from 'lucide-react';
import {
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
  type UserPersona,
} from '@/features/onboarding/model/subscription-types';
import { updateWorkspacePlan } from '../actions';
import { UNUSONIC_PHYSICS, M3_EASING_ENTER } from '@/shared/lib/motion-constants';

const MAIN_TIERS: SubscriptionTier[] = ['foundation', 'growth', 'venue_os'];

function getRecommendedTier(persona: UserPersona | null): SubscriptionTier {
  if (!persona) return 'foundation';
  for (const tier of MAIN_TIERS) {
    if (SUBSCRIPTION_TIERS[tier].suggestedPersonas.includes(persona)) {
      return tier;
    }
  }
  return 'foundation';
}

interface PlanPageClientProps {
  currentTier: SubscriptionTier;
  persona: UserPersona | null;
  workspaceName: string;
  workspaceSlug: string;
  isOwner: boolean;
}

export function PlanPageClient({ currentTier, persona, workspaceName, workspaceSlug, isOwner }: PlanPageClientProps) {
  const [activeTier, setActiveTier] = useState<SubscriptionTier>(currentTier);
  const [successTier, setSuccessTier] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const recommendedTier = getRecommendedTier(persona);

  const handleSwitch = (tier: SubscriptionTier) => {
    if (tier === activeTier || isPending || !isOwner) return;
    setError(null);
    startTransition(async () => {
      const result = await updateWorkspacePlan(tier);
      if (result.ok) {
        setActiveTier(tier);
        setSuccessTier(tier);
        setTimeout(() => setSuccessTier(null), 2000);
      } else {
        setError(result.error ?? 'Failed to update plan');
      }
    });
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-tight text-ceramic">Plan</h2>
        <p className="text-sm text-ink-muted">
          {workspaceName ? `${workspaceName} workspace` : 'Your workspace'} ·{' '}
          {isOwner ? 'You can change this anytime.' : 'Only workspace owners can change the plan.'}
        </p>
      </div>

      {/* Aion recommendation banner */}
      {persona && recommendedTier !== activeTier && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: M3_EASING_ENTER } }}
          className="flex items-start gap-3 rounded-2xl border border-neon-blue/20 bg-neon-blue/5 px-4 py-3"
        >
          <Sparkles className="w-4 h-4 text-neon-blue mt-0.5 shrink-0" />
          <p className="text-sm text-ceramic/80">
            Aion recommends{' '}
            <span className="text-ceramic font-medium">{SUBSCRIPTION_TIERS[recommendedTier].label}</span>
            {' '}based on your workspace profile.{' '}
            {isOwner && (
              <button
                type="button"
                onClick={() => handleSwitch(recommendedTier)}
                className="text-neon-blue hover:text-neon-blue/80 transition-colors"
              >
                Switch now
              </button>
            )}
          </p>
        </motion.div>
      )}

      {/* Main tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MAIN_TIERS.map((tierId, i) => {
          const data = SUBSCRIPTION_TIERS[tierId];
          const isCurrent = tierId === activeTier;
          const isRecommended = tierId === recommendedTier;
          const isSuccess = tierId === successTier;

          return (
            <motion.div
              key={tierId}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: M3_EASING_ENTER, delay: i * 0.06 } }}
              className={`relative flex flex-col rounded-3xl border p-6 transition-colors duration-200 ${
                isCurrent
                  ? 'border-neon-blue/40 bg-neon-blue/5'
                  : 'border-[var(--glass-border)] bg-ink/[0.02] hover:bg-ink/5'
              }`}
            >
              {/* Badges */}
              <div className="flex items-center gap-2 mb-4 min-h-[1.5rem]">
                {isCurrent && (
                  <span className="text-[10px] font-medium uppercase tracking-widest text-neon-blue border border-neon-blue/30 bg-neon-blue/10 px-2 py-0.5 rounded-full">
                    Current plan
                  </span>
                )}
                {isRecommended && !isCurrent && (
                  <span className="text-[10px] font-medium uppercase tracking-widest text-ceramic/60 border border-[var(--glass-border)] bg-ink/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    Aion pick
                  </span>
                )}
              </div>

              {/* Tier info */}
              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-base font-medium tracking-tight text-ceramic">{data.label}</p>
                  <p className="text-2xl font-semibold tracking-tight text-ceramic mt-1">{data.price}</p>
                </div>

                <ul className="space-y-2">
                  {data.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-sm text-ink-muted">
                      <Check className="w-3.5 h-3.5 text-ceramic/40 mt-0.5 shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA */}
              <div className="mt-6">
                {isCurrent ? (
                  <AnimatePresence mode="wait">
                    {isSuccess ? (
                      <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={UNUSONIC_PHYSICS}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-medium text-unusonic-success"
                      >
                        <Check className="w-4 h-4" />
                        Switched
                      </motion.div>
                    ) : (
                      <motion.div
                        key="current"
                        className="w-full py-2.5 rounded-full text-sm font-medium text-center text-ceramic/40 border border-[var(--glass-border)]"
                      >
                        Current plan
                      </motion.div>
                    )}
                  </AnimatePresence>
                ) : (
                  <motion.button
                    type="button"
                    onClick={() => handleSwitch(tierId)}
                    disabled={isPending || !isOwner}
                    whileHover={isOwner ? { scale: 1.02 } : undefined}
                    whileTap={isOwner ? { scale: 0.98 } : undefined}
                    transition={UNUSONIC_PHYSICS}
                    className="w-full py-2.5 rounded-full text-sm font-medium border border-[var(--glass-border)] text-ceramic/70 hover:text-ceramic hover:border-ceramic/30 hover:bg-ink/5 transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
                  >
                    {isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      `Switch to ${data.label}`
                    )}
                  </motion.button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Studio URL */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: M3_EASING_ENTER, delay: 0.18 } }}
        className="space-y-3"
      >
        <div className="space-y-0.5">
          <h3 className="text-sm font-medium tracking-tight text-ceramic">Studio URL</h3>
          <p className="text-xs text-ink-muted">Your workspace&apos;s public handle on Unusonic.</p>
        </div>

        <div className="rounded-2xl border border-[var(--glass-border)] divide-y divide-[var(--glass-border)]">
          {/* Current handle */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">Handle</p>
              <p className="text-sm font-mono text-ceramic">
                unusonic.events/{workspaceSlug || '—'}
              </p>
            </div>
          </div>

          {/* Custom domain — locked */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">Custom domain</p>
              <p className="text-sm text-ceramic/40">
                {activeTier === 'venue_os'
                  ? 'Contact us to configure your custom domain.'
                  : 'Use your own domain — e.g. events.yourcompany.com'}
              </p>
            </div>
            {activeTier === 'venue_os' ? (
              <a
                href="mailto:hello@unusonic.com?subject=Custom domain setup"
                className="shrink-0 ml-4 px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--glass-border)] text-ceramic/70 hover:text-ceramic hover:border-ceramic/30 transition-colors"
              >
                Contact us
              </a>
            ) : (
              <div className="shrink-0 ml-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--glass-border)] text-xs text-ink-muted">
                <Lock className="w-3 h-3" />
                Venue OS
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Autonomous add-on */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: M3_EASING_ENTER, delay: 0.2 } }}
        className="rounded-3xl border border-[var(--glass-border)] bg-ink/[0.02] p-6 flex flex-col md:flex-row md:items-center gap-6"
      >
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-ceramic tracking-tight">Autonomous</p>
            <span className="text-[10px] font-medium uppercase tracking-widest text-ink-muted border border-[var(--glass-border)] px-2 py-0.5 rounded-full">
              Add-on
            </span>
          </div>
          <p className="text-sm text-ink-muted">{SUBSCRIPTION_TIERS.autonomous.price}</p>
          <p className="text-xs text-ink-muted/60 mt-2">
            Digital Workers, SignalPay, and Explainable AI — available on any plan. Contact us to enable.
          </p>
        </div>
        <a
          href="mailto:hello@unusonic.com?subject=Autonomous add-on"
          className="shrink-0 px-5 py-2.5 rounded-full text-sm font-medium border border-[var(--glass-border)] text-ceramic/70 hover:text-ceramic hover:border-ceramic/30 transition-colors text-center"
        >
          Contact us
        </a>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-unusonic-error"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
