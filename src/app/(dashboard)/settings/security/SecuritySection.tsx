'use client';

import { useState, useEffect, useCallback } from 'react';
import { useActionState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, KeyRound, UserPlus, Loader2, Download, ShieldAlert, Trash2, Pencil, Check, X as XIcon, Plus, MessageSquare, RotateCcw } from 'lucide-react';
import { registerPasskey } from '@/features/passkey-registration';
import { inviteGuardian } from '@/features/guardian-invite';
import { cancelRecovery } from '@/features/sovereign-recovery/api/actions';
import {
  listPasskeys,
  renamePasskey,
  deletePasskey,
  adminResetMemberPasskey,
  type PasskeyRow,
} from '@/features/auth/passkey-management/api/actions';
import { guessDeviceName } from '@/features/auth/passkey-management/lib/guess-device-name';
import type { TeamAccessMember } from '@/features/auth/passkey-management/api/team-access';
import { toggleSmsSigninEnabled } from '@/features/auth/smart-login/api/sms-actions';
import { Users, AlertTriangle, CheckCircle2 } from 'lucide-react';

import { STAGE_HEAVY } from '@/shared/lib/motion-constants';
const sectionSpring = STAGE_HEAVY;

type PendingRecovery = { id: string; timelock_until: string } | null;

interface SecuritySectionProps {
  hasRecoveryKit?: boolean;
  pendingRecoveryRequest?: PendingRecovery;
  teamAccess?: TeamAccessMember[] | null;
  /** Phase 6 — `AUTH_V2_SMS` flag mirror. OFF → hide the Sign-in options section. */
  authV2Sms?: boolean;
  /** Current workspace the toggle writes to. `null` disables the control. */
  workspaceId?: string | null;
  /** Initial value read server-side. */
  smsSigninEnabled?: boolean;
  /** True when the caller holds owner/admin role on `workspaceId`. */
  canToggleSms?: boolean;
  /** The signed-in user's auth.users.id — used to hide self-reset on team access rows. */
  currentUserId?: string;
  /** True when the caller is owner/admin of `workspaceId` and can trigger `adminResetMemberPasskey`. */
  canResetMembers?: boolean;
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
  authV2Sms = false,
  workspaceId = null,
  smsSigninEnabled: initialSmsSigninEnabled = false,
  canToggleSms = false,
  currentUserId,
  canResetMembers = false,
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

  // ── Phase 6 — SMS opt-in toggle state ───────────────────────────────────
  const [smsEnabled, setSmsEnabled] = useState(initialSmsSigninEnabled);
  const [smsToggling, setSmsToggling] = useState(false);
  const [smsToggleMessage, setSmsToggleMessage] = useState<string | null>(null);

  // ── Admin reset member sign-in (Phase 1 RPC + Phase 4 passkey-reset email) ──
  const [resetTarget, setResetTarget] = useState<TeamAccessMember | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const handleConfirmReset = useCallback(async () => {
    if (!resetTarget || !workspaceId) return;
    setResetLoading(true);
    setResetMessage(null);
    try {
      const result = await adminResetMemberPasskey({
        workspaceId,
        targetUserId: resetTarget.userId,
      });
      if (result.ok) {
        setResetMessage({
          kind: 'ok',
          text: `Sign-in reset. We emailed ${resetTarget.email} a one-time link to register a new passkey.`,
        });
        setResetTarget(null);
      } else {
        setResetMessage({ kind: 'error', text: result.error });
      }
    } finally {
      setResetLoading(false);
    }
  }, [resetTarget, workspaceId]);

  const handleToggleSms = useCallback(
    async (next: boolean) => {
      if (!workspaceId) return;
      // Optimistic flip; roll back on failure.
      setSmsEnabled(next);
      setSmsToggleMessage(null);
      setSmsToggling(true);
      try {
        const result = await toggleSmsSigninEnabled(workspaceId, next);
        if (!result.ok) {
          setSmsEnabled(!next);
          setSmsToggleMessage(result.error);
        }
      } catch {
        setSmsEnabled(!next);
        setSmsToggleMessage('Could not update setting.');
      } finally {
        setSmsToggling(false);
      }
    },
    [workspaceId],
  );

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
              className={`w-5 h-5 ${hasRecoveryKit ? 'text-[var(--color-unusonic-success)]' : 'text-[var(--stage-text-secondary)]'}`}
              strokeWidth={1.5}
              aria-hidden
            />
            <h2 className="text-base font-medium text-[var(--stage-text-primary)]">Recovery kit</h2>
          </div>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              hasRecoveryKit
                ? 'bg-[var(--color-unusonic-success)]/20 text-[var(--color-unusonic-success)]'
                : 'bg-[var(--ctx-well)] text-[var(--stage-text-secondary)]'
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
            className="stage-btn stage-btn-secondary"
          >
            <Download className="w-4 h-4" strokeWidth={1.5} />
            Export identity (CXF)
          </button>
        </div>
      </motion.section>

