/**
 * Lobby reminder card: "Set up recovery guardians".
 *
 * Shown only when ALL of the following hold:
 *   - `AUTH_V2_GUARDIAN_GATE` flag is on (passed in as a prop from the
 *     dashboard layout, which reads it server-side).
 *   - Viewer is an `owner` or `admin` of the active workspace (the only
 *     roles that own recovery material; employees get owner-mediated
 *     recovery per §9 of the login redesign doc, not guardians).
 *   - Viewer's guardian count is below the Shamir threshold (2).
 *   - Viewer hasn't dismissed the reminder in the last 24 hours.
 *
 * Dismissing stores a timestamp in `localStorage` under
 * `unusonic_guardian_reminder_dismissed_until`. After that window expires,
 * the card reappears on the next lobby visit — persistent but not
 * aggressive.
 *
 * Separate from `RecoveryBackupPrompt` (which nudges users to back up their
 * recovery phrase after a week of use). That prompt fires on Day 7 and
 * gates on `has_recovery_kit`; this one fires immediately after any
 * deferred-or-incomplete guardian decision and gates on guardian count.
 * They can co-exist in the layout; a user who deferred both will see both.
 *
 * @module widgets/guardian-setup-reminder/GuardianSetupReminder
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, X } from 'lucide-react';
import { getGuardianSetupState } from '@/features/onboarding/api/guardian-actions';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';

const DISMISS_KEY = 'unusonic_guardian_reminder_dismissed_until';
const DISMISS_HOURS = 24;

export interface GuardianSetupReminderProps {
  /**
   * Resolved server-side from `AUTH_V2_GUARDIAN_GATE`. When false, the card
   * returns null — no DOM, no effects, no data fetch. Passing it in as a
   * prop keeps the flag out of the client bundle.
   */
  flagEnabled: boolean;
}

/**
 * Lobby reminder card for guardians under threshold. Kept in `widgets/`
 * because it composes Workspace context + a server action + local-storage
 * dismissal — exactly the shape `RecoveryBackupPrompt` lives at.
 */
export function GuardianSetupReminder({ flagEnabled }: GuardianSetupReminderProps) {
  const { role } = useWorkspace();
  const eligibleRole = role === 'owner' || role === 'admin';
  const enabled = flagEnabled && eligibleRole;

  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<{ count: number; threshold: number } | null>(null);
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null);
  // clientNow is set once on mount (not per-render) so the widget stays
  // pure. Recomputing it after a dismissal click is intentional and lives
  // inside handleDismiss below.
  const [clientNow, setClientNow] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(DISMISS_KEY);
        if (raw) setDismissedUntil(parseInt(raw, 10));
      } catch {
        // ignore
      }
      setMounted(true);
      setClientNow(Date.now());
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getGuardianSetupState().then((result) => {
      if (cancelled || !result) return;
      setState({ count: result.guardianCount, threshold: result.threshold });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;
  if (!mounted || !state || clientNow === null) return null;

  const underThreshold = state.count < state.threshold;
  const isDismissed = dismissedUntil !== null && clientNow < dismissedUntil;

  if (!underThreshold || isDismissed) return null;

  function handleDismiss() {
    const until = Date.now() + DISMISS_HOURS * 60 * 60 * 1000;
    try {
      localStorage.setItem(DISMISS_KEY, String(until));
      setDismissedUntil(until);
    } catch {
      // ignore
    }
  }

  return (
    <div
      role="status"
      className="mx-4 mt-3 lg:mx-6 stage-panel rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.14)] bg-[var(--stage-surface)] p-4 flex items-start gap-4"
    >
      <ShieldCheck
        className="w-5 h-5 text-[var(--stage-accent)] shrink-0 mt-0.5"
        strokeWidth={1.5}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--stage-text-primary)]">
          Set up recovery guardians
        </p>
        <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mt-1">
          {state.count === 0
            ? `Add at least ${state.threshold} people you trust. If you lose your device, they can help you back in.`
            : `You have ${state.count} of ${state.threshold} guardians. Add one more to finish your recovery setup.`}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Link
            href="/settings/security"
            className="stage-btn stage-btn-ghost px-3"
          >
            Finish setup
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors leading-relaxed"
          >
            Remind me tomorrow
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="p-1 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors shrink-0"
      >
        <X className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
