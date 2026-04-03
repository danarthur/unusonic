/**
 * Smart Login Form
 * Unified authentication - Sign In / Create Account toggle
 * Conditional mediation: passkeys appear in autofill when focusing email field
 * Password form hidden by default ("Use password instead")
 * Liquid Japandi design matching Unusonic aesthetic
 * @module features/auth/smart-login/ui/smart-login-form
 */

'use client';

import { useActionState, useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Loader2, Eye, EyeOff, ArrowRight, ChevronDown } from 'lucide-react';
import { signInAction, signUpForPasskey } from '../api/actions';
import {
  runConditionalMediation,
  authenticatePasskey,
} from '@/features/auth/passkey-authenticate/api/authenticate-passkey';
import { registerPasskey } from '@/features/passkey-registration';
import { AionOnboardingShell } from '@/features/onboarding/ui/aion-onboarding-shell';
import { OnboardingChatInput } from '@/features/onboarding/ui/onboarding-chat-input';
import { getAuthErrorDisplay, shouldShowTechnicalDetails } from '../lib/auth-error-message';
import { setTrustedDeviceCookie } from '@/shared/lib/trusted-device';
import type { AuthState, AuthMode } from '../model/types';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import {
  STAGE_HEAVY,
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
      <p className="text-sm text-unusonic-error text-center">{display.friendly}</p>
      {showToggle && (
        <button
          type="button"
          onClick={() => setShowTechnical((s) => !s)}
          className="text-[11px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors flex items-center justify-center gap-1 mx-auto"
        >
          {showTechnical ? 'Hide technical details' : 'See what went wrong'}
          <ChevronDown
            className="w-3 h-3 transition-transform"
            style={{ transform: showTechnical ? 'rotate(180deg)' : undefined }}
          />
        </button>
      )}
      {showToggle && showTechnical && (
        <p className="text-[11px] text-[var(--stage-text-secondary)] font-mono break-all text-left px-2 py-1.5 rounded-lg bg-[oklch(1_0_0_/_0.10)]">
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
  /** Pre-fill the email field (e.g. from an invite link). */
  defaultEmail?: string;
  /** Show a brief message when user was signed out due to inactivity. */
  showInactivityMessage?: boolean;
  /** Show a brief message when the session expired naturally. */
  showSessionExpiredMessage?: boolean;
}

export function SmartLoginForm({
  redirectTo,
  defaultMode = 'signin',
  defaultEmail,
  showInactivityMessage = false,
  showSessionExpiredMessage = false,
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
  const [signupStep, setSignupStep] = useState(defaultMode === 'signup' ? 1 : 0);
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
  const [email, setEmail] = useState(defaultEmail ?? '');
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
      conditionalAbortRef.current?.abort();
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
        setSignupStep(1);
        setSignupTransitionPhase('name');
        setAnticipating(true);
        setMode('signup');
      }
    }
  };

  const SIGNUP_STEPS = 3;
  const signupPrompts = [
    '', // index 0 unused — flow starts at step 1
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
      // Skip email step if already pre-filled from sign-in form
      const emailAlreadyValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      setSignupStep(emailAlreadyValid ? 3 : 2);
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
      // Passkey step: create account with random password, then register passkey, then redirect.
      // Navigation uses window.location.href (not router.push) so the React transition completes
      // immediately and isSignupPending resets — router.push inside startTransition keeps isPending
      // true through the entire navigation, making the button appear stuck.
      setPasskeyError(null);
      startTransition(async () => {
        try {
          const result = await signUpForPasskey({
            email: email.trim().toLowerCase(),
            fullName: fullName.trim(),
          });
          if (!result.ok) {
            setPasskeyError(result.error ?? 'Failed to create account');
            return;
          }
          const passkeyResult = await registerPasskey();
          const postSignupDest = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/onboarding';
          if (!passkeyResult.ok) {
            // Account exists but passkey failed — navigate anyway so the user isn't locked out.
            // They can add a passkey from Settings once inside.
            window.location.href = postSignupDest;
            return;
          }
          window.location.href = postSignupDest;
        } catch (e) {
          setPasskeyError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
        }
      });
    }
  };

  // Transition phase: when coming from Sign In, show welcome then name; otherwise use step 0 (Get started)
  const isTransitionWelcome = fromSignInRef.current && signupTransitionPhase === 'welcome';
  const isTransitionName = fromSignInRef.current && signupTransitionPhase === 'name';
  const effectivePrompt = isTransitionWelcome
    ? 'Welcome to Unusonic'
    : isTransitionName
      ? 'What should we call you?'
      : signupPrompts[signupStep];
  const effectiveStepIndex = isTransitionWelcome ? 0 : isTransitionName ? 1 : signupStep;
  // Steps are 1-based (1=name, 2=email, 3=passkey); convert to 0-based for the dot indicator (0–2).
  const displayStepIndex = isTransitionName ? 0 : Math.max(0, effectiveStepIndex - 1);
  const isFirstStepForUser = signupStep <= 1 || isTransitionName;
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
              : STAGE_HEAVY
            : STAGE_HEAVY
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
        <AionOnboardingShell
          prompt={effectivePrompt}
          welcomeTitle={isTransitionName ? 'Welcome to Unusonic' : undefined}
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
                        className="stage-btn stage-btn-primary w-full py-3.5 rounded-full font-medium text-sm transition-colors disabled:opacity-70 disabled:pointer-events-none flex items-center justify-center gap-2"
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
        </AionOnboardingShell>
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
                transition: STAGE_HEAVY,
              }
        }
        transition={STAGE_HEAVY}
        className={`w-full max-w-md mx-auto ${signinExiting || anticipating ? 'pointer-events-none' : ''}`}
      >
        <div
          className="stage-panel p-8 md:p-10 relative overflow-hidden"
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
                transition={STAGE_HEAVY}
                style={{ ...GPU_STABILIZE, viewTransitionName: 'auth-logo' } as React.CSSProperties}
                className="mx-auto flex items-center justify-center overflow-visible isolate relative z-10"
              >
                <motion.div
                  animate={isPending ? { opacity: [0.7, 1, 0.7] } : {}}
                  transition={{ duration: 2, repeat: isPending ? Infinity : 0, ease: 'easeInOut' }}
                >
                  <LivingLogo size="lg" status={isPending ? 'loading' : 'idle'} />
                </motion.div>
              </motion.div>
              <div className="mt-3 mb-5 text-center">
                <p className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight">Unusonic</p>
                <p className="text-[11px] text-[var(--stage-text-tertiary)] tracking-widest uppercase mt-1">Sign in to your workspace</p>
              </div>

            {/* M3 Container transform: outgoing content fades in 90ms so container (card) is the focus. */}
            <motion.div
              animate={{ opacity: (signinExiting || anticipating) ? 0 : 1 }}
              transition={
                signinExiting ? M3_CONTENT_EXIT_TRANSITION : { duration: 0.2, ease: M3_EASING_ENTER }
              }
              className="gpu-accelerated"
            >
            {showInactivityMessage && (
              <p className="text-sm text-[var(--stage-text-secondary)] text-center mb-4 rounded-xl bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.08)] px-4 py-2.5">
                You were signed out after a period of inactivity.
              </p>
            )}
            {showSessionExpiredMessage && !showInactivityMessage && (
              <p className="text-sm text-[var(--stage-text-secondary)] text-center mb-4 rounded-xl bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.08)] px-4 py-2.5">
                Your session expired. Sign in to continue.
              </p>
            )}

          {(mode === 'signin' || signinExiting || anticipating || signupExiting) ? (
            <div className="space-y-5">
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
                className="w-full h-12 px-4 rounded-xl bg-[oklch(0.10_0_0_/_0.50)] border border-[oklch(1_0_0_/_0.08)]
                  text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]
                  focus:outline-none focus:border-[oklch(1_0_0_/_0.12)] focus:ring-2 focus:ring-ring/30
                  hover:border-[oklch(1_0_0_/_0.12)]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200"
                placeholder="your@email.com"
              />

              {/* Always-visible Continue CTA — disabled until email is valid */}
              <AnimatePresence>
                {!showPasswordForm ? (
                  <motion.div
                    key="continue-cta"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={STAGE_HEAVY}
                  >
                    <motion.button
                      type="button"
                      onClick={handleContinueWithPasskey}
                      disabled={!signInEmailValid || isPending}
                      transition={STAGE_HEAVY}
                      className="stage-btn stage-btn-primary w-full h-12 rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-25 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {isPasskeyPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          Signing in…
                        </>
                      ) : (
                        <>
                          Continue
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
                    transition={STAGE_HEAVY}
                    className="overflow-hidden"
                  >
                    <div className="p-3 rounded-xl bg-surface-error border border-unusonic-error/40">
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
                  transition={{ ...STAGE_HEAVY, opacity: { duration: 0.2 } }}
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
                        className="block text-[11px] font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest mb-2"
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
                          className="w-full h-11 px-4 pr-11 rounded-xl bg-[oklch(0.10_0_0_/_0.50)] border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus:border-[oklch(1_0_0_/_0.12)] focus:ring-2 focus:ring-ring/30 disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto cursor-text transition-all duration-200"
                          placeholder="Password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isPending}
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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
                          transition={STAGE_HEAVY}
                          className="overflow-hidden"
                        >
                          <div className="p-3 rounded-xl bg-surface-error border border-unusonic-error/40">
                            <AuthErrorBlock error={passkeyError ?? currentState.error ?? ''} />
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                    <motion.button
                      type="submit"
                      disabled={isPending}
                      className="w-full h-12 rounded-xl font-medium text-sm bg-[var(--stage-accent)]/80 text-[oklch(0.10_0_0)] hover:bg-[var(--stage-accent)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-all duration-300"
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
                  className="w-full text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  Other sign-in options
                </motion.button>
              )}
              </AnimatePresence>


              <p className="text-center">
                <a
                  href="/recover"
                  className="text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
                >
                  Lost access?
                </a>
              </p>
              <p className="text-center">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('signup')}
                  disabled={isPending}
                  className="text-sm text-[var(--stage-text-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  New here?{' '}
                  <span className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors">Create account</span>
                </button>
              </p>
            </div>
          ) : null}

            </motion.div>
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
        transition={STAGE_HEAVY}
        className="relative w-full min-h-screen flex items-center justify-center"
      >
        {createAccountView}
        {signInView}
      </motion.div>
    </LayoutGroup>
  );
}
