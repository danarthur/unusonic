'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { motion } from 'framer-motion';
import { Shield, KeyRound, UserPlus, Loader2, Download, ShieldAlert } from 'lucide-react';
import { registerPasskey } from '@/features/passkey-registration';
import { inviteGuardian } from '@/features/guardian-invite';
import { cancelRecovery } from '@/features/sovereign-recovery/api/actions';

const sectionSpring = { type: 'spring' as const, stiffness: 200, damping: 20 };

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
        setPasskeyMessage('Passkey added successfully');
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
      setCancelMessage(result.ok ? 'Recovery cancelled' : result.error);
      if (result.ok) window.location.reload();
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Recovery status */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...sectionSpring, delay: 0.05 }}
        className="stage-panel p-6"
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <Shield
              className={`w-5 h-5 ${hasRecoveryKit ? 'text-[var(--color-unusonic-success)]' : 'text-[var(--stage-text-primary)]/60'}`}
              aria-hidden
            />
            <h2 className="text-base font-medium text-[var(--stage-text-primary)]">Recovery kit</h2>
          </div>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              hasRecoveryKit
                ? 'bg-[var(--color-unusonic-success)]/20 text-[var(--color-unusonic-success)]'
                : 'bg-[var(--stage-surface)] text-[var(--stage-text-primary)]/80'
            }`}
          >
            {hasRecoveryKit ? 'Backed up' : 'Not set up'}
          </span>
        </div>
        <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mb-4">
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
              a.download = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'unusonic-identity-export.json';
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--stage-surface)] text-[var(--stage-text-primary)] border border-[var(--stage-border)] hover:bg-[var(--stage-surface-hover)] transition-colors"
          >
            <Download className="w-4 h-4" />
            Export identity (CXF)
          </button>
        </div>
      </motion.section>

      {/* Pending recovery */}
      {pendingRecoveryRequest && (
        <section className="rounded-2xl bg-[var(--color-unusonic-warning)]/10 border border-[var(--color-unusonic-warning)]/30 p-6">
          <div className="flex items-center gap-3 mb-2">
            <ShieldAlert className="w-5 h-5 text-[var(--color-unusonic-warning)]" />
            <h2 className="text-base font-medium text-[var(--stage-text-primary)]">Recovery in progress</h2>
          </div>
          <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mb-4">
            A recovery was requested. You have until{' '}
            {new Date(pendingRecoveryRequest.timelock_until).toLocaleString()} to cancel if this wasn&apos;t you.
          </p>
          <button
            type="button"
            onClick={handleCancelRecovery}
            disabled={cancelLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-unusonic-warning)]/20 text-[var(--color-unusonic-warning)] border border-[var(--color-unusonic-warning)]/40 hover:bg-[var(--color-unusonic-warning)]/30 disabled:opacity-50"
          >
            {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Cancel recovery
          </button>
          {cancelMessage && (
            <p className={`mt-3 text-sm leading-relaxed ${cancelMessage.includes('cancelled') ? 'text-[var(--stage-text-secondary)]' : 'text-[var(--color-unusonic-error)]'}`}>
              {cancelMessage}
            </p>
          )}
        </section>
      )}

      {/* Passkey */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...sectionSpring, delay: 0.15 }}
        className="stage-panel p-6"
      >
        <div className="flex items-center gap-3 mb-2">
          <KeyRound className="w-5 h-5 text-[var(--stage-accent)]" strokeWidth={1.5} />
          <h2 className="text-base font-medium text-[var(--stage-text-primary)]">Passkey</h2>
        </div>
        <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mb-4">
          Sign in with a password manager (e.g. NordPass), Face ID, Touch ID, or a security key. If one method fails, try another.
        </p>
        <button
          type="button"
          onClick={handleEnablePasskey}
          disabled={passkeyLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--stage-border-hover)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] hover:brightness-[1.06] transition-[filter] disabled:opacity-50"
        >
          {passkeyLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <Shield className="w-4 h-4" strokeWidth={1.5} />
          )}
          {passkeyLoading ? 'Adding...' : 'Add passkey'}
        </button>
        {passkeyMessage && (
          <p className={`mt-3 text-sm leading-relaxed ${passkeyMessage.startsWith('Passkey') ? 'text-[var(--stage-text-secondary)]' : 'text-[var(--color-unusonic-error)]'}`}>
            {passkeyMessage}
          </p>
        )}
      </motion.section>

      {/* Safety Net */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...sectionSpring, delay: 0.25 }}
        className="stage-panel p-6"
      >
        <div className="flex items-center gap-3 mb-2">
          <UserPlus className="w-5 h-5 text-[var(--stage-accent)]" strokeWidth={1.5} />
          <h2 className="text-base font-medium text-[var(--stage-text-primary)]">Safety Net</h2>
        </div>
        <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mb-4">
          Invite someone you trust as a guardian. If you lose access, they can help you recover your account.
        </p>
        <form action={formAction} className="space-y-3">
          <input
            type="email"
            name="guardianEmail"
            placeholder="Guardian email"
            required
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--stage-surface-nested)] border border-[var(--stage-border)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-primary)]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          />
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--stage-border-hover)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] hover:brightness-[1.06] transition-[filter] disabled:opacity-50"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : null}
            {isPending ? 'Sending...' : 'Invite guardian'}
          </button>
        </form>
        {state && (
          <p className={`mt-3 text-sm leading-relaxed ${state.ok ? 'text-[var(--stage-text-secondary)]' : 'text-[var(--color-unusonic-error)]'}`}>
            {state.ok ? state.message : state.error}
          </p>
        )}
      </motion.section>
    </div>
  );
}
