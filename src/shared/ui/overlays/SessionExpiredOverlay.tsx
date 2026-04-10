'use client';

/**
 * Lock-screen overlay shown when the session expires.
 *
 * Instead of redirecting to /login (which destroys all React state, scroll
 * position, and form inputs), this overlay renders on top of the current page
 * with a backdrop blur. The user taps their passkey to re-authenticate in
 * place. After success, the overlay lifts and the page is exactly as they
 * left it.
 *
 * Inspired by 1Password's lock screen and Google Docs' "Sign in to save" overlay.
 *
 * @module shared/ui/overlays/SessionExpiredOverlay
 */

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStatusStore } from '@/shared/lib/auth/auth-status-store';
import { reauthenticatePasskey } from '@/shared/lib/auth/reauthenticate-passkey';
import { sendOtpAction, verifyOtpAction } from '@/features/auth/smart-login/api/actions';
import { createClient } from '@/shared/api/supabase/client';
import { getQueryClient } from '@/shared/api/query-client';
import { STAGE_HEAVY, STAGE_MEDIUM } from '@/shared/lib/motion-constants';

export function SessionExpiredOverlay() {
  const sessionExpired = useAuthStatusStore((s) => s.sessionExpired);
  const setSessionExpired = useAuthStatusStore((s) => s.setSessionExpired);

  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isOtpPending, setIsOtpPending] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const handleReauth = useCallback(async () => {
    setStatus('authenticating');
    setErrorMessage('');

    const result = await reauthenticatePasskey();

    if (result.ok) {
      // Force the Supabase client to pick up the new cookies
      const supabase = createClient();
      await supabase.auth.refreshSession();
      setStatus('idle');
      setSessionExpired(false);
      // Re-render server components and refetch all queries with the new session
      router.refresh();
      getQueryClient().invalidateQueries();
    } else {
      setStatus('error');
      setErrorMessage(result.error);
    }
  }, [setSessionExpired]);

  const handleFallback = useCallback(() => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/login?reason=session_expired&redirect=${encodeURIComponent(returnTo)}`;
  }, []);

  const handleSendOtp = useCallback(async () => {
    if (!otpEmail.trim() || isOtpPending) return;
    setIsOtpPending(true);
    setOtpError(null);
    const result = await sendOtpAction(otpEmail.trim());
    setIsOtpPending(false);
    if (result.ok) {
      setOtpSent(true);
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } else {
      setOtpError(result.error);
    }
  }, [otpEmail, isOtpPending]);

  const handleVerifyOtp = useCallback(async () => {
    if (!otpEmail.trim() || !otpCode || isOtpPending) return;
    setIsOtpPending(true);
    setOtpError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: otpEmail.trim(),
        token: otpCode,
        type: 'email',
      });
      if (error) {
        setOtpError('Invalid or expired code. Try again.');
        setIsOtpPending(false);
        return;
      }
      // Success — restore session in-place
      setIsOtpPending(false);
      setSessionExpired(false);
      setShowOtp(false);
      setOtpSent(false);
      setOtpCode('');
      router.refresh();
      getQueryClient().invalidateQueries();
    } catch {
      setOtpError('Verification failed. Try again.');
      setIsOtpPending(false);
    }
  }, [otpEmail, otpCode, isOtpPending, setSessionExpired, router]);

  return (
    <AnimatePresence>
      {sessionExpired && (
        <motion.div
          key="session-expired-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
        >
          {/* Scrim */}
          <div className="absolute inset-0 bg-[oklch(0.06_0_0/0.80)]" />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={STAGE_HEAVY}
            className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-[oklch(1_0_0_/_0.06)] p-8 text-center"
            style={{ background: 'var(--stage-surface, oklch(0.18 0.004 50))' }}
          >
            {/* Lock icon */}
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[oklch(1_0_0_/_0.06)]"
              style={{ background: 'var(--stage-surface-elevated, oklch(0.22 0.004 50))' }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--stage-text-primary)]"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <h2
              className="text-[var(--stage-text-primary)] font-medium tracking-tight mb-1.5"
              style={{ fontSize: 'var(--stage-readout-lg-size, 1.375rem)' }}
            >
              Session expired
            </h2>

            <p className="text-[var(--stage-text-secondary)] text-sm leading-relaxed mb-6">
              Your session timed out. Tap to sign back in — you won&apos;t lose your place.
            </p>

            {/* Error message */}
            <AnimatePresence mode="wait">
              {status === 'error' && errorMessage && (
                <motion.p
                  key="error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={STAGE_MEDIUM}
                  className="text-unusonic-error text-sm mb-4"
                >
                  {errorMessage}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Primary action: passkey re-auth */}
            <button
              onClick={handleReauth}
              disabled={status === 'authenticating'}
              className="w-full rounded-xl px-4 py-3 text-sm font-medium tracking-tight transition-colors disabled:opacity-45 stage-btn stage-btn-primary"
            >
              {status === 'authenticating' ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verifying...
                </span>
              ) : (
                'Sign in with passkey'
              )}
            </button>

            {/* OTP fallback — in-place, no state loss */}
            <AnimatePresence mode="wait">
              {showOtp ? (
                <motion.div
                  key="otp"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={STAGE_MEDIUM}
                  className="mt-4 space-y-3 overflow-hidden"
                >
                  {!otpSent ? (
                    <>
                      <input
                        type="email"
                        value={otpEmail}
                        onChange={(e) => setOtpEmail(e.target.value)}
                        placeholder="your@email.com"
                        autoComplete="email"
                        disabled={isOtpPending}
                        className="w-full h-11 px-4 rounded-xl bg-[oklch(0.10_0_0_/_0.50)] border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-45 text-sm transition-colors"
                      />
                      {otpError && <p className="text-unusonic-error text-xs">{otpError}</p>}
                      <button
                        onClick={handleSendOtp}
                        disabled={isOtpPending || !otpEmail.trim()}
                        className="w-full rounded-xl px-4 py-2.5 text-sm font-medium border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors disabled:opacity-45"
                      >
                        {isOtpPending ? 'Sending...' : 'Send sign-in code'}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-[var(--stage-text-secondary)]">
                        Code sent to {otpEmail}
                      </p>
                      <input
                        ref={otpInputRef}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        disabled={isOtpPending}
                        placeholder="000000"
                        className="w-full h-11 px-4 rounded-xl bg-[oklch(0.10_0_0_/_0.50)] border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] text-center text-lg tracking-[0.3em] font-mono placeholder:text-[var(--stage-text-secondary)] placeholder:tracking-normal placeholder:text-sm placeholder:font-sans focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-45 transition-colors"
                      />
                      {otpError && <p className="text-unusonic-error text-xs">{otpError}</p>}
                      <button
                        onClick={handleVerifyOtp}
                        disabled={isOtpPending || otpCode.length !== 6}
                        className="w-full rounded-xl px-4 py-2.5 text-sm font-medium border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors disabled:opacity-45"
                      >
                        {isOtpPending ? 'Verifying...' : 'Verify code'}
                      </button>
                    </>
                  )}
                </motion.div>
              ) : (
                <motion.div key="fallback-options" className="mt-3 space-y-1.5">
                  <button
                    onClick={() => setShowOtp(true)}
                    className="w-full text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors py-1.5"
                  >
                    Sign in with email code
                  </button>
                  <button
                    onClick={handleFallback}
                    className="w-full text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors py-1"
                  >
                    Sign in another way
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
