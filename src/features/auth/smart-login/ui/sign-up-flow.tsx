/**
 * Sign-Up Flow — 3-step genesis-style wizard (name → email → passkey).
 * Extracted from SmartLoginForm. Preserves all animation behavior.
 * @module features/auth/smart-login/ui/sign-up-flow
 */

'use client';

import { useTransition, useRef, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { signUpForPasskey } from '../api/actions';
import { registerPasskey } from '@/features/passkey-registration';
import { guessDeviceName } from '@/features/auth/passkey-management/lib/guess-device-name';
import { AionOnboardingShell } from '@/features/onboarding/ui/aion-onboarding-shell';
import { OnboardingChatInput } from '@/features/onboarding/ui/onboarding-chat-input';
import { AuthErrorBlock } from './auth-error-block';
import { useSignupSteps } from '../lib/use-signup-steps';
import type { AuthMode } from '../model/types';
import {
  STAGE_HEAVY,
  GPU_STABILIZE,
  M3_EASING_ENTER,
  M3_EASING_EXIT,
} from '@/shared/lib/motion-constants';

const SIGNUP_STEPS = 3;
const signupPrompts = [
  '', // index 0 unused — flow starts at step 1
  'What should we call you?',
  "What's your email?",
  'Create your passkey',
];

interface SignUpFlowProps {
  email: string;
  setEmail: (v: string) => void;
  fullName: string;
  setFullName: (v: string) => void;
  redirectTo?: string;
  defaultMode: AuthMode;
  fromSignIn: boolean;
  signupExiting: boolean;
  onExitComplete: () => void;
  onModeSwitch: (mode: AuthMode) => void;
  prefersReducedMotion: boolean;
}

export function SignUpFlow({
  email,
  setEmail,
  fullName,
  setFullName,
  redirectTo,
  defaultMode,
  fromSignIn,
  signupExiting,
  onExitComplete,
  onModeSwitch,
  prefersReducedMotion,
}: SignUpFlowProps) {
  const router = useRouter();
  const [isSignupPending, startTransition] = useTransition();
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [logoAcknowledging, setLogoAcknowledging] = useState(false);
  const logoAckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountCreatedRef = useRef(false);

  const {
    signupStep,
    setSignupStep,
    signupTransitionPhase,
    setSignupTransitionPhase,
    stepDirection,
    isTransitionName,
  } = useSignupSteps(defaultMode);

  // When switching from sign-in, start at name step
  useEffect(() => {
    if (fromSignIn && signupStep === 0) {
      setSignupStep(1);
      setSignupTransitionPhase('name');
    }
  }, [fromSignIn, signupStep, setSignupStep, setSignupTransitionPhase]);

  useEffect(() => {
    return () => {
      if (logoAckTimeoutRef.current) clearTimeout(logoAckTimeoutRef.current);
    };
  }, []);

  const handleSignupStepSubmit = useCallback(async () => {
    setPasskeyError(null);

    if (signupStep === 1 || isTransitionName) {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setPasskeyError('Please enter your name (at least 2 characters)');
        return;
      }
      setSignupTransitionPhase(null);
      const emailAlreadyValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      setSignupStep(emailAlreadyValid ? 3 : 2);
      if (logoAckTimeoutRef.current) clearTimeout(logoAckTimeoutRef.current);
      setLogoAcknowledging(true);
      logoAckTimeoutRef.current = setTimeout(() => {
        setLogoAcknowledging(false);
        logoAckTimeoutRef.current = null;
      }, 450);
    } else if (signupStep === 2) {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setPasskeyError('Please enter a valid email');
        return;
      }
      setSignupStep(3);
    } else if (signupStep === 3) {
      startTransition(async () => {
        try {
          // If account was already created on a previous attempt (passkey failed),
          // skip signup and go straight to passkey registration.
          if (!accountCreatedRef.current) {
            const result = await signUpForPasskey({
              email: email.trim().toLowerCase(),
              fullName: fullName.trim(),
            });
            if (!result.ok) {
              setPasskeyError(result.error ?? 'Failed to create account');
              return;
            }
            accountCreatedRef.current = true;
          }
          const passkeyResult = await registerPasskey({ friendlyName: guessDeviceName() });
          const postSignupDest = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/onboarding';
          if (!passkeyResult.ok) {
            // Passkey failed or was cancelled — stay on step 3 so user can retry.
            // Account is created but unusable without a passkey.
            setPasskeyError(passkeyResult.error || 'Passkey was not created. Please try again — you need a passkey to sign in.');
            return;
          }
          router.push(postSignupDest);
          router.refresh();
        } catch (e) {
          setPasskeyError(e instanceof Error ? e.message : 'Passkey registration failed. Try again.');
        }
      });
    }
  }, [signupStep, isTransitionName, fullName, email, redirectTo, router, setSignupStep, setSignupTransitionPhase, startTransition]);

  const isTransitionWelcome = fromSignIn && signupTransitionPhase === 'welcome';
  const effectivePrompt = isTransitionWelcome
    ? 'Welcome to Unusonic'
    : isTransitionName
      ? 'What should we call you?'
      : signupPrompts[signupStep];
  const effectiveStepIndex = isTransitionWelcome ? 0 : isTransitionName ? 1 : signupStep;
  const displayStepIndex = isTransitionName ? 0 : Math.max(0, effectiveStepIndex - 1);
  const isFirstStepForUser = signupStep <= 1 || isTransitionName;
  const showNameInput = signupStep === 1 || isTransitionName;
  const exitDuration = prefersReducedMotion ? 0.3 : 0.28;

  return (
    <div
      className={`fixed inset-0 z-20 flex items-center justify-center ${signupExiting ? 'pointer-events-none' : ''}`}
    >
      <motion.div
        key="signup-genesis"
        layout
        initial={
          fromSignIn && !signupExiting
            ? { opacity: 1, y: 0 }
            : { opacity: 0, y: 8 }
        }
        animate={
          signupExiting
            ? prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, y: -8 }
            : { opacity: 1, y: 0 }
        }
        exit={{ opacity: 0, y: -8 }}
        transition={
          signupExiting
            ? prefersReducedMotion
              ? { duration: exitDuration, ease: M3_EASING_EXIT }
              : STAGE_HEAVY
            : STAGE_HEAVY
        }
        onAnimationComplete={signupExiting ? onExitComplete : undefined}
        style={GPU_STABILIZE}
        className="h-full w-full"
      >
        <AionOnboardingShell
          prompt={effectivePrompt}
          welcomeTitle={isTransitionName ? 'Welcome to Unusonic' : undefined}
          logoStatus={isSignupPending ? 'loading' : logoAcknowledging ? 'loading' : 'idle'}
          logoLayoutId={fromSignIn && !signupExiting ? 'auth-logo' : undefined}
          onWelcomeComplete={() => setSignupTransitionPhase('name')}
          skipWelcomeHold={prefersReducedMotion}
          stepIndex={displayStepIndex}
          stepTotal={SIGNUP_STEPS}
          onBack={
            isFirstStepForUser
              ? () => onModeSwitch('signin')
              : () => {
                  setSignupStep((s) => s - 1);
                  setPasskeyError(null);
                  // Clear the "account created" flag so going back to step 2
                  // (email) and re-submitting doesn't skip signUpForPasskey and
                  // surface a misleading "already created" error.
                  accountCreatedRef.current = false;
                  if (logoAckTimeoutRef.current) {
                    clearTimeout(logoAckTimeoutRef.current);
                    setLogoAcknowledging(false);
                  }
                }
          }
          backLabel={isFirstStepForUser ? 'Sign in' : 'Back'}
          onSignIn={!isFirstStepForUser ? () => onModeSwitch('signin') : undefined}
          hideSignOut
          footer={
            (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={isTransitionName ? 'name' : signupStep}
                  initial={
                    isTransitionName && !prefersReducedMotion
                      ? { opacity: 0, y: 8, filter: 'blur(4px)' }
                      : prefersReducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, x: stepDirection === 'forward' ? 16 : -16 }
                  }
                  animate={
                    isTransitionName && !prefersReducedMotion
                      ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                      : prefersReducedMotion
                        ? { opacity: 1 }
                        : { opacity: 1, x: 0, transition: { duration: 0.22, ease: M3_EASING_ENTER } }
                  }
                  exit={
                    isTransitionName && !prefersReducedMotion
                      ? { opacity: 0, y: -8 }
                      : prefersReducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, x: stepDirection === 'forward' ? -16 : 16, transition: { duration: 0.15, ease: M3_EASING_EXIT } }
                  }
                  transition={
                    isTransitionName && !prefersReducedMotion
                      ? {
                          opacity: { duration: 0.15 },
                          y: STAGE_HEAVY,
                          filter: { duration: 0.2, ease: M3_EASING_ENTER },
                        }
                      : { duration: 0.15, ease: M3_EASING_EXIT }
                  }
                  className="w-full space-y-4 py-3 px-1 gpu-accelerated"
                >
                  {signupStep === 3 ? (
                    <>
                      <motion.button
                        type="button"
                        onClick={handleSignupStepSubmit}
                        disabled={isSignupPending}
                        transition={STAGE_HEAVY}
                        className="stage-btn stage-btn-primary w-full py-3.5 rounded-full font-medium text-sm transition-colors disabled:opacity-45 disabled:pointer-events-none flex items-center justify-center gap-2"
                      >
                        {isSignupPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            Creating passkey…
                          </>
                        ) : (
                          'Create passkey'
                        )}
                      </motion.button>
                      <AnimatePresence>
                        {passkeyError ? (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                          >
                            <AuthErrorBlock error={passkeyError} />
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </>
                  ) : (
                    <>
                      <OnboardingChatInput
                        value={showNameInput ? fullName : email}
                        onChange={
                          showNameInput
                            ? (e) => setFullName(e.target.value)
                            : (e) => setEmail(e.target.value)
                        }
                        onSubmit={handleSignupStepSubmit}
                        placeholder={showNameInput ? 'Your name' : 'your@email.com'}
                        isLoading={isSignupPending}
                        type={signupStep === 2 ? 'email' : 'text'}
                      />
                      <AnimatePresence>
                        {passkeyError ? (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                          >
                            <AuthErrorBlock error={passkeyError} />
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            )
          }
        >
          <div className="w-full max-w-lg" />
        </AionOnboardingShell>
      </motion.div>
    </div>
  );
}
