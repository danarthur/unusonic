/**
 * Hook: conditional mediation for passkey autofill on email focus.
 *
 * Delays 220ms so password managers (e.g. NordPass) can open first.
 * Runs at most ONCE per page load — once the user cancels or the
 * ceremony completes, it does not re-trigger on subsequent focus events.
 *
 * ## Phase 4 addition — session-expired auto-fire
 *
 * When the hook is instantiated with `autoFire: true` (used by the
 * `/login?reason=session_expired` variant), the conditional mediation
 * ceremony is scheduled on mount without waiting for a focus event.
 * Per `docs/reference/login-redesign-design.md` §6, the session-expired
 * surface should run the ceremony automatically — the user should not
 * have to tap the field for the Face ID prompt to appear.
 *
 * The one-shot guard (`hasAttemptedRef`) still applies: auto-fire
 * counts as the single attempt for this page load, so a subsequent
 * focus event will NOT re-trigger mediation.
 *
 * @module features/auth/smart-login/lib/use-conditional-mediation
 */

import { useRef, useEffect, useCallback } from 'react';
import { runConditionalMediation } from '@/features/auth/passkey-authenticate/api/authenticate-passkey';

interface UseConditionalMediationOptions {
  enabled: boolean;
  redirectTo?: string;
  onError: (error: string) => void;
  /**
   * When true, schedule a single mediation attempt on mount — used by
   * the session-expired variant. Defaults to false (focus-triggered,
   * the original Phase 2 behavior).
   */
  autoFire?: boolean;
}

export function useConditionalMediation({
  enabled,
  redirectTo,
  onError,
  autoFire = false,
}: UseConditionalMediationOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True once mediation has been attempted (success, failure, or cancel). Never resets. */
  const hasAttemptedRef = useRef(false);
  /** True while the 220ms delay or ceremony is in-flight for this focus. Resets on blur. */
  const inFlightThisFocusRef = useRef(false);

  /** Schedule the ceremony after the 220ms delay. Idempotent — no-op if already attempted. */
  const scheduleMediation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!('PublicKeyCredential' in window)) return;
    if (hasAttemptedRef.current) return;
    if (inFlightThisFocusRef.current) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    inFlightThisFocusRef.current = true;
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      hasAttemptedRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      void runConditionalMediation(redirectTo).then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          onError(result.error);
        }
      });
    }, 220);
  }, [redirectTo, onError]);

  useEffect(() => {
    if (enabled && autoFire) {
      scheduleMediation();
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, [enabled, autoFire, scheduleMediation]);

  const handleEmailFocus = useCallback(() => {
    if (!enabled) return;
    scheduleMediation();
  }, [enabled, scheduleMediation]);

  const handleEmailBlur = useCallback(() => {
    // Cancel the 220ms delay if user blurs before it fires
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      // Delay hadn't fired yet, so mediation wasn't attempted — allow retry on next focus
      inFlightThisFocusRef.current = false;
    }
  }, []);

  return { handleEmailFocus, handleEmailBlur };
}
