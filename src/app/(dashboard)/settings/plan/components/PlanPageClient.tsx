'use client';

import { useState, useTransition, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Sparkles, ArrowUp, ArrowDown } from 'lucide-react';
import {
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
  type UserPersona,
} from '@/features/onboarding/model/subscription-types';
import { TIER_CONFIG, type TierSlug } from '@/shared/lib/tier-config';
import { updateWorkspacePlan } from '../actions';
import type { WorkspaceUsage } from '../actions';
import {
  STAGE_MEDIUM,
  STAGE_HEAVY,
  M3_EASING_ENTER,
  STAGE_STAGGER_CHILDREN,
} from '@/shared/lib/motion-constants';
import { UsageBar } from './UsageBar';

/* ─── Constants ──────────────────────────────────────────────────────────── */

const TIER_ORDER: TierSlug[] = ['foundation', 'growth', 'studio'];

const TIER_RANK: Record<TierSlug, number> = {
  foundation: 0,
  growth: 1,
  studio: 2,
};

const AION_LABELS: Record<string, string> = {
  passive: 'Suggestions and alerts',
  active: 'Drafts and recommendations',
  autonomous: 'Autonomous actions',
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function getRecommendedTier(persona: UserPersona | null): SubscriptionTier {
  if (!persona) return 'foundation';
  for (const tier of TIER_ORDER) {
    if (SUBSCRIPTION_TIERS[tier].suggestedPersonas.includes(persona)) {
      return tier;
    }
  }
  return 'foundation';
}

function formatPrice(cents: number): string {
  return `$${cents / 100}`;
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface PlanPageClientProps {
  currentTier: SubscriptionTier;
  persona: UserPersona | null;
  workspaceName: string;
  workspaceSlug: string;
  isOwner: boolean;
  usage: WorkspaceUsage | null;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export function PlanPageClient({
  currentTier,
  persona,
  workspaceName,
  isOwner,
  usage,
}: PlanPageClientProps) {
  const [activeTier, setActiveTier] = useState<SubscriptionTier>(currentTier);
  const [successTier, setSuccessTier] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDowngrade, setConfirmDowngrade] = useState<TierSlug | null>(null);
  const [isPending, startTransition] = useTransition();
  const recommendedTier = getRecommendedTier(persona);

  const handleSwitch = useCallback(
    (tier: SubscriptionTier) => {
      if (tier === activeTier || isPending || !isOwner) return;

      const isDowngrade = TIER_RANK[tier] < TIER_RANK[activeTier];

      // For downgrades, require confirmation
      if (isDowngrade && confirmDowngrade !== tier) {
        setConfirmDowngrade(tier);
        return;
      }

      setError(null);
      setConfirmDowngrade(null);
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
    },
    [activeTier, isPending, isOwner, confirmDowngrade],
  );

  const cancelDowngrade = useCallback(() => setConfirmDowngrade(null), []);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          Plan
        </h2>
        <p className="text-sm text-[var(--stage-text-secondary)]">
          {workspaceName ? `${workspaceName} workspace` : 'Your workspace'} ·{' '}
          {isOwner
            ? 'You can change this anytime.'
            : 'Only workspace owners can change the plan.'}
        </p>
      </div>

      {/* Current plan usage summary */}
      {usage && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: M3_EASING_ENTER } }}
          className="stage-panel p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)]">
              Usage
            </h3>
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--stage-accent)] border border-[var(--stage-border-hover)] bg-[var(--stage-surface)] px-2 py-0.5 rounded-full">
              {TIER_CONFIG[activeTier].label}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UsageBar
              current={usage.seatUsage}
              limit={usage.seatLimit}
              label="Team seats"
            />
            <UsageBar
              current={usage.showUsage}
              limit={usage.showLimit}
              label="Active shows"
            />
          </div>
        </motion.div>
      )}

      {/* Aion recommendation banner */}
      {persona && recommendedTier !== activeTier && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: M3_EASING_ENTER } }}
          className="flex items-start gap-3 stage-panel-nested px-4 py-3"
        >
          <Sparkles
            className="w-4 h-4 text-[var(--stage-accent)] mt-0.5 shrink-0"
            strokeWidth={1.5}
          />
          <p className="text-sm text-[var(--stage-text-primary)]/80">
            Aion recommends{' '}
            <span className="text-[var(--stage-text-primary)] font-medium">
              {SUBSCRIPTION_TIERS[recommendedTier].label}
            </span>{' '}
            based on your workspace profile.{' '}
            {isOwner && (
              <button
                type="button"
                onClick={() => handleSwitch(recommendedTier)}
                className="text-[var(--stage-accent)] hover:brightness-[1.06] transition-[filter]"
              >
                Switch now
              </button>
            )}
          </p>
        </motion.div>
      )}

      {/* Tier cards */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: STAGE_STAGGER_CHILDREN } },
        }}
      >
        {TIER_ORDER.map((tierId) => {
          const tierData = SUBSCRIPTION_TIERS[tierId];
          const config = TIER_CONFIG[tierId];
          const isCurrent = tierId === activeTier;
          const isRecommended = tierId === recommendedTier;
          const isSuccess = tierId === successTier;
          const isUpgrade = TIER_RANK[tierId] > TIER_RANK[activeTier];
          const isDowngrade = TIER_RANK[tierId] < TIER_RANK[activeTier];
          const isConfirmingDowngrade = confirmDowngrade === tierId;

          return (
            <motion.div
              key={tierId}
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: M3_EASING_ENTER } },
              }}
              className={`relative flex flex-col stage-panel p-6 ${
                isCurrent
                  ? 'ring-1 ring-[var(--stage-border-hover)]'
                  : ''
              }`}
            >
              {/* Badges */}
              <div className="flex items-center gap-2 mb-4 min-h-[1.5rem]">
                {isCurrent && (
                  <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--stage-accent)] border border-[var(--stage-border-hover)] bg-[var(--stage-surface)] px-2 py-0.5 rounded-full">
                    Current plan
                  </span>
                )}
                {isRecommended && !isCurrent && (
                  <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-primary)]/60 border border-[var(--stage-border)] bg-[var(--stage-surface-elevated)] px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" strokeWidth={1.5} />
                    Aion pick
                  </span>
                )}
              </div>

              {/* Tier info */}
              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-base font-medium tracking-tight text-[var(--stage-text-primary)]">
                    {tierData.label}
                  </p>
                  <p className="text-2xl font-semibold tracking-tight text-[var(--stage-text-primary)] mt-1">
                    {tierData.price}
                  </p>
                </div>

                {/* Structured limits */}
                <div className="space-y-2 text-sm text-[var(--stage-text-secondary)]">
                  <div className="flex items-center justify-between">
                    <span>Team seats</span>
                    <span className="font-medium text-[var(--stage-text-primary)] tabular-nums">
                      {config.includedSeats} included
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Active shows</span>
                    <span className="font-medium text-[var(--stage-text-primary)] tabular-nums">
                      {config.maxActiveShows === null ? 'Unlimited' : config.maxActiveShows}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Extra seat</span>
                    <span className="font-medium text-[var(--stage-text-primary)] tabular-nums">
                      {formatPrice(config.extraSeatPriceCents)}/mo
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Aion</span>
                    <span className="font-medium text-[var(--stage-text-primary)]">
                      {AION_LABELS[config.aionMode]}
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-[var(--stage-border)]" />

                {/* Feature highlights */}
                <ul className="space-y-2">
                  {tierData.highlights.map((h) => (
                    <li
                      key={h}
                      className="flex items-start gap-2 text-sm text-[var(--stage-text-secondary)]"
                    >
                      <Check className="w-3.5 h-3.5 text-[var(--stage-text-primary)]/40 mt-0.5 shrink-0" />
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
                        transition={STAGE_HEAVY}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full text-sm font-medium text-unusonic-success"
                      >
                        <Check className="w-4 h-4" />
                        Switched
                      </motion.div>
                    ) : (
                      <motion.div
                        key="current"
                        transition={STAGE_MEDIUM}
                        className="w-full py-2.5 rounded-full text-sm font-medium text-center text-[var(--stage-text-primary)]/40 border border-[var(--stage-border)]"
                      >
                        Current plan
                      </motion.div>
                    )}
                  </AnimatePresence>
                ) : isConfirmingDowngrade ? (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--stage-text-secondary)]">
                      Downgrading may limit access to features. Are you sure?
                    </p>
                    <div className="flex gap-2">
                      <motion.button
                        type="button"
                        onClick={() => handleSwitch(tierId)}
                        disabled={isPending}
                        transition={STAGE_MEDIUM}
                        className="flex-1 py-2 rounded-full text-xs font-medium border border-[var(--stage-border)] text-unusonic-warning hover:border-[var(--stage-border-focus)] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5"
                      >
                        {isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Confirm'
                        )}
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={cancelDowngrade}
                        transition={STAGE_MEDIUM}
                        className="flex-1 py-2 rounded-full text-xs font-medium border border-[var(--stage-border)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[var(--stage-border-focus)]"
                      >
                        Cancel
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  <motion.button
                    type="button"
                    onClick={() => handleSwitch(tierId)}
                    disabled={isPending || !isOwner}
                    transition={STAGE_MEDIUM}
                    className="w-full py-2.5 rounded-full text-sm font-medium border border-[var(--stage-border)] text-[var(--stage-text-primary)]/70 hover:text-[var(--stage-text-primary)] hover:border-[var(--stage-border-focus)] hover:bg-[var(--stage-surface-hover)] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
                  >
                    {isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        {isUpgrade && <ArrowUp className="w-3.5 h-3.5" />}
                        {isDowngrade && <ArrowDown className="w-3.5 h-3.5" />}
                        {isUpgrade ? 'Upgrade' : 'Downgrade'} to {tierData.label}
                      </>
                    )}
                  </motion.button>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="text-sm text-unusonic-error"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
