'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { Shield, KeyRound, UserPlus, Loader2, Download, ShieldAlert } from 'lucide-react';
import { registerPasskey } from '@/features/passkey-registration';
import { inviteGuardian } from '@/features/guardian-invite';
import { cancelRecovery } from '@/features/sovereign-recovery/api/actions';

type PendingRecovery = { id: string; timelock_until: string } | null;

interface SecuritySectionProps {
  hasRecoveryKit?: boolean;
  pendingRecoveryRequest?: PendingRecovery;
}

export function SecuritySection({
  hasRecoveryKit = false,
  pendingRecoveryRequest = null,
}: SecuritySectionProps) {
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(inviteGuardian, null);

  async function handleEnablePasskey() {
    setPasskeyMessage(null);
    setPasskeyLoading(true);
    try {
      const result = await registerPasskey();
      if (result.ok) {
        setPasskeyMessage('Passkey added successfully.');
      } else {
        setPasskeyMessage(result.error);
      }
    } finally {
      setPasskeyLoading(false);
    }
  }

  async function handleCancelRecovery() {
    if (!pendingRecoveryRequest) return;
    setCancelMessage(null);
    setCancelLoading(true);
    try {
      const result = await cancelRecovery(pendingRecoveryRequest.id);
      setCancelMessage(result.ok ? 'Recovery cancelled.' : result.error);
      if (result.ok) window.location.reload();
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Recovery status – Shield (gray → green) */}
      <section className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <Shield
              className={`w-5 h-5 ${hasRecoveryKit ? 'text-emerald-400' : 'text-ceramic/60'}`}
              aria-hidden
            />
            <h2 className="text-base font-medium text-ceramic">Recovery kit</h2>
          </div>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              hasRecoveryKit
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-white/10 text-ceramic/80'
            }`}
          >
            {hasRecoveryKit ? 'Backed up' : 'Not set up'}
          </span>
        </div>
        <p className="text-sm text-ceramic/85 leading-relaxed mb-4">
          {hasRecoveryKit
            ? 'Your account can be recovered with your Safety Net guardians.'
            : 'Set up a recovery kit so you never get locked out.'}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={async () => {
              const res = await fetch('/api/auth/identity/export', { credentials: 'include' });
              if (!res.ok) return;
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'signal-identity-export.json';
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-ceramic border border-white/10 hover:bg-white/15 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export identity (CXF)
          </button>
        </div>
      </section>

      {/* Pending recovery – Cancel (silent takeover defense) */}
      {pendingRecoveryRequest && (
        <section className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-6">
          <div className="flex items-center gap-3 mb-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-medium text-ceramic">Recovery in progress</h2>
          </div>
          <p className="text-sm text-ceramic/85 leading-relaxed mb-4">
            A recovery was requested. You have until{' '}
            {new Date(pendingRecoveryRequest.timelock_until).toLocaleString()} to cancel if this wasn’t you.
          </p>
          <button
            type="button"
            onClick={handleCancelRecovery}
            disabled={cancelLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-50"
          >
            {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Cancel recovery
          </button>
          {cancelMessage && (
            <p className={`mt-3 text-sm leading-relaxed ${cancelMessage.includes('cancelled') ? 'text-ceramic/85' : 'text-red-400'}`}>
              {cancelMessage}
            </p>
          )}
        </section>
      )}

      {/* Passkey */}
      <section className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-2">
          <KeyRound className="w-5 h-5 text-neon/80" />
          <h2 className="text-base font-medium text-ceramic">Passkey</h2>
        </div>
        <p className="text-sm text-ceramic/85 leading-relaxed mb-4">
          Sign in with a password manager (e.g. NordPass), Face ID, Touch ID, or a security key. If one method fails, try another.
        </p>
        <button
          type="button"
          onClick={handleEnablePasskey}
          disabled={passkeyLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neon/15 text-neon border border-neon/30 hover:bg-neon/25 transition-colors disabled:opacity-50"
        >
          {passkeyLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Shield className="w-4 h-4" />
          )}
          {passkeyLoading ? 'Adding…' : 'Add passkey'}
        </button>
        {passkeyMessage && (
          <p className={`mt-3 text-sm leading-relaxed ${passkeyMessage.startsWith('Passkey') ? 'text-ceramic/85' : 'text-red-400'}`}>
            {passkeyMessage}
          </p>
        )}
      </section>

      {/* Safety Net – Guardians */}
      <section className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-2">
          <UserPlus className="w-5 h-5 text-neon/80" />
          <h2 className="text-base font-medium text-ceramic">Safety Net</h2>
        </div>
        <p className="text-sm text-ceramic/85 leading-relaxed mb-4">
          Invite someone you trust as a guardian. If you lose access, they can help you recover your account.
        </p>
        <form action={formAction} className="space-y-3">
          <input
            type="email"
            name="guardianEmail"
            placeholder="Guardian’s email"
            required
            className="w-full px-4 py-2.5 rounded-xl bg-obsidian/50 border border-white/10 text-ceramic placeholder:text-ceramic/50 focus:outline-none focus:ring-2 focus:ring-neon/40"
          />
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neon/15 text-neon border border-neon/30 hover:bg-neon/25 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isPending ? 'Sending…' : 'Invite guardian'}
          </button>
        </form>
        {state && (
          <p className={`mt-3 text-sm leading-relaxed ${state.ok ? 'text-ceramic/85' : 'text-red-400'}`}>
            {state.ok ? state.message : state.error}
          </p>
        )}
      </section>
    </div>
  );
}
