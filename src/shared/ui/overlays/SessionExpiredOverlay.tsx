'use client';

/**
 * Lock-screen overlay shown when the session expires.
 *
 * Instead of redirecting to /login (which destroys all React state, scroll
 * position, and form inputs), this overlay renders on top of the current page
 * with a backdrop scrim. The user taps their Face ID / Touch ID / Windows
 * Hello to re-authenticate in place. After success, the overlay lifts and
 * the page is exactly as they left it.
 *
 * Inspired by 1Password's lock screen and Google Docs' "Sign in to save"
 * overlay.
 *
 * ## Phase 4 changes
 *
 * - The 6-digit-OTP fallback is replaced by a magic-link send when
 *   `AUTH_V2_LOGIN_CARD` is ON. The OTP code path remains in place behind
 *   the flag for rollback. After the flag ships 100%, the OTP branch gets
 *   deleted as part of cleanup.
 * - Primary CTA uses device-aware copy via `getDeviceCopy()`. Never
 *   "Sign in with passkey".
 * - Every input and button migrates to `stage-input` / `stage-btn stage-btn-*`
 *   primitives. The hand-rolled `bg-[oklch(...)]` / `ring-ring/30` patterns
 *   called out in the 2026-04-18 design audit are gone.
 *
 * @module shared/ui/overlays/SessionExpiredOverlay
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Lock, Mail } from 'lucide-react';

import { useAuthStatusStore } from '@/shared/lib/auth/auth-status-store';
import { reauthenticatePasskey } from '@/shared/lib/auth/reauthenticate-passkey';
import {
  sendMagicLinkAction,
  sendOtpAction,
  verifyOtpAction,
} from '@/features/auth/smart-login/api/actions';
import { createClient } from '@/shared/api/supabase/client';
import { getQueryClient } from '@/shared/api/query-client';
import { STAGE_HEAVY, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { classifyUserAgent } from '@/shared/lib/auth/classify-user-agent';
import {
  deviceCapabilityFromUserAgentClass,
  getDeviceCopy,
} from '@/shared/lib/auth/device-copy';

interface SessionExpiredOverlayProps {
  /**
   * Phase 4 flag. OFF → legacy OTP fallback (unchanged); ON → magic-
   * link fallback. Defaults to OFF so rollout is a flag flip.
   *
   * Read server-side in the route that mounts the overlay and passed
   * in as a prop — never `process.env` in a client component.
   */
  authV2LoginCard?: boolean;
}

type FallbackStep = 'idle' | 'otp-email' | 'otp-code' | 'magic-link-sent';

