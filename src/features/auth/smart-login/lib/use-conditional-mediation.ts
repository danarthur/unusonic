/**
 * Hook: conditional mediation for passkey autofill on email focus.
 * Delays 220ms so password managers (e.g. NordPass) can open first.
 * Runs at most ONCE per page load — once the user cancels or the ceremony
 * completes, it does not re-trigger on subsequent focus events.
 * @module features/auth/smart-login/lib/use-conditional-mediation
 */

import { useRef, useEffect, useCallback } from 'react';
import { runConditionalMediation } from '@/features/auth/passkey-authenticate/api/authenticate-passkey';

interface UseConditionalMediationOptions {
  enabled: boolean;
  redirectTo?: string;
  onError: (error: string) => void;
}

export function useConditionalMediation({
  enabled,
  redirectTo,
  onError,
}: UseConditionalMediationOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True once mediation has been attempted (success, failure, or cancel). Never resets. */
  const hasAttemptedRef = useRef(false);
  /** True while the 220ms delay or ceremony is in-flight for this focus. Resets on blur. */
  const inFlightThisFocusRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const handleEmailFocus = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (!('PublicKeyCredential' in window)) return;
    // Only attempt conditional mediation once per page load
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
  }, [enabled, redirectTo, onError]);

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
