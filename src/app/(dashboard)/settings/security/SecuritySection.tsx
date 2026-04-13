'use client';

import { useState, useEffect, useCallback } from 'react';
import { useActionState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, KeyRound, UserPlus, Loader2, Download, ShieldAlert, Trash2, Pencil, Check, X as XIcon, Plus } from 'lucide-react';
import { registerPasskey } from '@/features/passkey-registration';
import { inviteGuardian } from '@/features/guardian-invite';
import { cancelRecovery } from '@/features/sovereign-recovery/api/actions';
import {
  listPasskeys,
  renamePasskey,
  deletePasskey,
  type PasskeyRow,
} from '@/features/auth/passkey-management/api/actions';
import { guessDeviceName } from '@/features/auth/passkey-management/lib/guess-device-name';
import type { TeamAccessMember } from '@/features/auth/passkey-management/api/team-access';
import { Users, AlertTriangle, CheckCircle2 } from 'lucide-react';

import { STAGE_HEAVY } from '@/shared/lib/motion-constants';
const sectionSpring = STAGE_HEAVY;

type PendingRecovery = { id: string; timelock_until: string } | null;

interface SecuritySectionProps {
  hasRecoveryKit?: boolean;
  pendingRecoveryRequest?: PendingRecovery;
  teamAccess?: TeamAccessMember[] | null;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return 'Over a year ago';
}

