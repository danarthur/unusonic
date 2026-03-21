'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shield, X } from 'lucide-react';
import { getRecoveryStatus } from '@/features/sovereign-recovery/api/get-recovery-status';

const DISMISS_KEY = 'signal_recovery_prompt_dismissed_until';
const DISMISS_DAYS = 7;
const MIN_ACCOUNT_AGE_DAYS = 7;

/** Progressive onboarding: prompt to back up account (Day 7 / high-value moment). Not shown on Day 1. */
export function RecoveryBackupPrompt() {
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
      const raw = localStorage.getItem(DISMISS_KEY);
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
  const showByAge = accountAgeDays >= MIN_ACCOUNT_AGE_DAYS;

  const visible =
    mounted && status != null && !hasRecoveryKit && showByAge && !isDismissed;

  function handleDismiss() {
    const until = now + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    try {
      localStorage.setItem(DISMISS_KEY, String(until));
      setDismissedUntil(until);
    } catch {
      // ignore
    }
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      className="liquid-card rounded-2xl border border-neon-blue/25 bg-neon-blue/5 backdrop-blur-xl p-4 flex items-start gap-4"
    >
      <Shield className="w-5 h-5 text-neon shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ceramic">Back up your account</p>
        <p className="text-sm text-muted leading-relaxed mt-1">
          Ensure you never get locked out. Set up a recovery kit with your Safety Net guardians.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link
            href="/settings/security"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-blue/20 text-neon hover:bg-neon-blue/30 transition-colors text-sm font-medium"
          >
            Back up now
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-sm text-muted hover:text-ceramic transition-colors leading-relaxed"
          >
            Remind me later
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="p-1 rounded-lg text-muted hover:text-ceramic hover:bg-white/10 transition-colors shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
