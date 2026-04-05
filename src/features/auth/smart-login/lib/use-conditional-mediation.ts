/**
 * Hook: conditional mediation for passkey autofill on email focus.
 * Delays 220ms so password managers (e.g. NordPass) can open first.
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
  const hasRunThisFocusRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const handleEmailFocus = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (!('PublicKeyCredential' in window)) return;
    if (hasRunThisFocusRef.current) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      hasRunThisFocusRef.current = true;
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
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    hasRunThisFocusRef.current = false;
  }, []);

  return { handleEmailFocus, handleEmailBlur };
}