      {/* Pending recovery */}
      {pendingRecoveryRequest && (
        <section className="stage-panel-nested stage-stripe-warning p-6">
          <div className="flex items-center gap-3 mb-2">
            <ShieldAlert className="w-5 h-5 text-[var(--color-unusonic-warning)]" strokeWidth={1.5} />
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
            className="stage-btn stage-btn-secondary"
          >
            {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : null}
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
                        <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="p-1 rounded text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.08)]" aria-label="Cancel">
                        <XIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
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
          <p className="text-sm text-[var(--stage-text-secondary)] mb-4">
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
              className="stage-input flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={handleAddPasskey}
              disabled={passkeyLoading}
              className="stage-btn stage-btn-secondary shrink-0"
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
            className="stage-btn stage-btn-secondary"
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

      {/* Phase 6 — Sign-in options (SMS opt-in). Rendered only when the
          feature flag is ON; gated further to owner/admin editability. */}
      {authV2Sms && workspaceId ? (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...sectionSpring, delay: 0.2 }}
          className="stage-panel p-6"
          data-testid="security-sms-signin-section"
        >
          <div className="flex items-center gap-3 mb-2">
            <MessageSquare className="w-5 h-5 text-[var(--stage-accent)]" strokeWidth={1.5} />
            <h2 className="text-base font-medium text-[var(--stage-text-primary)]">
              Sign-in options
            </h2>
          </div>
          <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mb-4">
            Let members sign in with a 6-digit code sent to their phone. Useful
            when venue Wi-Fi blocks email delivery. The magic link stays the
            default; SMS only appears after a member first asks for their
            email link.
          </p>

          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-[var(--ctx-well)] border border-[var(--stage-border)]">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--stage-text-primary)]">
                SMS sign-in code
              </p>
              <p className="text-xs text-[var(--stage-text-secondary)]">
                {canToggleSms
                  ? 'Only workspace owners and admins can change this.'
                  : 'Contact your workspace owner to change this.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={smsEnabled}
              aria-label="Enable SMS sign-in code"
              disabled={!canToggleSms || smsToggling}
              onClick={() => handleToggleSms(!smsEnabled)}
              data-testid="security-sms-signin-toggle"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] ${
                smsEnabled
                  ? 'bg-[var(--color-unusonic-success)]/40 border-[var(--color-unusonic-success)]/60'
                  : 'bg-[var(--stage-surface)] border-[var(--stage-border)]'
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-4 w-4 rounded-full bg-[var(--stage-text-primary)] transition-transform ${
                  smsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {smsToggleMessage ? (
            <p className="mt-3 text-sm text-[var(--color-unusonic-error)] leading-relaxed">
              {smsToggleMessage}
            </p>
          ) : null}
        </motion.section>
      ) : null}

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
            className="stage-input w-full"
          />
          <button
            type="submit"
            disabled={isPending}
            className="stage-btn stage-btn-secondary"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : null}
            {isPending ? 'Sending…' : 'Invite guardian'}
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

          {resetMessage && (
            <div
              className={`stage-panel-nested px-4 py-3 mb-4 ${
                resetMessage.kind === 'ok' ? 'stage-stripe-info' : 'stage-stripe-error'
              }`}
              role="status"
              aria-live="polite"
            >
              <p className="text-sm text-[var(--stage-text-primary)] leading-relaxed">
                {resetMessage.text}
              </p>
            </div>
          )}

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
                    <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                    {member.risk === 'high' ? 'At risk' : 'Setup needed'}
                  </span>
                )}

                {/* Reset sign-in — owner/admin only, not for self */}
                {canResetMembers && workspaceId && member.userId !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => {
                      setResetMessage(null);
                      setResetTarget(member);
                    }}
                    className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors shrink-0"
                    aria-label={`Reset sign-in for ${member.fullName ?? member.email}`}
                    title="Reset sign-in — deletes this member's passkeys and emails them a one-time link"
                  >
                    <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Confirmation dialog — destructive, two-step */}
      <AnimatePresence>
        {resetTarget && (
          <motion.div
            key="reset-member-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[9998] flex items-center justify-center p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-member-heading"
          >
            {/* Scrim — click-through cancels only when not loading */}
            <div
              className="absolute inset-0 bg-[oklch(0.06_0_0/0.80)]"
              onClick={() => {
                if (!resetLoading) setResetTarget(null);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={STAGE_HEAVY}
              className="stage-panel relative z-10 w-full max-w-md p-6"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[oklch(1_0_0_/_0.08)] flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5 text-[var(--stage-text-primary)]" strokeWidth={1.5} />
                </div>
                <div>
                  <h3
                    id="reset-member-heading"
                    className="text-base font-medium text-[var(--stage-text-primary)] mb-1"
                  >
                    Reset sign-in for {resetTarget.fullName ?? resetTarget.email}?
                  </h3>
                  <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed">
                    We&apos;ll delete every passkey registered to this member and email them a one-time link to set up a new one. Their workspace access is not removed.
                  </p>
                </div>
              </div>
              {resetMessage?.kind === 'error' && (
                <div className="stage-panel-nested stage-stripe-error px-4 py-3 mb-4">
                  <p className="text-sm text-[var(--stage-text-primary)] leading-relaxed">
                    {resetMessage.text}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  disabled={resetLoading}
                  className="stage-btn stage-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  disabled={resetLoading}
                  className="stage-btn stage-btn-primary"
                >
                  {resetLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                      Resetting…
                    </span>
                  ) : (
                    'Reset sign-in'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
