/**
 * Sign-In Card — passkey-first auth with password fallback.
 * Extracted from SmartLoginForm. Preserves all animation behavior.
 * @module features/auth/smart-login/ui/sign-in-card
 */

'use client';

import { useActionState, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { signInAction, sendOtpAction, verifyOtpAction } from '../api/actions';
import { authenticatePasskey } from '@/features/auth/passkey-authenticate/api/authenticate-passkey';
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
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyFallbackHint, setPasskeyFallbackHint] = useState<string | null>(null);
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isOtpPending, setIsOtpPending] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus password input when form reveals
  useEffect(() => {
    if (showPasswordForm) {
      // Small delay to let the animation start before focusing
      const id = setTimeout(() => passwordInputRef.current?.focus(), 100);
      return () => clearTimeout(id);
    }
  }, [showPasswordForm]);

  const isPending = externalPending || isSigningIn || isPasskeyPending || isOtpPending;
  const currentState = signInState;
  const signInEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const exitDuration = prefersReducedMotion ? 0.3 : 0.28;

  /** Returns true if the error is a user-initiated cancellation (no fallback needed). */
  const isCancellationError = (error: string) =>
    /canceled|cancelled|NotAllowedError|AbortError/i.test(error);

  const handleSendOtp = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || isOtpPending) return;
    setIsOtpPending(true);
    setOtpError(null);
    const result = await sendOtpAction(trimmed);
    setIsOtpPending(false);
    if (result.ok) {
      setOtpSent(true);
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } else {
      setOtpError(result.error);
    }
  }, [email, isOtpPending]);

  const handleVerifyOtp = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !otpCode || isOtpPending) return;
    setIsOtpPending(true);
    setOtpError(null);
    const result = await verifyOtpAction(trimmed, otpCode, redirectTo);
    setIsOtpPending(false);
    if (!result.ok) {
      setOtpError(result.error);
    }
  }, [email, otpCode, isOtpPending, redirectTo]);

  const handleContinueWithPasskey = useCallback(() => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || isPending) return;
    setPasskeyError(null);
    setPasskeyFallbackHint(null);
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
  }, [email, isPending, redirectTo, onPasskeyPendingChange]);

  return (
    <AnimatePresence mode="popLayout">
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
                <p className="stage-label text-[var(--stage-text-tertiary)] mt-1">Sign in to your workspace</p>
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
                data-lpignore="true"
                data-form-type="other"
                data-1p-ignore
                className="w-full h-12 px-4 rounded-xl bg-[oklch(0.10_0_0_/_0.50)] border border-[oklch(1_0_0_/_0.08)]
                  text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]
                  focus:outline-none focus-visible:border-[oklch(1_0_0_/_0.12)] focus-visible:ring-2 focus-visible:ring-ring/30
                  hover:border-[oklch(1_0_0_/_0.12)]
                  disabled:opacity-45 disabled:cursor-not-allowed
                  transition-colors duration-[80ms]"
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
                      className="stage-btn stage-btn-primary w-full h-12 rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed transition-colors duration-[80ms]"
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
                    <div>
                      <label
                        htmlFor="password"
                        className="block stage-label mb-2"
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
                          className="w-full h-11 px-4 pr-11 rounded-xl bg-[oklch(0.10_0_0_/_0.50)] border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:border-[oklch(1_0_0_/_0.12)] focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-45 disabled:cursor-not-allowed pointer-events-auto cursor-text transition-colors duration-[80ms]"
                          placeholder="Password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isPending}
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)] disabled:opacity-45 disabled:cursor-not-allowed transition-colors duration-[80ms]"
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
                      className="w-full h-12 rounded-xl font-medium text-sm bg-[var(--stage-accent)]/80 text-[oklch(0.10_0_0)] hover:bg-[var(--stage-accent)] disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-colors duration-100"
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
              ) : showOtpForm ? (
                <motion.div
                  key="otp-form"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ ...STAGE_HEAVY, opacity: { duration: 0.2 } }}
                  className="overflow-hidden pt-2 pb-3 px-1"
                >
                  {!otpSent ? (
                    <div className="space-y-4">
                      <p className="text-sm text-[var(--stage-text-secondary)] text-center">
                        We&apos;ll send a 6-digit code to <span className="text-[var(--stage-text-primary)]">{email}</span>
                      </p>
                      {otpError && (
                        <div className="p-3 rounded-xl bg-surface-error border border-unusonic-error/40">
                          <AuthErrorBlock error={otpError} />
                        </div>
                      )}
                      <motion.button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={isPending || !signInEmailValid}
                        className="w-full h-12 rounded-xl font-medium text-sm bg-[var(--stage-accent)]/80 text-[oklch(0.10_0_0)] hover:bg-[var(--stage-accent)] disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-colors duration-100"
                      >
                        {isOtpPending ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Sending code...</>
                        ) : (
                          'Send sign-in code'
                        )}
                      </motion.button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-[var(--stage-text-secondary)] text-center">
                        Enter the code sent to <span className="text-[var(--stage-text-primary)]">{email}</span>
                      </p>
                      <p className="text-xs text-[var(--stage-text-tertiary)] text-center">
                        Check your spam folder. You can request a new code in 30 seconds.
                      </p>
                      <input
                        ref={otpInputRef}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        disabled={isPending}
                        className="w-full h-12 px-4 rounded-xl bg-[oklch(0.10_0_0_/_0.50)] border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] text-center text-lg tracking-[0.3em] font-mono placeholder:text-[var(--stage-text-secondary)] placeholder:tracking-normal placeholder:text-sm placeholder:font-sans focus:outline-none focus-visible:border-[oklch(1_0_0_/_0.12)] focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-45 disabled:cursor-not-allowed transition-colors duration-[80ms]"
                        placeholder="000000"
                      />
                      {otpError && (
                        <div className="p-3 rounded-xl bg-surface-error border border-unusonic-error/40">
                          <AuthErrorBlock error={otpError} />
                        </div>
                      )}
                      <motion.button
                        type="button"
                        onClick={handleVerifyOtp}
                        disabled={isPending || otpCode.length !== 6}
                        className="w-full h-12 rounded-xl font-medium text-sm bg-[var(--stage-accent)]/80 text-[oklch(0.10_0_0)] hover:bg-[var(--stage-accent)] disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-colors duration-100"
                      >
                        {isOtpPending ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
                        ) : (
                          <>Verify code <ArrowRight className="w-4 h-4" /></>
                        )}
                      </motion.button>
                      <button
                        type="button"
                        onClick={() => { setOtpSent(false); setOtpCode(''); setOtpError(null); }}
                        disabled={isPending}
                        className="w-full text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors disabled:opacity-45"
                      >
                        Resend code
                      </button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="sign-in-options"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  <motion.button
                    type="button"
                    onClick={() => setShowPasswordForm(true)}
                    disabled={isPending}
                    className="w-full text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed text-center"
                  >
                    Sign in with password
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setShowOtpForm(true)}
                    disabled={isPending || !signInEmailValid}
                    className="w-full text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed text-center"
                  >
                    Send sign-in code to email
                  </motion.button>
                </motion.div>
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
                  className="text-sm text-[var(--stage-text-tertiary)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
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
