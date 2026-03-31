'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';

/**
 * Reusable marketing landing content (brand + CTAs, spring physics).
 * Not used at / — root redirects to /login (Option B). Use this when you add
 * a dedicated marketing route (e.g. /welcome or /home).
 */
export function LandingContent() {
  return (
    <motion.div
      className="relative z-10 flex flex-col items-center text-center px-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_HEAVY}
    >
      <LivingLogo status="idle" size="xl" className="mb-8 text-[var(--stage-text-primary)]" />
      <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-[var(--stage-text-primary)] mb-2">
        Unusonic
      </h1>
      <p className="text-lg md:text-xl text-[var(--stage-text-secondary)] font-light leading-relaxed mb-1">
        Event production, refined
      </p>
      <p className="text-sm text-[var(--stage-text-secondary)]/80 font-light leading-relaxed mb-12 max-w-md mx-auto">
        Events, talent, and production in one place
      </p>

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
        <motion.div transition={STAGE_HEAVY}>
          <Link
            href="/login"
            className="stage-panel block px-6 py-3 rounded-xl text-sm font-medium text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)] transition-colors"
          >
            Sign in
          </Link>
        </motion.div>
        <motion.div transition={STAGE_HEAVY}>
          <Link
            href="/signup"
            className="stage-panel block px-6 py-3 rounded-xl text-sm font-medium text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[var(--stage-accent-muted)] transition-colors"
          >
            Create account
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