export function SessionExpiredOverlay({
  authV2LoginCard = false,
}: SessionExpiredOverlayProps = {}) {
  const sessionExpired = useAuthStatusStore((s) => s.sessionExpired);
  const setSessionExpired = useAuthStatusStore((s) => s.setSessionExpired);

  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [fallbackStep, setFallbackStep] = useState<FallbackStep>('idle');
  const [fallbackEmail, setFallbackEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isFallbackPending, setIsFallbackPending] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Device-aware copy — decides on first mount so copy stays stable
  // across subsequent re-renders.
  const deviceCopy = useMemo(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return getDeviceCopy(deviceCapabilityFromUserAgentClass(classifyUserAgent(ua)));
  }, []);

  const handleReauth = useCallback(async () => {
    setStatus('authenticating');
    setErrorMessage('');

    const result = await reauthenticatePasskey();

    if (result.ok) {
      const supabase = createClient();
      await supabase.auth.refreshSession();
      setStatus('idle');
      setSessionExpired(false);
      router.refresh();
      getQueryClient().invalidateQueries();
    } else {
      setStatus('error');
      setErrorMessage(result.error);
    }
  }, [router, setSessionExpired]);

  const handleEscapeHatch = useCallback(() => {
    // The one sanctioned client-side redirect to /login. Per
    // docs/reference/code/session-management.md §3.
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/login?reason=session_expired&redirect=${encodeURIComponent(returnTo)}`;
  }, []);

  // ── Fallback: magic link (new path, flag ON) ───────────────────────
  const handleSendMagicLink = useCallback(async () => {
    const trimmed = fallbackEmail.trim().toLowerCase();
    if (!trimmed || isFallbackPending) return;
    setIsFallbackPending(true);
    setOtpError(null);
    const result = await sendMagicLinkAction(trimmed);
    setIsFallbackPending(false);
    if (result.ok) {
      setFallbackStep('magic-link-sent');
    } else {
      setOtpError(result.error);
    }
  }, [fallbackEmail, isFallbackPending]);

  // ── Fallback: OTP (legacy path, flag OFF) ──────────────────────────
  const handleSendOtp = useCallback(async () => {
    const trimmed = fallbackEmail.trim().toLowerCase();
    if (!trimmed || isFallbackPending) return;
    setIsFallbackPending(true);
    setOtpError(null);
    const result = await sendOtpAction(trimmed);
    setIsFallbackPending(false);
    if (result.ok) {
      setFallbackStep('otp-code');
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } else {
      setOtpError(result.error);
    }
  }, [fallbackEmail, isFallbackPending]);

  const handleVerifyOtp = useCallback(async () => {
    const trimmed = fallbackEmail.trim().toLowerCase();
    if (!trimmed || !otpCode || isFallbackPending) return;
    setIsFallbackPending(true);
    setOtpError(null);
    try {
      // Server action does the verify; on success it redirects, so we
      // never actually get here with a success path unless the action
      // returns cleanly. Using the client supabase here preserves the
      // overlay-in-place behavior — no navigation.
      const result = await verifyOtpAction(trimmed, otpCode);
      if (!('ok' in result) || !result.ok) {
        setOtpError('Invalid or expired code. Try again.');
        setIsFallbackPending(false);
        return;
      }
      const supabase = createClient();
      await supabase.auth.refreshSession();
      setIsFallbackPending(false);
      setSessionExpired(false);
      setFallbackStep('idle');
      setOtpCode('');
      router.refresh();
      getQueryClient().invalidateQueries();
    } catch {
      setOtpError('Verification failed. Try again.');
      setIsFallbackPending(false);
    }
  }, [fallbackEmail, otpCode, isFallbackPending, setSessionExpired, router]);

  // Overlay state is deliberately not reset on close — a subsequent
  // expiration will take the same code paths, and any stale field is
  // cleared by the relevant handler on the next user action (e.g.
  // `fallbackStep === 'idle'` is the default for a fresh open). Avoids
  // a setState-in-effect pattern that the repo's lint rules flag.
  // If users report stale UI after a rapid close→reopen, the cleanest
  // fix is to key the inner Card with a session-expired counter and
  // let React remount the subtree.

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
          <div
            className="absolute inset-0 bg-[var(--stage-void)]/80"
            aria-hidden
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={STAGE_HEAVY}
            className="stage-panel relative z-10 w-full max-w-sm mx-4 p-[var(--stage-padding)] text-center"
            data-surface="card"
          >
            {/* Lock icon */}
            <div className="stage-panel-nested mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full">
              <Lock
                className="h-5 w-5 text-[var(--stage-text-primary)]"
                strokeWidth={1.5}
              />
            </div>

            <h2
              className="text-[var(--stage-text-primary)] font-medium tracking-tight mb-1.5"
              style={{ fontSize: 'var(--stage-readout-lg-size, 1.375rem)' }}
            >
              Session expired
            </h2>

            <p className="text-[var(--stage-text-secondary)] text-sm leading-relaxed mb-6">
              Your session timed out. Sign back in — you won&apos;t lose
              your place.
            </p>

            <AnimatePresence mode="wait">
              {status === 'error' && errorMessage && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={STAGE_MEDIUM}
                  className="overflow-hidden mb-4"
                >
                  <div className="stage-panel-nested stage-stripe-error p-3">
                    <p className="text-unusonic-error text-sm">{errorMessage}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Primary: device-aware passkey re-auth. Never "passkey". */}
            <button
              onClick={handleReauth}
              disabled={status === 'authenticating'}
              className="stage-btn stage-btn-primary w-full flex items-center justify-center gap-2"
              data-testid="session-expired-primary"
            >
              {status === 'authenticating' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                  {deviceCopy.pendingStatus}
                </>
              ) : (
                deviceCopy.signInPrimaryCta
              )}
            </button>

            {/* Fallback region */}
            <AnimatePresence mode="wait">
              {fallbackStep === 'idle' ? (
                <motion.div
                  key="fallback-options"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={STAGE_MEDIUM}
                  className="mt-3 space-y-1.5"
                >
                  <button
                    onClick={() => setFallbackStep('otp-email')}
                    className="w-full text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors py-1.5"
                    data-testid="session-expired-fallback"
                  >
                    {authV2LoginCard
                      ? 'Send magic link to email'
                      : 'Sign in with email code'}
                  </button>
                  <button
                    onClick={handleEscapeHatch}
                    className="w-full text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors py-1"
                  >
                    Sign in another way
                  </button>
                </motion.div>
              ) : fallbackStep === 'otp-email' ? (
                <motion.div
                  key="otp-email"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={STAGE_MEDIUM}
                  className="mt-4 space-y-3 overflow-hidden"
                >
                  <input
                    type="email"
                    value={fallbackEmail}
                    onChange={(e) => setFallbackEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={isFallbackPending}
                    className="stage-input"
                  />
                  {otpError && (
                    <div className="stage-panel-nested stage-stripe-error p-3">
                      <p className="text-unusonic-error text-xs">{otpError}</p>
                    </div>
                  )}
                  <button
                    onClick={authV2LoginCard ? handleSendMagicLink : handleSendOtp}
                    disabled={isFallbackPending || !fallbackEmail.trim()}
                    className="stage-btn stage-btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {isFallbackPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                        Sending…
                      </>
                    ) : authV2LoginCard ? (
                      <>
                        <Mail className="w-4 h-4" strokeWidth={1.5} />
                        Send magic link
                      </>
                    ) : (
                      'Send sign-in code'
                    )}
                  </button>
                </motion.div>
              ) : fallbackStep === 'otp-code' ? (
                <motion.div
                  key="otp-code"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={STAGE_MEDIUM}
                  className="mt-4 space-y-3 overflow-hidden"
                >
                  <p className="text-xs text-[var(--stage-text-secondary)]">
                    Code sent to {fallbackEmail}
                  </p>
                  <input
                    ref={otpInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={isFallbackPending}
                    placeholder="000000"
                    className="stage-input text-center text-lg tracking-[0.3em] font-mono placeholder:tracking-normal placeholder:text-sm placeholder:font-sans"
                  />
                  {otpError && (
                    <div className="stage-panel-nested stage-stripe-error p-3">
                      <p className="text-unusonic-error text-xs">{otpError}</p>
                    </div>
                  )}
                  <button
                    onClick={handleVerifyOtp}
                    disabled={isFallbackPending || otpCode.length !== 6}
                    className="stage-btn stage-btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {isFallbackPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                        Verifying…
                      </>
                    ) : (
                      'Verify code'
                    )}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="magic-link-sent"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={STAGE_MEDIUM}
                  className="mt-4 space-y-2 overflow-hidden"
                >
                  <div className="stage-panel-nested px-4 py-3">
                    <p className="text-sm text-[var(--stage-text-primary)] flex items-center justify-center gap-2">
                      <Mail className="w-4 h-4" strokeWidth={1.5} />
                      Check your email
                    </p>
                    <p className="text-xs text-[var(--stage-text-secondary)] text-center mt-1">
                      We sent a link to {fallbackEmail}.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFallbackStep('otp-email');
                      setOtpCode('');
                      setOtpError(null);
                    }}
                    className="w-full text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
                  >
                    Send again
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
