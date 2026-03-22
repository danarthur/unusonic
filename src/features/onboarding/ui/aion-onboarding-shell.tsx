/**
 * AionOnboardingShell
 * Unified Genesis-style layout for onboarding: feels like chatting with Aion.
 * LivingLogo + prompt + content + optional input.
 * @module features/onboarding/ui/aion-onboarding-shell
 */

'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LivingLogo, type LivingLogoStatus } from '@/shared/ui/branding/living-logo';
import { LogOut } from 'lucide-react';
import { signOutAction } from '@/features/auth/smart-login';
import {
  UNUSONIC_PHYSICS,
  GPU_STABILIZE,
  M3_DURATION_S,
  M3_EASING_ENTER,
} from '@/shared/lib/motion-constants';

interface AionOnboardingShellProps {
  /** Aion's conversational prompt (e.g. "What should we call you?") */
  prompt: string;
  /** Optional title above the prompt (e.g. "Welcome to Unusonic" when merged with name step) */
  welcomeTitle?: string;
  /** LivingLogo status for feedback states */
  logoStatus?: LivingLogoStatus;
  /** Optional layoutId for shared element transition (e.g. auth flow) */
  logoLayoutId?: string;
  /** Optional layoutId for prompt text (shared type continuity) */
  promptLayoutId?: string;
  /** When prompt is "Welcome to Unusonic", call after 1.2s micro-motion (animation-driven phase) */
  onWelcomeComplete?: () => void;
  /** If true, call onWelcomeComplete immediately (e.g. prefers-reduced-motion) */
  skipWelcomeHold?: boolean;
  /** Step index (0-based) and total */
  stepIndex: number;
  stepTotal: number;
  /** Main content (cards, form, etc.) */
  children: React.ReactNode;
  /** Optional footer slot (AionInput, buttons) */
  footer?: React.ReactNode;
  /** Optional back handler – when provided, shows minimal Back link */
  onBack?: () => void;
  /** Label for the back action (e.g. "Sign in" on first step, "Back" otherwise) */
  backLabel?: string;
  /** Optional "Sign in" action – when provided with onBack, shows both Back and Sign in (e.g. signup steps 1+) */
  onSignIn?: () => void;
  /** Hide the "1 of 3" step indicator in the footer */
  hideStepIndicator?: boolean;
  /** Hide sign out footer (e.g. during signup when user isn't logged in) */
  hideSignOut?: boolean;
  /** Optional wider content (e.g. "2xl" for website step with sliding card). */
  contentMaxWidth?: 'lg' | '2xl';
}

/** Liquid Ceramic: brief welcome then parallel liquid reveal (no 1.2s block). */
const WELCOME_HOLD_S = 0.4;

