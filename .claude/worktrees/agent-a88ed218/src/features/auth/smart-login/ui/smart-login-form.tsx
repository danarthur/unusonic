/**
 * Smart Login Form
 * Unified authentication - Sign In / Create Account toggle
 * Conditional mediation: passkeys appear in autofill when focusing email field
 * Password form hidden by default ("Use password instead")
 * Liquid Japandi design matching Signal aesthetic
 * @module features/auth/smart-login/ui/smart-login-form
 */

'use client';

import { useActionState, useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Loader2, Eye, EyeOff, ArrowRight, ChevronDown, User } from 'lucide-react';
import { signInAction, signUpForPasskey } from '../api/actions';
import {
  runConditionalMediation,
  authenticatePasskey,
} from '@/features/auth/passkey-authenticate/api/authenticate-passkey';
import { registerPasskey } from '@/features/passkey-registration';
import { IonOnboardingShell } from '@/features/onboarding/ui/ion-onboarding-shell';
import { OnboardingChatInput } from '@/features/onboarding/ui/onboarding-chat-input';
import { getAuthErrorDisplay, shouldShowTechnicalDetails } from '../lib/auth-error-message';
import { setTrustedDeviceCookie } from '@/shared/lib/trusted-device';
import type { AuthState, AuthMode } from '../model/types';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import {
  SIGNAL_PHYSICS,
  GPU_STABILIZE,
  M3_CONTENT_EXIT_TRANSITION,
  M3_FADE_THROUGH_ENTER,
  M3_EASING_ENTER,
  M3_EASING_EXIT,
  M3_DURATION_S,
} from '@/shared/lib/motion-constants';

const initialState: AuthState = {
  status: 'idle',
  message: null,
  error: null,
  redirect: null,
};

/** Renders a user-friendly error with optional "See technical details" for raw messages. */
function AuthErrorBlock({ error }: { error: string }) {
  const [showTechnical, setShowTechnical] = useState(false);
  const display = getAuthErrorDisplay(error);
  const showToggle = shouldShowTechnicalDetails(display);

  return (
    <div className="space-y-2">
      <p className="text-sm text-signal-error text-center">{display.friendly}</p>
      {showToggle && (
        <button
          type="button"
          onClick={() => setShowTechnical((s) => !s)}
          className="text-xs text-ceramic/50 hover:text-ceramic/70 transition-colors flex items-center justify-center gap-1 mx-auto"
        >
          {showTechnical ? 'Hide technical details' : 'See what went wrong'}
          <ChevronDown
            className="w-3 h-3 transition-transform"
            style={{ transform: showTechnical ? 'rotate(180deg)' : undefined }}
          />
        </button>
      )}
      {showToggle && showTechnical && (
        <p className="text-[11px] text-ink-muted font-mono break-all text-left px-2 py-1.5 rounded-lg bg-ink/10">
          {display.technical}
        </p>
      )}
    </div>
  );
}

const signInMessages = ['Signing in…', 'Verifying…'];
const signUpMessages = ['Creating account…', 'Setting up…'];

interface SmartLoginFormProps {
  redirectTo?: string;
  defaultMode?: AuthMode;
  /** Show a brief message when user was signed out due to inactivity. */
  showInactivityMessage?: boolean;
}

