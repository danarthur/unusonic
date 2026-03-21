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
        setStatus('done');
        setMessage(
          data?.message ??
            'If an account exists with that email, you will receive a message with next steps.'
        );
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center">
        <p className="text-ceramic text-sm">{message}</p>
        <p className="text-mercury text-xs mt-4">
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
        className="w-full px-4 py-2.5 rounded-xl bg-obsidian/50 border border-white/10 text-ceramic placeholder:text-mercury/60 focus:outline-none focus:ring-2 focus:ring-neon/40"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full py-2.5 rounded-xl bg-neon/20 text-neon border border-neon/40 font-medium hover:bg-neon/30 disabled:opacity-50 transition-colors"
      >
        {status === 'loading' ? 'Sending…' : 'Continue'}
      </button>
      {status === 'error' && message && (
        <p className="text-red-400 text-sm text-center">{message}</p>
      )}
    </form>
  );
}
