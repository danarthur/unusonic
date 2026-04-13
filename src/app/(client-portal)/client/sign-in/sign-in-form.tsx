'use client';

/**
 * Client portal sign-in form with Turnstile bot protection.
 *
 * On submit: POST /api/client-portal/magic-link → shows success message.
 * The response is always generic (anti-enumeration). The user is told to
 * check their email regardless of whether a match exists.
 *
 * Ghost entities get redirected to /client/sign-in/verify to enter a 6-digit code.
 * Claimed entities get a clickable magic link in their email.
 */

import { useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { TurnstileWidget } from '@/shared/ui/turnstile-widget';

const ERROR_MESSAGES: Record<string, string> = {
  link_expired: 'That link has expired or was already used. Request a new one below.',
  invalid_link: 'That link was invalid. Request a new one below.',
};

type Props = {
  searchParamsPromise: Promise<{ error?: string }>;
};

export function SignInForm({ searchParamsPromise }: Props) {
  const searchParams = use(searchParamsPromise);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.error ? (ERROR_MESSAGES[searchParams.error] ?? null) : null,
  );

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    // Turnstile token may be null in dev (no keys set) — server handles this
    setSubmitting(true);

    try {
      const res = await fetch('/api/client-portal/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, turnstileToken: turnstileToken ?? '' }),
      });

      if (res.status === 403) {
        setError('Verification failed. Please refresh and try again.');
        return;
      }

      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }

      // Always show success — anti-enumeration
      setSent(true);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }, [email, turnstileToken]);

  if (sent) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16 text-stage-text-primary">
        <header className="mb-10 text-center">
          <p className="text-sm uppercase tracking-[0.18em] text-stage-text-tertiary">
            Client portal
          </p>
          <h1 className="mt-2 text-2xl font-medium">Check your email</h1>
          <p className="mt-4 text-sm text-stage-text-secondary">
            If an account exists for <strong className="text-stage-text-primary">{email.trim().toLowerCase()}</strong>,
            you&rsquo;ll receive a sign-in link or code shortly.
          </p>
          <p className="mt-3 text-xs text-stage-text-tertiary">
            Open the email on this same device for the fastest sign-in.
            If you click from a different device, you may be asked to enter a code instead.
          </p>
        </header>

        <div className="space-y-3 text-center">
          <button
            type="button"
            onClick={() => router.push('/client/sign-in/verify')}
            className="text-sm text-stage-text-secondary underline underline-offset-2 hover:text-stage-text-primary transition-colors"
          >
            I have a 6-digit code
          </button>
          <div>
            <button
              type="button"
              onClick={() => { setSent(false); setError(null); }}
              className="text-sm text-stage-text-tertiary hover:text-stage-text-secondary transition-colors"
            >
              Try a different email
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16 text-stage-text-primary">
      <header className="mb-10 text-center">
        <p className="text-sm uppercase tracking-[0.18em] text-stage-text-tertiary">
          Client portal
        </p>
        <h1 className="mt-2 text-2xl font-medium">Sign in</h1>
        <p className="mt-4 text-sm text-stage-text-secondary">
          Enter the email your coordinator has on file. We&rsquo;ll send you a
          one-tap link to get back in.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-stage-border-subtle bg-stage-surface p-6">
        <label className="block text-sm">
          <span className="text-stage-text-tertiary">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-2 w-full rounded-md border border-stage-border-subtle bg-stage-canvas px-3 py-2 text-stage-text-primary placeholder:text-stage-text-tertiary focus:border-stage-accent focus:outline-none"
          />
        </label>

        <TurnstileWidget
          onSuccess={setTurnstileToken}
          onExpire={() => setTurnstileToken(null)}
          action="client_portal_magic_link"
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-stage-accent px-4 py-2.5 text-sm font-medium text-stage-canvas transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Sending...' : 'Send sign-in link'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => router.push('/client/sign-in/verify')}
          className="text-xs text-stage-text-tertiary hover:text-stage-text-secondary transition-colors"
        >
          Already have a code? Enter it here
        </button>
      </div>
    </main>
  );
}