export function AionOnboardingShell({
  prompt,
  welcomeTitle,
  logoStatus = 'idle',
  logoLayoutId,
  promptLayoutId,
  onWelcomeComplete,
  skipWelcomeHold = false,
  stepIndex,
  stepTotal,
  children,
  footer,
  onBack,
  backLabel = 'Back',
  onSignIn,
  hideStepIndicator = false,
  hideSignOut = false,
  contentMaxWidth = 'lg',
}: AionOnboardingShellProps) {
  const isWelcome = prompt === 'Welcome to Unusonic' && !welcomeTitle;
  // Perceptual continuity: bind "thinking" to layout morph lifecycle (no arbitrary timer)
  const [isMorphing, setIsMorphing] = useState(false);
  const effectiveLogoStatus = isMorphing ? 'loading' : (logoStatus ?? 'idle');

  // When reduced motion: advance to name phase immediately (no 1.2s hold)
  useEffect(() => {
    if (isWelcome && onWelcomeComplete && skipWelcomeHold) {
      onWelcomeComplete();
    }
  }, [isWelcome, onWelcomeComplete, skipWelcomeHold]);

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-unusonic-void text-ceramic font-sans">
      <div className="fixed inset-0 pointer-events-none grain-overlay z-0" aria-hidden />

      <div className={contentMaxWidth === '2xl' ? 'z-10 w-full max-w-2xl flex flex-col items-center gap-8 relative px-4' : 'z-10 w-full max-w-lg flex flex-col items-center gap-8 relative px-4'}>
        {/* Brand anchor — optional layoutId for shared element transition */}
        {logoLayoutId ? (
          <motion.div
            layoutId={logoLayoutId}
            layout
            transition={UNUSONIC_PHYSICS}
            animate={{ scale: 1, opacity: 1 }}
            onAnimationStart={() => setIsMorphing(true)}
            onAnimationComplete={() => setIsMorphing(false)}
            style={{ ...GPU_STABILIZE, viewTransitionName: 'auth-logo', zIndex: 50 } as React.CSSProperties}
            className="flex items-center justify-center isolate relative"
          >
            <LivingLogo status={effectiveLogoStatus} size="xl" className="text-ceramic" />
          </motion.div>
        ) : (
          <motion.div
            animate={{ scale: 1, opacity: 1 }}
            transition={UNUSONIC_PHYSICS}
            style={{ ...GPU_STABILIZE, viewTransitionName: 'auth-logo', zIndex: 50 } as React.CSSProperties}
            className="flex items-center justify-center isolate relative"
          >
            <LivingLogo status={logoStatus} size="xl" className="text-ceramic" />
          </motion.div>
        )}

        {/* Aion prompt — optional welcomeTitle (merged Welcome + Name); cross-fade for prompt text */}
        <div className="relative w-full max-w-lg text-center space-y-1 min-h-[1.25rem]">
          {welcomeTitle ? (
            <p className="text-sm font-medium tracking-tight text-ceramic">
              {welcomeTitle}
            </p>
          ) : null}
          {isWelcome && onWelcomeComplete && !skipWelcomeHold ? (
            <motion.h1
              className="text-xs font-medium uppercase tracking-widest text-ink-muted"
              initial={{ y: 0, opacity: 1 }}
              animate={{ y: -10, opacity: 1 }}
              transition={{
                duration: WELCOME_HOLD_S,
                ease: 'easeOut',
              }}
              onAnimationComplete={onWelcomeComplete}
            >
              {prompt}
            </motion.h1>
          ) : isWelcome && skipWelcomeHold ? (
            <h1 className="text-xs font-medium uppercase tracking-widest text-ink-muted">
              {prompt}
            </h1>
          ) : (
            <AnimatePresence mode="wait">
              <motion.h1
                key={prompt}
                initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6 }}
                transition={{
                  duration: M3_DURATION_S,
                  ease: M3_EASING_ENTER,
                  filter: { duration: M3_DURATION_S * 0.6, ease: M3_EASING_ENTER },
                }}
                className="text-xs font-medium uppercase tracking-widest text-ink-muted gpu-accelerated"
              >
                {prompt}
              </motion.h1>
            </AnimatePresence>
          )}
        </div>

        {/* Content slot */}
        <div className="w-full flex flex-col items-center gap-6">{children}</div>

        {/* Optional footer (AionInput, CTA) — relative z-20 so input receives focus above sign-out area */}
        {footer && (
          <motion.div
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={UNUSONIC_PHYSICS}
            className="relative z-20 w-full max-w-lg"
          >
            {footer}
          </motion.div>
        )}

        {/* Back / Sign in */}
        <div className="flex items-center justify-start w-full max-w-lg mt-4">
          <div className="flex items-center gap-4">
            {onBack ? (
              <motion.button
                type="button"
                onClick={onBack}
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.98 }}
                className="text-xs text-ceramic/40 hover:text-ceramic/70 transition-colors"
              >
                {backLabel}
              </motion.button>
            ) : null}
            {onSignIn ? (
              <motion.button
                type="button"
                onClick={onSignIn}
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.98 }}
                className="text-xs text-ceramic/40 hover:text-ceramic/70 transition-colors"
              >
                Sign in
              </motion.button>
            ) : null}
          </div>
          {!hideStepIndicator ? (
            <div className="ml-auto flex items-center gap-1.5">
              {Array.from({ length: stepTotal }).map((_, i) => (
                <motion.div
                  key={i}
                  animate={i === stepIndex ? { scale: 1.25 } : { scale: 1 }}
                  transition={UNUSONIC_PHYSICS}
                  className={`rounded-full transition-colors duration-300 ${
                    i === stepIndex
                      ? 'w-1.5 h-1.5 bg-neon-blue'
                      : 'w-1.5 h-1.5 bg-ink/30'
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>

      </div>

      {/* Sign out footer — hidden during signup */}
      {!hideSignOut && (
      <div className="pointer-events-none absolute bottom-6 left-0 right-0 flex justify-center z-0">
        <form action={signOutAction} className="pointer-events-auto w-fit">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-ceramic/40 hover:text-ceramic/60 hover:bg-ink/5 transition-colors"
          >
            <LogOut className="w-3 h-3" />
            <span>Sign out</span>
          </button>
        </form>
      </div>
      )}
    </div>
  );
}
