'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/shared/api/supabase/client';
import { useAuthStatusStore } from '@/shared/lib/auth/auth-status-store';
import { decodeJwtExp } from '@/shared/lib/auth/decode-jwt-exp';

/**
 * Client-side auth guard — visibility-based session monitoring.
 *
 * Instead of polling every 2 minutes, this guard checks session validity:
 *   1. On `visibilitychange` (tab becomes visible again)
 *   2. On first user interaction after 5+ minutes of idle
 *   3. Via `onAuthStateChange` for real-time Supabase events
 *
 * When the session is gone, sets `sessionExpired = true` in the auth status
 * store. The SessionExpiredOverlay reads that flag and renders a lock-screen
 * re-auth overlay — no redirect, no state loss.
 *
 * @see docs/reference/auth/session-management.md
 */

/** Minimum idle gap (ms) before an interaction triggers a session check. */
const INTERACTION_CHECK_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/** If the access token expires within this buffer, proactively refresh. */
const REFRESH_BUFFER_S = 60; // 1 minute

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const lastCheckRef = useRef(Date.now());
  const setSessionExpired = useAuthStatusStore((s) => s.setSessionExpired);

  /**
   * Core session check:
   * 1. Read cached session (no network call)
   * 2. If access token expires within REFRESH_BUFFER_S → attempt refresh
   * 3. If refresh fails → mark session as expired (overlay appears)
   */
  const checkSession = useCallback(async () => {
    lastCheckRef.current = Date.now();

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    // No session at all — expired
    if (!session) {
      setSessionExpired(true);
      return;
    }

    // Decode the access token to check expiry locally
    const exp = decodeJwtExp(session.access_token);
    const nowS = Math.floor(Date.now() / 1000);

    if (exp !== null && exp - nowS < REFRESH_BUFFER_S) {
      // Token about to expire — try a silent refresh
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        setSessionExpired(true);
      }
    }
  }, [setSessionExpired]);

  useEffect(() => {
    const supabase = createClient();

    // ── Real-time auth events ──────────────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setSessionExpired(true);
      }
      // Successful refresh or sign-in clears the expired flag
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSessionExpired(false);
      }
    });

    // ── Visibility-based check ─────────────────────────────────────────
    // Fires when the user returns to the tab after any period away.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // ── Interaction-after-idle check ───────────────────────────────────
    // If the tab stayed in the foreground but the user walked away,
    // the first interaction after 5+ minutes of idle triggers a check.
    const handleInteraction = () => {
      const elapsed = Date.now() - lastCheckRef.current;
      if (elapsed >= INTERACTION_CHECK_THRESHOLD_MS) {
        checkSession();
      }
    };
    const interactionEvents = ['mousedown', 'keydown', 'touchstart'] as const;
    interactionEvents.forEach((ev) =>
      document.addEventListener(ev, handleInteraction, { passive: true })
    );

    // ── Initial check on mount ─────────────────────────────────────────
    checkSession();

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
      interactionEvents.forEach((ev) =>
        document.removeEventListener(ev, handleInteraction)
      );
    };
  }, [checkSession, setSessionExpired]);

  return <>{children}</>;
}
