/**
 * Pathfinding Step 2: The Power Source (Tier Selection)
 * Foundation gatekeeper, Venue OS pms toggle, Autonomous UnusonicPay toggle
 * @module features/onboarding/ui/TierStep
 */

'use client';

import { motion } from 'framer-motion';
import { SUBSCRIPTION_TIERS, type SubscriptionTier, type UserPersona } from '../model/subscription-types';
import { Zap } from 'lucide-react';

const springConfig = { type: 'spring', stiffness: 300, damping: 30 } as const;

const TIER_PERSONA_MAP: Record<UserPersona, SubscriptionTier> = {
  solo_professional: 'foundation',
  agency_team: 'growth',
  venue_brand: 'venue_os',
};

interface TierStepProps {
  persona: UserPersona | null;
  selectedTier: SubscriptionTier;
  onTierChange: (tier: SubscriptionTier) => void;
  pmsEnabled: boolean;
  onPmsChange: (enabled: boolean) => void;
  unusonicPayEnabled: boolean;
  onUnusonicPayChange: (enabled: boolean) => void;
  projectCount?: number;
}

const FOUNDATION_PROJECT_LIMIT = 5;

export function TierStep({
  persona,
  selectedTier,
  onTierChange,
  pmsEnabled,
  onPmsChange,
  unusonicPayEnabled,
  onUnusonicPayChange,
  projectCount = 0,
}: TierStepProps) {
  const suggestedTier = persona ? TIER_PERSONA_MAP[persona] : 'foundation';
  const showPmsToggle = persona === 'venue_brand';
  const showUnusonicPayToggle = selectedTier === 'autonomous';

  const foundationGated = projectCount >= FOUNDATION_PROJECT_LIMIT;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-xl font-light text-[var(--stage-text-primary)] tracking-tight">
          Plan
        </h2>
        <p className="text-sm text-[var(--stage-text-secondary)] mt-1.5 font-light">
          Select tier. {persona && `Suggested: ${SUBSCRIPTION_TIERS[suggestedTier].label}`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.entries(SUBSCRIPTION_TIERS) as [SubscriptionTier, typeof SUBSCRIPTION_TIERS[SubscriptionTier]][]).map(([key, cfg]) => {
          const isSelected = selectedTier === key;
          const isSuggested = key === suggestedTier;
          const isFoundationGated = key === 'foundation' && foundationGated;
          return (
            <motion.button
              key={key}
              type="button"
              onClick={() => !isFoundationGated && onTierChange(key)}
              disabled={isFoundationGated}
              transition={springConfig}
              className={`
                relative p-5 rounded-xl border-2 text-left
                transition-all duration-300
                ${isSelected
                  ? 'border-[var(--stage-accent,oklch(0.72_0.14_55))] bg-[var(--stage-accent,oklch(0.72_0.14_55))]/10'
                  : isFoundationGated
                    ? 'border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.05)] opacity-60 cursor-not-allowed'
                    : 'border-[var(--stage-edge-subtle,oklch(1_0_0/0.03))] hover:border-[oklch(1_0_0/0.08)]'
                }
              `}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${isSelected ? 'text-[var(--stage-accent,oklch(0.72_0.14_55))]' : 'text-[var(--stage-text-primary)]'}`}>
                    {cfg.label}
                  </span>
                  {isSuggested && (
                    <span className="text-[10px] uppercase tracking-wider text-[var(--stage-text-secondary)]">
                      Suggested
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--stage-text-secondary)]">{cfg.price}</p>
                {isFoundationGated && (
                  <p className="text-[10px] text-[var(--color-unusonic-warning)] mt-1">
                    {projectCount} projects. Upgrade for more.
                  </p>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {showPmsToggle && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={springConfig}
          className="p-4 rounded-xl border border-[var(--stage-edge-subtle,oklch(1_0_0/0.03))] bg-[oklch(1_0_0_/_0.02)]"
        >
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-[var(--stage-text-primary)]">PMS integration (2-way sync)</span>
            <motion.button
              type="button"
              role="switch"
              aria-checked={pmsEnabled}
              onClick={() => onPmsChange(!pmsEnabled)}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={`
                relative w-11 h-6 rounded-full transition-colors
                ${pmsEnabled ? 'bg-[var(--stage-accent)]' : 'bg-[oklch(1_0_0_/_0.20)]'}
              `}
            >
              <motion.span
                layout
                transition={springConfig}
                className="absolute top-1 left-1 w-4 h-4 rounded-full bg-[var(--stage-text-primary)]"
                style={{ x: pmsEnabled ? 20 : 0 }}
              />
            </motion.button>
          </label>
        </motion.div>
      )}

      {showUnusonicPayToggle && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={springConfig}
            className={`
              p-5 rounded-[var(--stage-radius-nested,8px)] border-2 transition-all duration-300
              ${unusonicPayEnabled
                ? 'border-[var(--color-unusonic-success)] bg-[color:var(--color-unusonic-success)/0.1] shadow-lg'
                : 'border-[var(--stage-edge-subtle,oklch(1_0_0/0.03))] bg-[oklch(1_0_0_/_0.02)]'
              }
            `}
        >
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${unusonicPayEnabled ? 'bg-[color:var(--color-unusonic-success)/0.2]' : 'bg-[oklch(1_0_0_/_0.05)]'}`}>
              <Zap className={`w-5 h-5 ${unusonicPayEnabled ? 'text-[var(--color-unusonic-success)]' : 'text-[var(--stage-text-secondary)]'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-[var(--stage-text-primary)]">
                    UnusonicPay
                  </p>
                  <p className="text-[11px] text-[var(--stage-text-secondary)] mt-1 font-light">
                    Auto-billing for AI agents ($1/resolution).
                  </p>
                </div>
                <motion.button
                  type="button"
                  role="switch"
                  aria-checked={unusonicPayEnabled}
                  onClick={() => onUnusonicPayChange(!unusonicPayEnabled)}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className={`
                    flex-shrink-0 relative w-12 h-7 rounded-full transition-colors
                    ${unusonicPayEnabled ? 'bg-[var(--color-unusonic-success)] shadow-lg' : 'bg-[oklch(1_0_0_/_0.20)]'}
                  `}
                >
                  <motion.span
                    layout
                    transition={springConfig}
                    className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--stage-text-primary)] shadow"
                    style={{ x: unusonicPayEnabled ? 22 : 0 }}
                  />
                </motion.button>
              </label>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
