'use client';

/**
 * 6-digit OTP entry form for ghost entity sign-in.
 *
 * Features:
 * - 6 individual digit inputs with auto-advance
 * - Paste-all-six handler
 * - autocomplete="one-time-code" for SMS/email autofill
 * - inputmode="numeric" for mobile number pad
 * - WCAG 2.2 AA labels
 * - Turnstile bot protection
 */

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TurnstileWidget } from '@/shared/ui/turnstile-widget';

export function VerifyOtpForm() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // challengeId is stored in sessionStorage by the sign-in form's success state
  // For now, we accept it from the URL or ask the user to go back
  const [challengeId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('cp_challenge_id') ?? '';
    }
    return '';
  });

  const focusInput = (index: number) => {
    inputRefs.current[index]?.focus();
  };

  const handleDigitChange = useCallback((index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits(prev => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    setError(null);

    // Auto-advance to next input
    if (digit && index < 5) {
      focusInput(index + 1);
    }
  }, []);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      focusInput(index - 1);
    }
  }, [digits]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < pasted.length && i < 6; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);
    setError(null);

    // Focus the next empty input, or the last one if all filled
    const nextEmpty = newDigits.findIndex(d => !d);
    focusInput(nextEmpty === -1 ? 5 : nextEmpty);
  }, [digits]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const code = digits.join('');
    if (code.length !== 6) {
      setError('Enter all 6 digits.');
      return;
    }

    if (!challengeId) {
      setError('Session expired. Please request a new sign-in code.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/client-portal/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          code,
          turnstileToken: turnstileToken ?? '',
        }),
      });

      const data = await res.json();

      if (data.ok && data.redirect) {
        // Session cookie was set by the API — navigate to the portal
        sessionStorage.removeItem('cp_challenge_id');
        router.push(data.redirect);
        return;
      }

      // Map reason codes to user-friendly messages
      const messages: Record<string, string> = {
        bad_code: 'Incorrect code. Please check and try again.',
        expired: 'Code expired. Request a new one.',
        locked: 'Too many attempts. Request a new code.',
        already_consumed: 'This code was already used. Request a new one.',
        rate_limited: 'Too many attempts. Please wait a moment.',
        verification_failed: 'Verification failed. Please refresh and try again.',
      };

      setError(messages[data.reason] ?? 'Something went wrong. Please try again.');
      // Clear digits on failure so user can re-enter
      if (data.reason === 'bad_code') {
        setDigits(['', '', '', '', '', '']);
        focusInput(0);
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }, [digits, challengeId, turnstileToken, router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16 text-stage-text-[var(--stage-text-primary)]">
      <header className="mb-10 text-center">
        <p className="text-sm uppercase tracking-[0.18em] text-stage-text-tertiary">
          Client portal
        </p>
        <h1 className="mt-2 text-2xl font-medium">Enter your code</h1>
        <p className="mt-4 text-sm text-stage-text-secondary">
          Enter the 6-digit code from your email.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-stage-border-subtle bg-stage-surface p-6">
        <fieldset>
          <legend className="sr-only">6-digit verification code</legend>
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                value={digit}
                onChange={e => handleDigitChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                aria-label={`Digit ${i + 1} of 6`}
                className="h-14 w-11 rounded-md border border-stage-border-subtle bg-stage-canvas text-center text-xl font-medium text-stage-text-[var(--stage-text-primary)] focus:border-stage-accent focus:outline-none"
              />
            ))}
          </div>
        </fieldset>

        <TurnstileWidget
          onSuccess={setTurnstileToken}
          onExpire={() => setTurnstileToken(null)}
          action="client_portal_verify_otp"
        />

        <button
          type="submit"
          disabled={submitting || digits.join('').length !== 6}
          className="w-full rounded-md bg-stage-accent px-4 py-2.5 text-sm font-medium text-stage-canvas transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Verifying...' : 'Verify'}
        </button>
      </form>

      <div className="mt-6 text-center space-y-2">
        <button
          type="button"
          onClick={() => router.push('/client/sign-in')}
          className="text-xs text-stage-text-tertiary hover:text-stage-text-secondary transition-colors"
        >
          Request a new code
        </button>
      </div>
    </main>
  );
}
