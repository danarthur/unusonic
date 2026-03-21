'use client';

import { useState, useEffect } from 'react';
import { getRecoveryStatus } from '../api/get-recovery-status';

export const RECOVERY_DISMISS_KEY = 'signal_recovery_prompt_dismissed_until';
export const RECOVERY_DISMISS_DAYS = 7;
export const RECOVERY_MIN_ACCOUNT_AGE_DAYS = 7;

export type RecoveryNeededState = {
  recoveryNeeded: boolean;
  dismiss: () => void;
};

/**
 * Returns whether to show recovery backup prompt and a dismiss handler.
 * Used by Global Pulse Strip (icon + popover) and optionally by toast.
 */
export function useRecoveryNeeded(): RecoveryNeededState {
  const [status, setStatus] = useState<{
    hasRecoveryKit: boolean;
    accountCreatedAt: string | null;
  } | null>(null);
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    getRecoveryStatus().then(setStatus);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECOVERY_DISMISS_KEY);
      if (raw) setDismissedUntil(parseInt(raw, 10));
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  const now = Date.now();
  const isDismissed = dismissedUntil != null && now < dismissedUntil;
  const hasRecoveryKit = status?.hasRecoveryKit ?? false;
  const accountCreatedAt = status?.accountCreatedAt;
  const accountAgeDays = accountCreatedAt
    ? (now - new Date(accountCreatedAt).getTime()) / (24 * 60 * 60 * 1000)
    : 999;
  const showByAge = accountAgeDays >= RECOVERY_MIN_ACCOUNT_AGE_DAYS;
  const recoveryNeeded =
    mounted && status != null && !hasRecoveryKit && showByAge && !isDismissed;

  function dismiss() {
    const until = now + RECOVERY_DISMISS_DAYS * 24 * 60 * 60 * 1000;
    try {
      localStorage.setItem(RECOVERY_DISMISS_KEY, String(until));
      setDismissedUntil(until);
    } catch {
      // ignore
    }
  }

  return { recoveryNeeded, dismiss };
}
