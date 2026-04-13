'use client';

import { useState } from 'react';

export function RecoverRequestForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/auth/recover/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setStatus('done');
        setMessage(
          data.message ??
            'If an account exists with that email, you will receive a message with next steps. Check your inbox.'
        );
      } else {
        // Security: don't leak account existence — user-facing copy stays generic,
        // but surface the actual response for operators via console + Sentry breadcrumb.
        console.error('[recover] request failed', { status: res.status, body: data });
        setStatus('done');
        setMessage(
          data?.message ??
            'If an account exists with that email, you will receive a message with next steps.'
        );
      }
    } catch {
      setStatus('error');
      setMessage('Unable to send recovery email. Try again.');
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.10)] p-6 text-center">
        <p className="text-[var(--stage-text-primary)] text-sm">{message}</p>
        <p className="text-[var(--stage-text-secondary)] text-xs mt-4">
          You can close this page. Check your email (and spam folder).
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="email"
        name="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
        autoComplete="email"
        data-lpignore="true"
        data-form-type="other"
        data-1p-ignore
        className="w-full px-4 py-2.5 rounded-xl bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/40"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full py-2.5 rounded-xl bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)] border border-[oklch(1_0_0_/_0.22)] font-medium hover:bg-[oklch(1_0_0_/_0.08)] disabled:opacity-45 transition-colors"
      >
        {status === 'loading' ? 'Sending…' : 'Continue'}
      </button>
      {status === 'error' && message && (
        <p className="text-[var(--color-unusonic-error)] text-sm text-center">{message}</p>
      )}
    </form>
  );
}
