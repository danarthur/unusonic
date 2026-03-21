/**
 * Pathfinding Step 2: The Power Source (Tier Selection)
 * Foundation gatekeeper, Venue OS pms toggle, Autonomous SignalPay toggle
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
  signalPayEnabled: boolean;
  onSignalPayChange: (enabled: boolean) => void;
  projectCount?: number;
}

const FOUNDATION_PROJECT_LIMIT = 5;

export function TierStep({
  persona,
  selectedTier,
  onTierChange,
  pmsEnabled,
  onPmsChange,
  signalPayEnabled,
  onSignalPayChange,
  projectCount = 0,
}: TierStepProps) {
  const suggestedTier = persona ? TIER_PERSONA_MAP[persona] : 'foundation';
  const showPmsToggle = persona === 'venue_brand';
  const showSignalPayToggle = selectedTier === 'autonomous';

  const foundationGated = projectCount >= FOUNDATION_PROJECT_LIMIT;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-xl font-light text-ink tracking-tight">
          Plan
        </h2>
        <p className="text-sm text-ink-muted mt-1.5 font-light">
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
              whileHover={!isFoundationGated ? { scale: 1.02 } : {}}
              whileTap={!isFoundationGated ? { scale: 0.98 } : {}}
              transition={springConfig}
              className={`
                relative p-5 rounded-xl border-2 text-left
                transition-all duration-300
                ${isSelected
                  ? 'border-[var(--color-neon-blue)] bg-[color:var(--color-neon-blue)/0.1]'
                  : isFoundationGated
                    ? 'border-ink/10 bg-ink/5 opacity-60 cursor-not-allowed'
                    : 'border-[var(--glass-border)] hover:border-[var(--glass-border-hover)]'
                }
              `}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${isSelected ? 'text-[var(--color-neon-blue)]' : 'text-ink'}`}>
                    {cfg.label}
                  </span>
                  {isSuggested && (
                    <span className="text-[10px] uppercase tracking-wider text-ink-muted">
                      Suggested
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-muted">{cfg.price}</p>
                {isFoundationGated && (
                  <p className="text-[10px] text-[var(--color-signal-warning)] mt-1">
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
          className="p-4 rounded-xl border border-[var(--glass-border)] bg-ink/[0.02]"
        >
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-ink">PMS integration (2-way sync)</span>
            <button
              type="button"
              role="switch"
              aria-checked={pmsEnabled}
              onClick={() => onPmsChange(!pmsEnabled)}
              className={`
                relative w-11 h-6 rounded-full transition-colors
                ${pmsEnabled ? 'bg-neon-blue' : 'bg-ink/20'}
              `}
            >
              <motion.span
                layout
                transition={springConfig}
                className="absolute top-1 left-1 w-4 h-4 rounded-full bg-ink"
                style={{ x: pmsEnabled ? 20 : 0 }}
              />
            </button>
          </label>
        </motion.div>
      )}

      {showSignalPayToggle && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={springConfig}
            className={`
              p-5 rounded-2xl border-2 transition-all duration-300
              ${signalPayEnabled
                ? 'border-[var(--color-signal-success)] bg-[color:var(--color-signal-success)/0.1] shadow-lg'
                : 'border-[var(--glass-border)] bg-ink/[0.02]'
              }
            `}
        >
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${signalPayEnabled ? 'bg-[color:var(--color-signal-success)/0.2]' : 'bg-ink/5'}`}>
              <Zap className={`w-5 h-5 ${signalPayEnabled ? 'text-[var(--color-signal-success)]' : 'text-ink-muted'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-ink">
                    SignalPay
                  </p>
                  <p className="text-xs text-ink-muted mt-1 font-light">
                    Auto-billing for AI agents ($1/resolution).
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={signalPayEnabled}
                  onClick={() => onSignalPayChange(!signalPayEnabled)}
                  className={`
                    flex-shrink-0 relative w-12 h-7 rounded-full transition-colors
                    ${signalPayEnabled ? 'bg-[var(--color-signal-success)] shadow-lg' : 'bg-ink/20'}
                  `}
                >
                  <motion.span
                    layout
                    transition={springConfig}
                    className="absolute top-1 left-1 w-5 h-5 rounded-full bg-ink shadow"
                    style={{ x: signalPayEnabled ? 22 : 0 }}
                  />
                </button>
              </label>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