export function SmartLoginForm({
  redirectTo,
  defaultMode = 'signin',
  showInactivityMessage = false,
}: SmartLoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [signInState, signInFormAction, isSigningIn] = useActionState(signInAction, initialState);
  const [isSignupPending, startTransition] = useTransition();

  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);
  const [signupStep, setSignupStep] = useState(0);
  const conditionalAbortRef = useRef<AbortController | null>(null);
  const conditionalMediationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRunConditionalMediationThisFocusRef = useRef(false);

  // Transition: Sign In → Create Account (welcome → "What should we call you?" + input)
  const [signupTransitionPhase, setSignupTransitionPhase] = useState<'welcome' | 'name' | null>(null);
  const [signinExiting, setSigninExiting] = useState(false);
  const [signupExiting, setSignupExiting] = useState(false);
  const [anticipating, setAnticipating] = useState(false);
  const [logoAcknowledging, setLogoAcknowledging] = useState(false);
  const logoAckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fromSignInRef = useRef(defaultMode === 'signin');
  const anticipationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);

  const isPending = isSigningIn || isSignupPending || isPasskeyPending;
  const currentState = signInState;

  const signInEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const loadingMessages = mode === 'signin' ? signInMessages : signUpMessages;

  const isFormComplete =
    mode === 'signin'
      ? email.trim().length > 0 && password.length >= 6
      : signupStep === 1
        ? fullName.trim().length >= 2
        : signupStep === 2
          ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
          : password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);

  // Run conditional mediation on email field focus (with delay) so password managers (e.g. NordPass)
  // can open first; avoids mediation running on mount and stealing the autofill surface.
  const handleEmailFocus = () => {
    if (mode !== 'signin' || isPending || typeof window === 'undefined') return;
    if (!('PublicKeyCredential' in window)) return;
    if (hasRunConditionalMediationThisFocusRef.current) return;

    if (conditionalMediationTimeoutRef.current) {
      clearTimeout(conditionalMediationTimeoutRef.current);
      conditionalMediationTimeoutRef.current = null;
    }
    conditionalMediationTimeoutRef.current = setTimeout(() => {
      conditionalMediationTimeoutRef.current = null;
      hasRunConditionalMediationThisFocusRef.current = true;
      const controller = new AbortController();
      conditionalAbortRef.current = controller;
      void runConditionalMediation(redirectTo).then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setPasskeyError(result.error);
        }
      });
    }, 220);
  };

  const handleEmailBlur = () => {
    if (conditionalMediationTimeoutRef.current) {
      clearTimeout(conditionalMediationTimeoutRef.current);
      conditionalMediationTimeoutRef.current = null;
    }
    hasRunConditionalMediationThisFocusRef.current = false;
  };

  const handleContinueWithPasskey = () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || isPending) return;
    setPasskeyError(null);
    if (trustDevice) setTrustedDeviceCookie(true);
    setIsPasskeyPending(true);
    authenticatePasskey({ email: trimmed, redirectTo })
      .then((result) => {
        if (!result.ok) setPasskeyError(result.error);
      })
      .finally(() => setIsPasskeyPending(false));
  };

  useEffect(() => {
    return () => {
      if (conditionalMediationTimeoutRef.current) {
        clearTimeout(conditionalMediationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isPending) {
      setLoadingMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [isPending, loadingMessages.length]);

  // Respect prefers-reduced-motion (accessibility)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = () => setPrefersReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Direct /signup: no transition, show step 0 (Get started)
  useEffect(() => {
    if (defaultMode === 'signup') fromSignInRef.current = false;
  }, [defaultMode]);

  // Anticipation: 100ms scale-down before Sign In exits and logo morphs
  useEffect(() => {
    if (!anticipating) return;
    anticipationTimeoutRef.current = setTimeout(() => {
      setSigninExiting(true);
      setAnticipating(false);
    }, 100);
    return () => {
      if (anticipationTimeoutRef.current) clearTimeout(anticipationTimeoutRef.current);
    };
  }, [anticipating]);

  useEffect(() => {
    return () => {
      if (logoAckTimeoutRef.current) clearTimeout(logoAckTimeoutRef.current);
    };
  }, []);

  const handleModeSwitch = (newMode: AuthMode) => {
    if (!isPending) {
      setShowPassword(false);
      setShowPasswordForm(false);
      setPasskeyError(null);
      setPassword('');
      if (newMode === 'signin') {
        setFullName('');
        setSignupTransitionPhase(null);
        setSigninExiting(false);
        setAnticipating(false);
        // Back to Sign In: keep Create Account in DOM while it exits, then set mode on complete
        if (mode === 'signup') {
          setSignupExiting(true);
        } else {
          setMode('signin');
        }
      } else {
        setSignupExiting(false);
        fromSignInRef.current = true;
        setSignupStep(0);
        setSignupTransitionPhase('name');
        setAnticipating(true);
        setMode('signup');
      }
    }
  };

  const SIGNUP_STEPS = 4;
  const signupPrompts = [
    'Welcome to Signal',
    'What should we call you?',
    "What's your email?",
    'Create your passkey',
  ];

  const handleSignupStepSubmit = async () => {
    if (signupStep === 1 || signupTransitionPhase === 'name') {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setPasskeyError('Please enter your name (at least 2 characters)');
        return;
      }
      setPasskeyError(null);
      setSignupTransitionPhase(null);
      setSignupStep(2);
      // Brief logo acknowledgement when user submits name (living logo responds)
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
      setPasskeyError(null);
      setSignupStep(3);
    } else if (signupStep === 3) {
      // Passkey step: create account with random password, then register passkey, then redirect
      setPasskeyError(null);
      startTransition(async () => {
        const result = await signUpForPasskey({
          email: email.trim().toLowerCase(),
          fullName: fullName.trim(),
        });
        if (!result.ok) {
          setPasskeyError(result.error ?? 'Failed to create account');
          return;
        }
        const passkeyResult = await registerPasskey();
        if (!passkeyResult.ok) {
          setPasskeyError(passkeyResult.error ?? 'Passkey setup failed. You can add one later in Settings.');
          return;
        }
        router.push('/onboarding');
      });
    }
  };

  // Transition phase: when coming from Sign In, show welcome then name; otherwise use step 0 (Get started)
  const isTransitionWelcome = fromSignInRef.current && signupTransitionPhase === 'welcome';
  const isTransitionName = fromSignInRef.current && signupTransitionPhase === 'name';
  const effectivePrompt = isTransitionWelcome
    ? 'Welcome to Signal'
    : isTransitionName
      ? 'What should we call you?'
      : signupPrompts[signupStep];
  const effectiveStepIndex = isTransitionWelcome ? 0 : isTransitionName ? 1 : signupStep;
  // When coming from Sign In, "What should we call you?" is the first step for the user — show "1 of 4" and only "Sign in"
  const displayStepIndex = isTransitionName ? 0 : effectiveStepIndex;
  const isFirstStepForUser = effectiveStepIndex === 0 || isTransitionName;
  const showNameInput = signupStep === 1 || isTransitionName;
  const exitDuration = prefersReducedMotion ? 0.3 : 0.28;

  // M3 Shared axis: step order for direction-aware transitions (forward = enter from right, back = from left)
  const stepOrder = isTransitionName ? 1 : signupStep;
  const [stepDirection, setStepDirection] = useState<'forward' | 'back'>('forward');
  const prevStepOrderRef = useRef(stepOrder);
  useEffect(() => {
    if (stepOrder !== prevStepOrderRef.current) {
      setStepDirection(stepOrder > prevStepOrderRef.current ? 'forward' : 'back');
      prevStepOrderRef.current = stepOrder;
    }
  }, [stepOrder]);

  // Create Account: genesis-style flow (full-bleed, optional shared-logo transition)
  // When coming from Sign In, skip fade-in so the logo morph has a visible destination (avoids "move → disappear → reappear")
  // When going back to Sign In, keep mounted (signupExiting) and animate out, then unmount on complete
  const isSharedLogoTransition = fromSignInRef.current;
  const createAccountView = (mode === 'signup' || signupExiting) && (
    <div
      className={`fixed inset-0 z-20 flex items-center justify-center ${signupExiting ? 'pointer-events-none' : ''}`}
    >
      <motion.div
        key="signup-genesis"
        layout
        initial={
          isSharedLogoTransition && !signupExiting
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
              : SIGNAL_PHYSICS
            : SIGNAL_PHYSICS
        }
        onAnimationComplete={
          signupExiting
            ? () => {
                setSignupExiting(false);
                setMode('signin');
              }
            : undefined
        }
        style={GPU_STABILIZE}
        className="h-full w-full"
      >
        <IonOnboardingShell
          prompt={effectivePrompt}
          welcomeTitle={isTransitionName ? 'Welcome to Signal' : undefined}
          logoStatus={isSignupPending ? 'loading' : logoAcknowledging ? 'loading' : 'idle'}
          logoLayoutId={fromSignInRef.current && !signupExiting ? 'auth-logo' : undefined}
          onWelcomeComplete={() => setSignupTransitionPhase('name')}
          skipWelcomeHold={prefersReducedMotion}
          stepIndex={displayStepIndex}
          stepTotal={SIGNUP_STEPS}
          onBack={
            isFirstStepForUser
              ? () => handleModeSwitch('signin')
              : () => {
                  setSignupStep((s) => s - 1);
                  setPasskeyError(null);
                }
          }
          backLabel={isFirstStepForUser ? 'Sign in' : 'Back'}
          onSignIn={!isFirstStepForUser ? () => handleModeSwitch('signin') : undefined}
          hideSignOut
          footer={
            (
              <AnimatePresence mode="sync" initial={false}>
                <motion.div
                  key={isTransitionName ? 'name' : signupStep}
                  initial={
                    isTransitionName && !prefersReducedMotion
                      ? { opacity: 0, y: 8, filter: 'blur(4px)' }
                      : prefersReducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, x: stepDirection === 'forward' ? 24 : -24 }
                  }
                  animate={
                    isTransitionName && !prefersReducedMotion
                      ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                      : prefersReducedMotion
                        ? { opacity: 1 }
                        : { opacity: 1, x: 0 }
                  }
                  exit={
                    isTransitionName && !prefersReducedMotion
                      ? { opacity: 0, y: -8 }
                      : prefersReducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, x: stepDirection === 'forward' ? -24 : 24 }
                  }
                  transition={
                    isTransitionName && !prefersReducedMotion
                      ? {
                          opacity: { duration: 0.2 },
                          y: SIGNAL_PHYSICS,
                          filter: { duration: 0.25, ease: M3_EASING_ENTER },
                        }
                      : { duration: M3_DURATION_S, ease: M3_EASING_ENTER }
                  }
                  className="w-full space-y-4 overflow-hidden py-3 px-1 gpu-accelerated"
                >
                  {signupStep === 0 && !isTransitionName ? (
                    <motion.button
                      type="button"
                      onClick={() => setSignupStep(1)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={SIGNAL_PHYSICS}
                      className="w-full py-3.5 rounded-full font-medium text-sm bg-neon-blue text-obsidian hover:brightness-110 transition-colors"
                    >
                      Get started
                    </motion.button>
                  ) : signupStep === 3 ? (
                    <>
                      <motion.button
                        type="button"
                        onClick={handleSignupStepSubmit}
                        disabled={isSignupPending}
                        whileHover={!isSignupPending ? { scale: 1.02 } : undefined}
                        whileTap={!isSignupPending ? { scale: 0.98 } : undefined}
                        transition={SIGNAL_PHYSICS}
                        className="w-full py-3.5 rounded-full font-medium text-sm bg-neon-blue text-obsidian hover:brightness-110 transition-colors disabled:opacity-70 disabled:pointer-events-none flex items-center justify-center gap-2"
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
                        placeholder={
                          showNameInput ? 'Your name' : 'your@email.com'
                        }
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
        </IonOnboardingShell>
      </motion.div>
    </div>
  );

  // Sign In: liquid-panel flow (exits when switching to Create Account for shared-logo transition)
  // Physics-driven: onExitComplete only when animation actually finishes (no manual timeout = no cut)
  const signInView = (mode === 'signin' || signinExiting || anticipating || signupExiting) && (
    <AnimatePresence mode="popLayout" onExitComplete={() => setSigninExiting(false)}>
      <motion.div
        key="signin"
        layout
        style={GPU_STABILIZE}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={
          prefersReducedMotion
            ? {
                opacity: 0,
                filter: 'blur(4px)',
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                zIndex: 0,
                transition: { duration: exitDuration, ease: 'easeOut' },
              }
            : {
                opacity: 0,
                scale: 0.96,
                filter: 'blur(8px)',
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                zIndex: 0,
                transition: SIGNAL_PHYSICS,
              }
        }
        transition={SIGNAL_PHYSICS}
        className={`w-full max-w-md mx-auto ${signinExiting || anticipating ? 'pointer-events-none' : ''}`}
      >
        <div
          className="liquid-panel p-8 md:p-10 relative overflow-hidden"
          style={{ viewTransitionName: 'auth-card' } as React.CSSProperties}
        >
          <div
            className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            }}
          />

          <div className="relative z-10">
            <div className="text-center mb-8">
              <motion.div
                layoutId="auth-logo"
                layout
                animate={anticipating ? { scale: 0.95 } : { scale: 1 }}
                transition={SIGNAL_PHYSICS}
                style={{ ...GPU_STABILIZE, viewTransitionName: 'auth-logo' } as React.CSSProperties}
                className="mx-auto mb-6 flex items-center justify-center overflow-visible isolate relative z-10"
              >
                <motion.div
                  animate={isPending ? { opacity: [0.7, 1, 0.7] } : {}}
                  transition={{ duration: 2, repeat: isPending ? Infinity : 0, ease: 'easeInOut' }}
                >
                  <LivingLogo size="lg" status={isPending ? 'loading' : 'idle'} />
                </motion.div>
              </motion.div>

            {/* M3 Container transform: outgoing content fades in 90ms so container (card) is the focus. */}
            <motion.div
              animate={{ opacity: (signinExiting || anticipating) ? 0 : 1 }}
              transition={
                signinExiting ? M3_CONTENT_EXIT_TRANSITION : { duration: 0.2, ease: M3_EASING_ENTER }
              }
              className="gpu-accelerated"
            >
            {showInactivityMessage && (
              <p className="text-sm text-ink-muted text-center mb-4 rounded-xl bg-ink/5 border border-[var(--glass-border)] px-4 py-2.5">
                You were signed out after a period of inactivity.
              </p>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(4px)', position: 'absolute' }}
                transition={M3_FADE_THROUGH_ENTER}
                className="text-center gpu-accelerated"
              >
                <h1 className="text-2xl font-medium text-ceramic tracking-tight">
                  {mode === 'signin' || signinExiting || anticipating || signupExiting ? 'Sign in' : 'Create account'}
                </h1>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={isPending ? loadingMessageIndex : `${mode}-default`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="text-sm text-ink-muted mt-1.5"
                  >
                    {isPending
                      ? loadingMessages[loadingMessageIndex]
                      : mode === 'signin' || signinExiting || anticipating || signupExiting
                        ? 'Use passkey or password'
                        : 'Set up your workspace'}
                  </motion.p>
                </AnimatePresence>
              </motion.div>
            </AnimatePresence>

          <div className="flex items-center justify-center gap-1 p-1 mb-6 rounded-xl bg-ink/[0.03] border border-[var(--glass-border)]">
            <button
              type="button"
              onClick={() => handleModeSwitch('signin')}
              disabled={isPending}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 disabled:cursor-not-allowed ${
                mode === 'signin'
                  ? 'bg-canvas shadow-sm text-ink'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('signup')}
              disabled={isPending}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 disabled:cursor-not-allowed ${
                mode === 'signup'
                  ? 'bg-canvas shadow-sm text-ink'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Create Account
            </button>
          </div>

          {(mode === 'signin' || signinExiting || anticipating || signupExiting) ? (
            <div className="space-y-5">
              {/* Selector-style field: click/focus triggers passkey autofill via conditional mediation */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-ink-muted uppercase tracking-widest mb-2"
                >
                  Account
                </label>
                <div
                  className="relative flex items-center
                    rounded-xl bg-canvas/50 border border-[var(--glass-border)]
                    focus-within:border-[var(--glass-border-hover)] focus-within:ring-2 focus-within:ring-ring/30
                    transition-all duration-200
                    hover:border-[var(--glass-border-hover)]"
                  role="presentation"
                >
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username webauthn"
                    required={showPasswordForm}
                    disabled={isPending}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={handleEmailFocus}
                    onBlur={handleEmailBlur}
                    data-lpignore="true"
                    data-form-type="other"
                    data-1p-ignore
                    className="w-full h-12 pl-4 pr-12 rounded-xl bg-transparent
                      text-ink placeholder:text-ink-muted
                      focus:outline-none focus:ring-0
                      disabled:opacity-50 disabled:cursor-not-allowed
                      pointer-events-auto cursor-pointer
                      transition-all duration-200"
                    placeholder="Select account or enter email"
                    aria-describedby="passkey-hint"
                  />
                  <div
                    className="absolute right-3 flex items-center gap-1.5 pointer-events-none"
                    aria-hidden
                  >
                    <User className="w-4 h-4 text-ink-muted/70" />
                    <ChevronDown className="w-4 h-4 text-ink-muted/60" />
                  </div>
                </div>
                <p id="passkey-hint" className="text-[11px] text-ink-muted/50 mt-1.5">
                  Click to select passkey or type email, then continue
                </p>
              </div>

              {/* Trust this device: skip inactivity logout on this browser */}
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                  disabled={isPending}
                  className="h-4 w-4 rounded border-[var(--glass-border)] bg-canvas/50 text-neon-blue focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
                  aria-describedby="trust-device-hint"
                />
                <span className="text-sm text-ink-muted group-hover:text-ink transition-colors">
                  Keep me signed in on this device
                </span>
              </label>
              <p id="trust-device-hint" className="text-[11px] text-ink-muted/50 -mt-1">
                Uncheck on shared devices so you’re signed out after a period of inactivity.
              </p>

              {/* When email is filled (e.g. from NordPass), explicit Continue runs passkey flow */}
              <AnimatePresence>
                {signInEmailValid && !showPasswordForm ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={SIGNAL_PHYSICS}
                    className="overflow-hidden"
                  >
                    <motion.button
                      type="button"
                      onClick={handleContinueWithPasskey}
                      disabled={isPending}
                      whileHover={!isPending ? { scale: 1.02 } : undefined}
                      whileTap={!isPending ? { scale: 0.98 } : undefined}
                      transition={SIGNAL_PHYSICS}
                      className="w-full h-12 rounded-xl font-medium text-sm bg-neon-blue text-obsidian hover:brightness-110 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isPasskeyPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          Signing in with passkey…
                        </>
                      ) : (
                        <>
                          Continue with passkey
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </motion.button>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence>
                {passkeyError && !showPasswordForm ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    transition={SIGNAL_PHYSICS}
                    className="overflow-hidden"
                  >
                    <div className="p-3 rounded-xl bg-surface-error border border-signal-error/40">
                      <AuthErrorBlock error={passkeyError} />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence mode="wait">
              {showPasswordForm ? (
                <motion.div
                  key="password-form"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ ...SIGNAL_PHYSICS, opacity: { duration: 0.2 } }}
                  className="overflow-hidden pt-2 pb-3 px-1"
                >
                  <form action={signInFormAction} className="space-y-5">
                    {redirectTo && (
                      <input type="hidden" name="redirect" value={redirectTo} />
                    )}
                    <input type="hidden" name="email" value={email} />
                    <input type="hidden" name="trustDevice" value={trustDevice ? '1' : ''} />
                    <div>
                      <label
                        htmlFor="password"
                        className="block text-xs font-medium text-ink-muted uppercase tracking-widest mb-2"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          disabled={isPending}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          data-lpignore="true"
                          data-form-type="other"
                          data-1p-ignore
                          className="w-full h-11 px-4 pr-11 rounded-xl bg-canvas/50 border border-[var(--glass-border)] text-ink placeholder:text-ink-muted focus:outline-none focus:border-[var(--glass-border-hover)] focus:ring-2 focus:ring-ring/30 disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto cursor-text transition-all duration-200"
                          placeholder="Password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isPending}
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-ink/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {(currentState.status === 'error' && currentState.error) || passkeyError ? (
                        <motion.div
                          initial={{ opacity: 0, y: -8, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, y: -8, height: 0 }}
                          transition={SIGNAL_PHYSICS}
                          className="overflow-hidden"
                        >
                          <div className="p-3 rounded-xl bg-surface-error border border-signal-error/40">
                            <AuthErrorBlock error={passkeyError ?? currentState.error ?? ''} />
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                    <motion.button
                      type="submit"
                      disabled={isPending}
                      whileHover={{ scale: isPending ? 1 : 1.02 }}
                      whileTap={{ scale: isPending ? 1 : 0.98 }}
                      className="w-full h-12 rounded-xl font-medium text-sm bg-ink/80 text-canvas hover:bg-ink disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-all duration-300"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Signing in…</span>
                        </>
                      ) : (
                        <>
                          <span>Sign in with password</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </motion.button>
                  </form>
                </motion.div>
              ) : (
                <motion.button
                  key="use-password-link"
                  type="button"
                  onClick={() => setShowPasswordForm(true)}
                  disabled={isPending}
                  className="w-full text-sm text-ink-muted hover:text-ink underline transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  Use password instead
                </motion.button>
              )}
              </AnimatePresence>

              <p className="text-center">
                <a
                  href="/recover"
                  className="text-sm text-ink-muted hover:text-ink underline transition-colors"
                >
                  Lost access?
                </a>
              </p>
              <p className="text-center mt-3">
                <span className="text-[11px] text-ink-muted/60">
                  Can&apos;t type in the fields? Try a{' '}
                  <span className="text-ink-muted/80">private window</span>
                  {' '}or disable your password manager for this site.
                </span>
              </p>
            </div>
          ) : null}

            </motion.div>
          </div>

          <div className="mt-8 pt-5 border-t border-[var(--glass-border)]">
            <p className="text-[11px] text-center text-ink-muted/60 uppercase tracking-widest">
              Signal
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  </AnimatePresence>
  );

  return (
    <LayoutGroup>
      <motion.div
        layout
        transition={SIGNAL_PHYSICS}
        className="relative w-full min-h-screen flex items-center justify-center"
      >
        {createAccountView}
        {signInView}
      </motion.div>
    </LayoutGroup>
  );
}
