/**
 * Post-login passkey enrollment nudge.
 * Shows when user signed in with password and has no passkeys.
 * Matches RecoveryBackupPrompt pattern: progressive, dismissible, time-gated.
 * @module widgets/passkey-nudge-banner/PasskeyNudgeBanner
 */

'use client';

import { useState, useEffect } from 'react';
import { Fingerprint, X, Loader2 } from 'lucide-react';
import { registerPasskey } from '@/features/passkey-registration';
import {
  getPasskeyNudgeState,
  dismissPasskeyNudge,
} from '@/features/auth/passkey-management/api/actions';
import { guessDeviceName } from '@/features/auth/passkey-management/lib/guess-device-name';

const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CACHE_KEY = 'unusonic_passkey_nudge';

/** Device-aware CTA label. */
function getSetupLabel(): string {
  if (typeof navigator === 'undefined') return 'Set up';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad')) return 'Set up Face ID';
  if (ua.includes('mac') && (ua.includes('safari') || ua.includes('chrome'))) return 'Set up Touch ID';
  if (ua.includes('windows')) return 'Set up Windows Hello';
  return 'Set up';
}

/** Device-aware prompt copy. */
function getPromptText(): string {
  if (typeof navigator === 'undefined') return 'Sign in faster next time?';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad')) return 'Sign in with Face ID next time?';
  if (ua.includes('mac') && (ua.includes('safari') || ua.includes('chrome'))) return 'Sign in with Touch ID next time?';
  if (ua.includes('windows')) return 'Sign in faster with Windows Hello?';
  return 'Sign in faster next time?';
}

export function PasskeyNudgeBanner() {
  // Determine initial state — if no WebAuthn support or already cached as hidden, skip entirely
  const canUsePasskeys = typeof window !== 'undefined' && 'PublicKeyCredential' in window;
  const cachedHidden = (() => {
    try { return typeof window !== 'undefined' && sessionStorage.getItem(CACHE_KEY) === 'hidden'; }
    catch { return false; }
  })();
  const [state, setState] = useState<'loading' | 'visible' | 'hidden' | 'registering' | 'error'>(
    !canUsePasskeys || cachedHidden ? 'hidden' : 'loading'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!canUsePasskeys || cachedHidden) return;

    getPasskeyNudgeState().then(({ hasPasskeys, nudgeDismissedAt }) => {
      if (hasPasskeys) {
        try { sessionStorage.setItem(CACHE_KEY, 'hidden'); } catch { /* ignore */ }
        setState('hidden');
        return;
      }
      if (nudgeDismissedAt) {
        const dismissedAt = new Date(nudgeDismissedAt).getTime();
        if (Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) {
          try { sessionStorage.setItem(CACHE_KEY, 'hidden'); } catch { /* ignore */ }
          setState('hidden');
          return;
        }
      }
      setState('visible');
    });
  }, [canUsePasskeys, cachedHidden]);

  async function handleSetup() {
    setState('registering');
    setErrorMsg(null);
    const result = await registerPasskey({ friendlyName: guessDeviceName() });
    if (result.ok) {
      setState('hidden');
    } else {
      setErrorMsg(result.error);
      setState('error');
    }
  }

  async function handleDismiss() {
    setState('hidden');
    try { sessionStorage.setItem(CACHE_KEY, 'hidden'); } catch { /* ignore */ }
    await dismissPasskeyNudge();
  }

  if (state === 'loading' || state === 'hidden') return null;

  return (
    <div
      role="status"
      className="mx-4 mt-3 lg:mx-6 stage-panel rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.14)] bg-[var(--stage-surface)] p-4 flex items-start gap-4"
    >
      <Fingerprint className="w-5 h-5 text-[var(--stage-accent)] shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--stage-text-primary)]">
          {getPromptText()}
        </p>
        {state === 'error' && errorMsg && (
          <p className="text-sm text-[var(--color-unusonic-error)] mt-1">{errorMsg}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={handleSetup}
            disabled={state === 'registering'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[oklch(1_0_0_/_0.12)] bg-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] hover:bg-[var(--stage-surface-hover)] transition-colors text-sm font-medium disabled:opacity-50"
          >
            {state === 'registering' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                Setting up…
              </>
            ) : (
              getSetupLabel()
            )}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={state === 'registering'}
            className="text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors leading-relaxed"
          >
            Not now
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
