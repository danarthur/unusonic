'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { UNUSONIC_PHYSICS, M3_EASING_ENTER } from '@/shared/lib/motion-constants';

const STORAGE_KEY = 'unusonic_plan_prompt_dismissed';

export function PlanPromptBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: M3_EASING_ENTER } }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
          className="w-full"
        >
          <div className="liquid-card rounded-2xl border border-[var(--glass-border)] px-5 py-4 flex items-center gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-neon-blue/10 shrink-0">
              <Sparkles className="w-4 h-4 text-neon-blue" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium tracking-tight text-ceramic">
                Aion has a plan recommendation for you
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                Review your options — switch anytime in settings.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/settings/plan"
                onClick={dismiss}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-neon-blue text-obsidian hover:brightness-110 transition-colors"
              >
                Review plan
                <ArrowRight className="w-3 h-3" />
              </Link>
              <motion.button
                type="button"
                onClick={dismiss}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={UNUSONIC_PHYSICS}
                aria-label="Dismiss"
                className="p-1.5 rounded-lg text-ink-muted hover:text-ceramic hover:bg-ink/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
