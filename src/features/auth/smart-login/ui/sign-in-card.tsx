/**
 * Sign-In Card — passkey-first auth with password fallback.
 * Extracted from SmartLoginForm. Preserves all animation behavior.
 * @module features/auth/smart-login/ui/sign-in-card
 */

'use client';

import { useActionState, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { signInAction } from '../api/actions';
import { authenticatePasskey } from '@/features/auth/passkey-authenticate/api/authenticate-passkey';
import { setTrustedDeviceCookie } from '@/shared/lib/trusted-device';
import { useConditionalMediation } from '../lib/use-conditional-mediation';
import { AuthErrorBlock } from './auth-error-block';
import type { AuthState, AuthMode } from '../model/types';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import {
  STAGE_HEAVY,
  GPU_STABILIZE,
  M3_CONTENT_EXIT_TRANSITION,
  M3_EASING_ENTER,
} from '@/shared/lib/motion-constants';

const initialState: AuthState = {
  status: 'idle',
  message: null,
  error: null,
  redirect: null,
};

interface SignInCardProps {
  email: string;
  setEmail: (v: string) => void;
  redirectTo?: string;
  showInactivityMessage: boolean;
  showSessionExpiredMessage: boolean;
  signinExiting: boolean;
  anticipating: boolean;
  isPending: boolean;
  prefersReducedMotion: boolean;
  onModeSwitch: (mode: AuthMode) => void;
  onPasskeyPendingChange: (pending: boolean) => void;
}

export function SignInCard({
  email,
  setEmail,
  redirectTo,
  showInactivityMessage,
  showSessionExpiredMessage,
  signinExiting,
  anticipating,
  isPending: externalPending,
  prefersReducedMotion,
  onModeSwitch,
  onPasskeyPendingChange,
}: SignInCardProps) {
  const [signInState, signInFormAction, isSigningIn] = useActionState(signInAction, initialState);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [trustDevice] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyFallbackHint, setPasskeyFallbackHint] = useState<string | null>(null);
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus password input when form reveals
  useEffect(() => {
    if (showPasswordForm) {
      // Small delay to let the animation start before focusing
      const id = setTimeout(() => passwordInputRef.current?.focus(), 100);
      return () => clearTimeout(id);
    }
  }, [showPasswordForm]);

  const isPending = externalPending || isSigningIn || isPasskeyPending;
  const currentState = signInState;
  const signInEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const exitDuration = prefersReducedMotion ? 0.3 : 0.28;

  /** Returns true if the error is a user-initiated cancellation (no fallback needed). */
  const isCancellationError = (error: string) =>
    /canceled|cancelled|NotAllowedError|AbortError/i.test(error);

  const handlePasskeyError = useCallback((error: string) => {
    if (isCancellationError(error)) {
      // Soft hint for cancellation — don't auto-expand password
      setPasskeyFallbackHint('Try signing in with your password');
      return;
    }
    // Non-cancellation failure — auto-expand password form
    setPasskeyError(error);
    setShowPasswordForm(true);
    setPasskeyFallbackHint(null);
  }, []);

  // Conditional mediation disabled — browser-native autocomplete="webauthn" causes
  // repeated passkey dialogs on focus in some browsers (especially incognito).
  // Users sign in via the explicit "Continue" button instead.
  const handleEmailFocus = useCallback(() => {}, []);
  const handleEmailBlur = useCallback(() => {}, []);

  const handleContinueWithPasskey = useCallback(() => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || isPending) return;
    setPasskeyError(null);
    setPasskeyFallbackHint(null);
    if (trustDevice) setTrustedDeviceCookie(true);
    setIsPasskeyPending(true);
    onPasskeyPendingChange(true);
    authenticatePasskey({ email: trimmed, redirectTo })
      .then((result) => {
        if (!result.ok) {
          if (isCancellationError(result.error)) {
            setPasskeyFallbackHint('Try signing in with your password');
          } else {
            setPasskeyError(result.error);
            setShowPasswordForm(true);
          }
        }
      })
      .finally(() => {
        setIsPasskeyPending(false);
        onPasskeyPendingChange(false);
      });
  }, [email, isPending, trustDevice, redirectTo, onPasskeyPendingChange]);

  return (
    <AnimatePresence mode="popLayout" onExitComplete={() => {}}>
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

          {!signinExiting || !anticipating ? (
            <div className="space-y-5">
              <label htmlFor="email" className="sr-only">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                aria-label="Email address"
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

              {/* Soft hint after passkey cancellation or conditional mediation failure */}
              <AnimatePresence>
                {passkeyFallbackHint && !showPasswordForm && !passkeyError ? (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs text-[var(--stage-text-secondary)] text-center -mt-2"
                  >
                    {passkeyFallbackHint}
                  </motion.p>
                ) : null}
              </AnimatePresence>

              {/* Passkey pending shimmer on email field */}
              <AnimatePresence>
                {isPasskeyPending ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-[var(--stage-text-secondary)] text-center"
                  >
                    Waiting for passkey…
                  </motion.div>
                ) : null}
              </AnimatePresence>

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
                          ref={passwordInputRef}
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
                  onClick={() => onModeSwitch('signup')}
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
}