export function SecuritySection({
  hasRecoveryKit = false,
  pendingRecoveryRequest = null,
  teamAccess,
}: SecuritySectionProps) {
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [passkeysLoaded, setPasskeysLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showAddNameInput, setShowAddNameInput] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(inviteGuardian, null);

  const refreshPasskeys = useCallback(async () => {
    const rows = await listPasskeys();
    setPasskeys(rows);
    setPasskeysLoaded(true);
  }, []);

  useEffect(() => {
    refreshPasskeys();
  }, [refreshPasskeys]);

  function handleStartAdd() {
    setNewPasskeyName(guessDeviceName());
    setShowAddNameInput(true);
    setPasskeyMessage(null);
  }

  async function handleAddPasskey() {
    setPasskeyMessage(null);
    setPasskeyLoading(true);
    try {
      const result = await registerPasskey({ friendlyName: newPasskeyName.trim() || undefined });
      if (result.ok) {
        setPasskeyMessage('Done. This device will recognize you now.');
        setShowAddNameInput(false);
        setNewPasskeyName('');
        await refreshPasskeys();
      } else {
        setPasskeyMessage(result.error);
      }
    } finally {
      setPasskeyLoading(false);
    }
  }

  async function handleRename(id: string) {
    const result = await renamePasskey(id, editName);
    if (result.ok) {
      setEditingId(null);
      await refreshPasskeys();
    }
  }

  async function handleDelete(id: string) {
    setDeleteLoading(true);
    try {
      const result = await deletePasskey(id);
      if (result.ok) {
        setDeletingId(null);
        await refreshPasskeys();
      }
    } finally {
      setDeleteLoading(false);
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
            className="stage-hover overflow-hidden inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--stage-surface)] text-[var(--stage-text-primary)] border border-[var(--stage-border)] transition-colors"
          >
            <Download className="w-4 h-4" />
            Export identity (CXF)
          </button>
        </div>
      </motion.section>

      {/* Pending recovery */}
      {pendingRecoveryRequest && (
        <section className="rounded-2xl bg-[var(--stage-surface)] border border-[oklch(1_0_0_/_0.08)] border-l-[3px] border-l-[var(--color-unusonic-warning)] p-6">
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-unusonic-warning)]/20 text-[var(--color-unusonic-warning)] border border-[var(--color-unusonic-warning)]/40 hover:bg-[var(--color-unusonic-warning)]/30 disabled:opacity-45"
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

      {/* Passkeys */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...sectionSpring, delay: 0.15 }}
        className="stage-panel p-6"
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <KeyRound className="w-5 h-5 text-[var(--stage-accent)]" strokeWidth={1.5} />
            <h2 className="text-base font-medium text-[var(--stage-text-primary)]">Passkeys</h2>
          </div>
          {passkeysLoaded && (
            <span className="text-xs text-[var(--stage-text-secondary)]">
              {passkeys.length} registered
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mb-4">
          Sign in with Face ID, Touch ID, Windows Hello, or a password manager. Each device gets its own passkey.
        </p>

        {/* Passkey list */}
        {passkeysLoaded && passkeys.length > 0 && (
          <div className="space-y-2 mb-4">
            <AnimatePresence mode="popLayout">
              {passkeys.map((pk) => (
                <motion.div
                  key={pk.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--ctx-well)] border border-[var(--stage-border)]"
                >
                  {editingId === pk.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(pk.id); if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus
                        className="flex-1 min-w-0 bg-transparent text-sm text-[var(--stage-text-primary)] outline-none"
                        placeholder="Name this device"
                      />
                      <button type="button" onClick={() => handleRename(pk.id)} className="p-1 rounded text-[var(--color-unusonic-success)] hover:bg-[oklch(1_0_0_/_0.08)]" aria-label="Save">
                        <Check className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="p-1 rounded text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.08)]" aria-label="Cancel">
                        <XIcon className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                    </>
                  ) : deletingId === pk.id ? (
                    <>
                      <p className="flex-1 text-sm text-[var(--color-unusonic-error)]">Remove this passkey?</p>
                      <button type="button" onClick={() => handleDelete(pk.id)} disabled={deleteLoading} className="text-xs font-medium text-[var(--color-unusonic-error)] hover:underline disabled:opacity-45">
                        {deleteLoading ? 'Removing…' : 'Remove'}
                      </button>
                      <button type="button" onClick={() => setDeletingId(null)} disabled={deleteLoading} className="text-xs text-[var(--stage-text-secondary)] hover:underline disabled:opacity-45">Cancel</button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                          {pk.friendly_name || 'Unnamed passkey'}
                        </p>
                        <p className="text-xs text-[var(--stage-text-secondary)]">
                          Added {pk.created_at ? new Date(pk.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'unknown'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setEditingId(pk.id); setEditName(pk.friendly_name ?? ''); }}
                        className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors"
                        aria-label="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(pk.id)}
                        className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {passkeysLoaded && passkeys.length === 0 && (
          <p className="text-sm text-[var(--stage-text-secondary)]/60 mb-4">
            No passkeys registered. Add one to sign in without a password.
          </p>
        )}

        {passkeysLoaded && passkeys.length === 1 && (
          <p className="text-sm text-[var(--stage-text-secondary)] mb-4 leading-relaxed">
            You have one passkey. If you lose this device, you&apos;ll need your recovery phrase. Adding a passkey on another device gives you faster backup.
          </p>
        )}

        {showAddNameInput ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newPasskeyName}
              onChange={(e) => setNewPasskeyName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddPasskey(); if (e.key === 'Escape') setShowAddNameInput(false); }}
              autoFocus
              placeholder="Name this device"
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--ctx-well)] border border-[var(--stage-border)] text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            />
            <button
              type="button"
              onClick={handleAddPasskey}
              disabled={passkeyLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--stage-border-hover)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors disabled:opacity-45 shrink-0"
            >
              {passkeyLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Plus className="w-4 h-4" strokeWidth={1.5} />
              )}
              {passkeyLoading ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddNameInput(false)}
              disabled={passkeyLoading}
              className="p-2 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors"
              aria-label="Cancel"
            >
              <XIcon className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleStartAdd}
            disabled={passkeyLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--stage-border-hover)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors disabled:opacity-45"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Add passkey
          </button>
        )}
        {passkeyMessage && (
          <p className={`mt-3 text-sm leading-relaxed ${passkeyMessage.startsWith('Done') ? 'text-[var(--stage-text-secondary)]' : 'text-[var(--color-unusonic-error)]'}`}>
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
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--ctx-well)] border border-[var(--stage-border)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          />
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--stage-border-hover)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors disabled:opacity-45"
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

      {/* Team access — owner/admin only */}
      {teamAccess && teamAccess.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...sectionSpring, delay: 0.35 }}
          className="stage-panel p-6"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-[var(--stage-accent)]" strokeWidth={1.5} />
              <h2 className="text-base font-medium text-[var(--stage-text-primary)]">Team access</h2>
            </div>
            <span className="text-xs text-[var(--stage-text-secondary)]">
              {teamAccess.length} {teamAccess.length === 1 ? 'member' : 'members'}
            </span>
          </div>
          <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mb-5">
            Security posture for your workspace. Members at risk may get locked out if they lose their device.
          </p>

          <div className="space-y-2">
            {teamAccess.map((member) => (
              <div
                key={member.userId}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--ctx-well)] border border-[var(--stage-border)]"
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-lg bg-[oklch(1_0_0_/_0.08)] flex items-center justify-center shrink-0 overflow-hidden">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
                      {(member.fullName ?? member.email)?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  )}
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                    {member.fullName ?? member.email}
                  </p>
                  {member.fullName && (
                    <p className="text-xs text-[var(--stage-text-secondary)] truncate">{member.email}</p>
                  )}
                </div>

                {/* Passkey count */}
                <div className="flex items-center gap-1 shrink-0" title={`${member.passkeyCount} passkey${member.passkeyCount !== 1 ? 's' : ''}`}>
                  <KeyRound className="w-3.5 h-3.5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
                  <span className={`text-xs font-medium ${
                    member.passkeyCount === 0
                      ? 'text-[var(--color-unusonic-error)]'
                      : member.passkeyCount === 1
                        ? 'text-[var(--color-unusonic-warning)]'
                        : 'text-[var(--color-unusonic-success)]'
                  }`}>
                    {member.passkeyCount}
                  </span>
                </div>

                {/* Recovery kit */}
                <div className="shrink-0" title={member.hasRecoveryKit ? 'Recovery kit set up' : 'No recovery kit'}>
                  {member.hasRecoveryKit ? (
                    <CheckCircle2 className="w-4 h-4 text-[var(--color-unusonic-success)]" strokeWidth={1.5} />
                  ) : (
                    <Shield className="w-4 h-4 text-[var(--stage-text-secondary)]/40" strokeWidth={1.5} />
                  )}
                </div>

                {/* Last active */}
                <span className="text-xs text-[var(--stage-text-secondary)] shrink-0 w-20 text-right" title={member.lastSignInAt ? new Date(member.lastSignInAt).toLocaleString() : 'Never signed in'}>
                  {formatRelativeTime(member.lastSignInAt)}
                </span>

                {/* Risk badge */}
                {member.risk && (
                  <span className={`flex items-center gap-1 stage-label px-2 py-0.5 rounded-full shrink-0 ${
                    member.risk === 'high'
                      ? 'bg-[var(--color-unusonic-error)]/15 text-[var(--color-unusonic-error)]'
                      : 'bg-[var(--color-unusonic-warning)]/15 text-[var(--color-unusonic-warning)]'
                  }`}>
                    <AlertTriangle className="w-3 h-3" strokeWidth={2} />
                    {member.risk === 'high' ? 'At risk' : 'Setup needed'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}
