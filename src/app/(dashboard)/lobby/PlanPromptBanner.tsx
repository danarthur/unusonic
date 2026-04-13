'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ArrowRight, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

// ─── Storage keys ───────────────────────────────────────────────────────────

const PROMO_DISMISS_KEY = 'unusonic_plan_prompt_dismissed';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BillingWarning {
  type: 'billing_past_due' | 'seat_over_limit' | 'show_over_limit';
  title: string;
  subtitle: string;
  href: string;
  cta: string;
}

export interface PlanPromptBannerProps {
  /** Billing status from the workspace record */
  billingStatus?: string;
  /** Current team seat count */
  seatUsage?: number;
  /** Plan seat limit */
  seatLimit?: number;
  /** Current active show count */
  showUsage?: number;
  /** Plan show limit (null = unlimited) */
  showLimit?: number | null;
}

// ─── Warning derivation ─────────────────────────────────────────────────────

function deriveWarnings(props: PlanPromptBannerProps): BillingWarning[] {
  const warnings: BillingWarning[] = [];

  if (props.billingStatus === 'past_due') {
    warnings.push({
      type: 'billing_past_due',
      title: 'Your payment method needs attention',
      subtitle: 'Update your billing details to keep your workspace running smoothly.',
      href: '/settings/billing',
      cta: 'Update billing',
    });
  }

  if (
    props.seatUsage != null &&
    props.seatLimit != null &&
    props.seatUsage > props.seatLimit
  ) {
    warnings.push({
      type: 'seat_over_limit',
      title: `You have ${props.seatUsage} team members but your plan includes ${props.seatLimit}`,
      subtitle: 'Remove members or upgrade to continue adding.',
      href: '/settings/plan',
      cta: 'Review plan',
    });
  }

  if (
    props.showUsage != null &&
    props.showLimit != null &&
    props.showUsage > props.showLimit
  ) {
    warnings.push({
      type: 'show_over_limit',
      title: `You have ${props.showUsage} active shows but your plan allows ${props.showLimit}`,
      subtitle: 'Archive shows or upgrade to continue creating new ones.',
      href: '/settings/plan',
      cta: 'Review plan',
    });
  }

  return warnings;
}

// ─── Warning banner (not permanently dismissible) ───────────────────────────

function WarningBanner({ warning }: { warning: BillingWarning }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={STAGE_LIGHT}
      className="w-full"
    >
      <div className="stage-panel rounded-2xl px-5 py-4 flex items-center gap-4">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
          style={{
            background:
              warning.type === 'billing_past_due'
                ? 'oklch(0.65 0.18 20 / 0.12)'
                : 'oklch(0.80 0.16 85 / 0.12)',
          }}
        >
          <AlertTriangle
            className="w-4 h-4"
            style={{
              color:
                warning.type === 'billing_past_due'
                  ? 'var(--color-unusonic-error)'
                  : 'var(--color-unusonic-warning)',
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)]">
            {warning.title}
          </p>
          <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
            {warning.subtitle}
          </p>
        </div>

        <Link
          href={warning.href}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors shrink-0"
        >
          {warning.cta}
          <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function PlanPromptBanner(props: PlanPromptBannerProps) {
  const [promoVisible, setPromoVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = localStorage.getItem(PROMO_DISMISS_KEY);
    if (!dismissed) {
      queueMicrotask(() => setPromoVisible(true));
    }
  }, []);

  const dismissPromo = () => {
    localStorage.setItem(PROMO_DISMISS_KEY, '1');
    setPromoVisible(false);
  };

  const warnings = deriveWarnings(props);
  const hasWarnings = warnings.length > 0;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Billing and limit warnings — always shown when applicable, not permanently dismissible */}
      <AnimatePresence>
        {warnings.map((w) => (
          <WarningBanner key={w.type} warning={w} />
        ))}
      </AnimatePresence>

      {/* Promo banner — only shown when no warnings, permanently dismissible */}
      <AnimatePresence>
        {!hasWarnings && promoVisible && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={STAGE_LIGHT}
            className="w-full"
          >
            <div className="stage-panel rounded-2xl border border-[oklch(1_0_0_/_0.08)] px-5 py-4 flex items-center gap-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[var(--stage-accent)]/10 shrink-0">
                <Sparkles className="w-4 h-4 text-[var(--stage-accent)]" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)]">
                  Aion has a plan recommendation for you
                </p>
                <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
                  Review your options — switch anytime in settings.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/settings/plan"
                  onClick={dismissPromo}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors"
                >
                  Review plan
                  <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
                </Link>
                <button
                  type="button"
                  onClick={dismissPromo}
                  aria-label="Dismiss"
                  className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)] transition-[background-color,color]"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
