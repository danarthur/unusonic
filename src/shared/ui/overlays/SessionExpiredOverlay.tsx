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

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStatusStore } from '@/shared/lib/auth/auth-status-store';
import { reauthenticatePasskey } from '@/shared/lib/auth/reauthenticate-passkey';
import { createClient } from '@/shared/api/supabase/client';
import { STAGE_HEAVY, STAGE_MEDIUM } from '@/shared/lib/motion-constants';

export function SessionExpiredOverlay() {
  const sessionExpired = useAuthStatusStore((s) => s.sessionExpired);
  const setSessionExpired = useAuthStatusStore((s) => s.setSessionExpired);

  const [status, setStatus] = useState<'idle' | 'authenticating' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

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
    } else {
      setStatus('error');
      setErrorMessage(result.error);
    }
  }, [setSessionExpired]);

  const handleFallback = useCallback(() => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/login?reason=session_expired&redirect=${encodeURIComponent(returnTo)}`;
  }, []);

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
          style={{ backdropFilter: 'blur(20px) saturate(0.8)' }}
        >
          {/* Scrim */}
          <div className="absolute inset-0 bg-obsidian/80" />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={STAGE_HEAVY}
            className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-white/[0.06] p-8 text-center"
            style={{ background: 'var(--stage-surface, oklch(0.18 0.004 50))' }}
          >
            {/* Lock icon */}
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.06]"
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
                className="text-ink"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <h2
              className="text-ink font-semibold tracking-tight mb-1.5"
              style={{ fontSize: 'var(--stage-readout-lg-size, 1.375rem)' }}
            >
              Session expired
            </h2>

            <p className="text-ink-muted text-sm leading-relaxed mb-6">
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
              className="w-full rounded-xl px-4 py-3 text-sm font-medium tracking-tight transition-colors disabled:opacity-50"
              style={{
                background: 'oklch(0.88 0 0)',
                color: 'oklch(0.13 0.004 50)',
              }}
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

            {/* Fallback */}
            <button
              onClick={handleFallback}
              className="mt-3 w-full text-sm text-ink-muted hover:text-ink transition-colors py-1.5"
            >
              Sign in another way
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
