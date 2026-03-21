'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';

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
      transition={SIGNAL_PHYSICS}
    >
      <LivingLogo status="idle" size="xl" className="mb-8 text-ceramic" />
      <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-ceramic mb-2">
        Signal
      </h1>
      <p className="text-lg md:text-xl text-mercury font-light leading-relaxed mb-1">
        Event production, refined
      </p>
      <p className="text-sm text-mercury/80 font-light leading-relaxed mb-12 max-w-md mx-auto">
        Events, talent, and production in one place
      </p>

      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={SIGNAL_PHYSICS}>
          <Link
            href="/login"
            className="liquid-card block px-6 py-3 rounded-xl text-sm font-medium text-ceramic hover:brightness-110 transition-[transform,filter]"
          >
            Sign in
          </Link>
        </motion.div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={SIGNAL_PHYSICS}>
          <Link
            href="/signup"
            className="liquid-card block px-6 py-3 rounded-xl text-sm font-medium text-ceramic border border-white/10 hover:brightness-110 transition-[transform,filter]"
          >
            Create account
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
