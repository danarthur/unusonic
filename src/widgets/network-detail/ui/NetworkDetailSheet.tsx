'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileEdit, Globe, Pencil, Send, Phone, Mail, Clock } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { IdentityHeader } from './IdentityHeader';
import { TradeLedger } from './TradeLedger';
import { DealHistoryPanel } from './DealHistoryPanel';
import { PrivateNotes } from './PrivateNotes';
import { NodeCrewList } from './NodeCrewList';
import { RoleSelect } from '@/features/team-invite/ui/RoleSelect';
import { UNUSONIC_ROLE_PRESETS, getRoleLabel, type UnusonicRoleId } from '@/features/team-invite/model/role-presets';
import {
  updateOrgMemberRole,
  removeRosterMember,
  archiveRosterMember,
  setDoNotRebook,
  updateRosterMemberField,
} from '@/features/network-data';
import { deployInvites } from '@/features/team-invite/api/actions';
import type { NodeDetail, NodeDetailCrewMember } from '@/features/network-data';
import { STAGE_HEAVY, STAGE_LIGHT, STAGE_NAV_CROSSFADE } from '@/shared/lib/motion-constants';
import { UpcomingAssignments } from './UpcomingAssignments';
import { AvailabilityCheck } from './AvailabilityCheck';
import { QuickBookAction } from './QuickBookAction';

type TabId = 'transmission' | 'crew';

interface NetworkDetailSheetProps {
  details: NodeDetail;
  /** Called when user closes; defaults to router.push(returnPath ?? '/network') if omitted. */
  onClose?: () => void;
  /** Current org id (for Summon partner). */
  sourceOrgId: string;
  /** Where to navigate on close and after editing. Defaults to '/network'. */
  returnPath?: string;
}

const ALL_TABS: { id: TabId; label: string }[] = [
  { id: 'transmission', label: 'Overview' },
  { id: 'crew', label: 'Crew' },
];

function InternalMemberRoleCard({
  details,
  sourceOrgId,
  onSaved,
}: {
  details: NodeDetail;
  sourceOrgId: string;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const role = (details.memberRole ?? 'member') as UnusonicRoleId;
  const canAssignElevated = details.canAssignElevatedRole ?? false;

  const handleRoleChange = React.useCallback(
    async (newRole: UnusonicRoleId) => {
      setError(null);
      setSaving(true);
      const result = await updateOrgMemberRole(details.id, sourceOrgId, newRole);
      setSaving(false);
      if (result.ok) {
        onSaved();
        router.refresh();
      } else {
        setError(result.error);
      }
    },
    [details.id, sourceOrgId, onSaved, router]
  );

  const selectedPreset = UNUSONIC_ROLE_PRESETS.find((p) => p.id === role);

  return (
    <div className="stage-panel rounded-2xl p-4 md:col-span-1 space-y-3">
      <p className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
        Access level
      </p>

      {canAssignElevated ? (
        <RoleSelect
          value={role}
          onChange={handleRoleChange}
          canAssignElevated
          disabled={saving}
          showLabel={false}
        />
      ) : (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[oklch(1_0_0_/_0.06)] bg-[oklch(1_0_0_/_0.04)] px-2.5 py-0.5 text-xs font-medium text-[var(--stage-text-primary)]">
            {getRoleLabel(role)}
          </span>
        </div>
      )}

      {selectedPreset?.description && (
        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
          {selectedPreset.description}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-[var(--color-unusonic-error)]">{error}</p>
      )}
    </div>
  );
}

// ─── Inline edit field ────────────────────────────────────────────────────────

function InlineEditField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [local, setLocal] = React.useState(value);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // Guard: when true the next blur event is from an Escape dismissal — skip save
  const cancellingRef = React.useRef(false);

  // Sync local state when parent value changes (e.g. after router.refresh)
  React.useEffect(() => {
    if (!editing) setLocal(value);
  }, [value, editing]);

  const save = React.useCallback(async () => {
    if (cancellingRef.current) return;
    if (local === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const err = await onSave(local);
    setSaving(false);
    if (err) {
      setSaveError(err);
    } else {
      setEditing(false);
    }
  }, [local, value, onSave]);

  if (editing) {
    return (
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
          {label}
        </p>
        <input
          autoFocus
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { cancellingRef.current = true; setSaveError(null); setEditing(false); setTimeout(() => { cancellingRef.current = false; }, 0); }
          }}
          disabled={saving}
          className="stage-input py-1 text-sm disabled:opacity-[0.45]"
        />
        {saveError && (
          <p role="alert" className="mt-1 text-xs text-[var(--color-unusonic-error)]">{saveError}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
        {label}
      </p>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex w-full items-center gap-2 text-left"
      >
        <span className="text-sm text-[var(--stage-text-primary)]">
          {value || <span className="text-[var(--stage-text-secondary)]">—</span>}
        </span>
        <Pencil className="size-3 opacity-0 transition-opacity duration-[80ms] group-hover:opacity-50 text-[var(--stage-text-secondary)]" />
      </button>
    </div>
  );
}

// ─── Internal member fields card ──────────────────────────────────────────────

function InternalMemberFieldsCard({
  details,
  sourceOrgId,
  onSaved,
}: {
  details: NodeDetail;
  sourceOrgId: string;
  onSaved: () => void;
}) {
  const makeFieldSaver = (field: 'phone' | 'market' | 'job_title') =>
    async (value: string): Promise<string | null> => {
      const result = await updateRosterMemberField(details.id, sourceOrgId, field, value);
      if (!result.ok) return result.error;
      onSaved();
      return null;
    };

  const phone = details.phone ?? '';
  const market = details.market ?? '';
  const jobTitle = (details.identity.label !== details.memberRole && details.identity.label !== 'Member')
    ? details.identity.label
    : '';

  return (
    <div className="stage-panel rounded-2xl p-4 md:col-span-2 space-y-4">
      <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-secondary)]">
        Profile
      </h3>
      <InlineEditField label="Job title" value={jobTitle} onSave={makeFieldSaver('job_title')} />
      <InlineEditField label="Phone" value={phone} onSave={makeFieldSaver('phone')} />
      <InlineEditField label="Market" value={market} onSave={makeFieldSaver('market')} />
    </div>
  );
}

// ─── Roster status actions card ───────────────────────────────────────────────

function InviteCard({
  details,
  sourceOrgId,
  onSaved,
}: {
  details: NodeDetail;
  sourceOrgId: string;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(details.inviteStatus === 'invited');

  const handleSend = async () => {
    setSending(true);
    setError(null);
    const result = await deployInvites(sourceOrgId, [details.id]);
    setSending(false);
    if (result.ok && result.sent > 0) {
      setSent(true);
      onSaved();
      router.refresh();
    } else if (result.ok && result.sent === 0) {
      setError('No invite to send. Check that this member has an email address.');
    } else if (!result.ok) {
      setError(result.error);
    }
  };

  return (
    <div className="stage-panel rounded-2xl p-4 md:col-span-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)]">
            {sent ? 'Invite sent' : 'Invite to portal'}
          </h3>
          <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
            {sent
              ? 'Waiting for acceptance.'
              : 'Send an invite so they can access their schedule and profile.'}
          </p>
        </div>
        {!sent && (
          <Button
            variant="default"
            size="sm"
            onClick={handleSend}
            disabled={sending}
          >
            <Send className="size-3.5 mr-1.5" />
            {sending ? 'Sending...' : 'Send invite'}
          </Button>
        )}
        {sent && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]">
            Pending
          </span>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-[var(--color-unusonic-error)] mt-2">{error}</p>}
    </div>
  );
}

function RosterStatusCard({
  details,
  sourceOrgId,
  onRemoved,
  onSaved,
}: {
  details: NodeDetail;
  sourceOrgId: string;
  onRemoved: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const doNotRebook = details.doNotRebook ?? false;
  const isArchived = details.archived ?? false;

  // Archive confirm state
  const [archiveConfirm, setArchiveConfirm] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);

  // Remove confirm state
  const [removeConfirm, setRemoveConfirm] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [removeError, setRemoveError] = React.useState<string | null>(null);
  const [forceCount, setForceCount] = React.useState<number | null>(null);

  // DNR state
  const [dnrSaving, setDnrSaving] = React.useState(false);
  const [dnrError, setDnrError] = React.useState<string | null>(null);

  const handleDnrToggle = async () => {
    setDnrSaving(true);
    setDnrError(null);
    const result = await setDoNotRebook(details.id, sourceOrgId, !doNotRebook);
    setDnrSaving(false);
    if (result.ok) {
      onSaved();
      router.refresh();
    } else {
      setDnrError(result.error);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    setArchiveError(null);
    const result = await archiveRosterMember(details.id, sourceOrgId, !isArchived);
    setArchiving(false);
    if (result.ok) {
      setArchiveConfirm(false);
      onSaved();
      router.refresh();
    } else {
      setArchiveError(result.error);
    }
  };

  const handleRemove = async (force?: boolean) => {
    setRemoving(true);
    setRemoveError(null);
    const result = await removeRosterMember(details.id, sourceOrgId, force);
    setRemoving(false);
    if (result.ok) {
      onRemoved();
    } else if ('requiresForce' in result && result.requiresForce) {
      setForceCount(result.assignmentCount ?? null);
    } else {
      setRemoveError(result.error);
    }
  };

  return (
    <div className="stage-panel rounded-2xl p-4 md:col-span-3 space-y-3">
      <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-secondary)]">
        Roster actions
      </h3>

      {/* Do-not-rebook */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm text-[var(--stage-text-primary)]">Do not rebook</p>
            <p className="text-xs text-[var(--stage-text-secondary)]">
              Flags this person in scheduling suggestions.
            </p>
          </div>
          {doNotRebook ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--color-unusonic-warning)]/15 px-2.5 py-1 text-xs font-medium text-[var(--color-unusonic-warning)]">
                Flagged
              </span>
              <button
                type="button"
                onClick={handleDnrToggle}
                disabled={dnrSaving}
                className="rounded-lg px-2.5 py-1 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.05)] transition-colors disabled:opacity-[0.45]"
              >
                Clear
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleDnrToggle}
              disabled={dnrSaving}
              className="rounded-lg border border-[var(--stage-edge-top)] px-3 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:border-[var(--color-unusonic-warning)]/50 hover:text-[var(--color-unusonic-warning)] transition-colors disabled:opacity-[0.45]"
            >
              Flag do not rebook
            </button>
          )}
        </div>
        {doNotRebook && details.lastModifiedByName && (
          <p className="text-xs text-[var(--stage-text-tertiary)]">
            Set by {details.lastModifiedByName}
            {details.lastModifiedAt ? ` · ${new Date(details.lastModifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
          </p>
        )}
        {dnrError && <p role="alert" className="text-xs text-[var(--color-unusonic-error)]">{dnrError}</p>}
      </div>

      {/* Archive / Unarchive */}
      <div className="space-y-1 pt-1 border-t border-[var(--stage-edge-top)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm text-[var(--stage-text-primary)]">
              {isArchived ? 'Archived' : 'Archive'}
            </p>
            <p className="text-xs text-[var(--stage-text-secondary)]">
              {isArchived
                ? 'Member is on record but excluded from active scheduling.'
                : 'Keeps the member on record but removes from active scheduling.'}
            </p>
          </div>
          {isArchived ? (
            <button
              type="button"
              onClick={() => handleArchive()}
              disabled={archiving}
              className="rounded-lg border border-[var(--stage-edge-top)] px-3 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.05)] transition-colors disabled:opacity-[0.45]"
            >
              {archiving ? 'Restoring…' : 'Unarchive'}
            </button>
          ) : archiveConfirm ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleArchive}
                disabled={archiving}
                className="rounded-lg bg-[var(--color-unusonic-warning)]/15 px-3 py-1.5 text-xs font-medium text-[var(--color-unusonic-warning)] hover:bg-[var(--color-unusonic-warning)]/25 transition-colors disabled:opacity-[0.45]"
              >
                {archiving ? 'Archiving…' : 'Confirm archive?'}
              </button>
              <button
                type="button"
                onClick={() => setArchiveConfirm(false)}
                className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.05)] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setArchiveConfirm(true)}
              className="rounded-lg border border-[var(--stage-edge-top)] px-3 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:border-[var(--color-unusonic-warning)]/50 hover:text-[var(--color-unusonic-warning)] transition-colors"
            >
              Archive
            </button>
          )}
        </div>
        {archiveError && <p role="alert" className="text-xs text-[var(--color-unusonic-error)]">{archiveError}</p>}
      </div>

      {/* Remove from roster */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-[var(--stage-edge-top)]">
        <div className="flex-1">
          <p className="text-sm text-[var(--stage-text-primary)]">Remove from roster</p>
          <p className="text-xs text-[var(--stage-text-secondary)]">
            Permanently removes this member. Cannot be undone.
          </p>
        </div>
        {removeConfirm ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleRemove(forceCount !== null ? true : false)}
              disabled={removing}
              className="rounded-lg bg-[var(--color-unusonic-error)]/15 px-3 py-1.5 text-xs font-medium text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/25 transition-colors disabled:opacity-[0.45]"
            >
              {removing
                ? 'Removing…'
                : forceCount !== null
                ? `${forceCount} assignment(s) — remove anyway?`
                : 'Confirm remove?'}
            </button>
            <button
              type="button"
              onClick={() => { setRemoveConfirm(false); setForceCount(null); }}
              className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.05)] transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setRemoveConfirm(true);
              setForceCount(null);
              setRemoveError(null);
            }}
            className="rounded-lg border border-[var(--stage-edge-top)] px-3 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:border-[var(--color-unusonic-error)]/50 hover:text-[var(--color-unusonic-error)] transition-colors"
          >
            Remove from roster
          </button>
        )}
      </div>
      {removeError && <p role="alert" className="text-xs text-[var(--color-unusonic-error)]">{removeError}</p>}
    </div>
  );
}

/** Crew tab only for org/venue entities (not person/couple). */
function getTabsForDetail(details: NodeDetail): { id: TabId; label: string }[] {
  const isPartner = details.kind === 'external_partner';
  const showCrew = isPartner
    && details.entityDirectoryType !== 'person'
    && details.entityDirectoryType !== 'couple';
  return showCrew ? ALL_TABS : ALL_TABS.filter((t) => t.id !== 'crew');
}

export function NetworkDetailSheet({ details, onClose, sourceOrgId, returnPath }: NetworkDetailSheetProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<TabId>('transmission');
  const sheetRef = React.useRef<HTMLDivElement>(null);

  const handleClose = React.useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      router.push(returnPath ?? '/network');
    }
  }, [onClose, returnPath, router]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  const [pendingCrew, setPendingCrew] = React.useState<NodeDetailCrewMember[]>([]);

  React.useEffect(() => {
    setPendingCrew([]);
  }, [details.id]);

  React.useEffect(() => {
    const tabList = getTabsForDetail(details);
    const ids = tabList.map((t) => t.id);
    if (!ids.includes(activeTab)) setActiveTab(ids[0] ?? 'transmission');
  }, [details.id, details.kind, details.entityDirectoryType, activeTab]);

  const handleRefresh = React.useCallback(() => {
    router.refresh();
  }, [router]);

  const handleCrewAdded = React.useCallback(
    (newMember?: NodeDetailCrewMember) => {
      if (newMember) setPendingCrew((prev) => [...prev, newMember]);
      setTimeout(() => router.refresh(), 800);
    },
    [router]
  );

  const isPartner = details.kind === 'external_partner';
  const serverCrew = (details.crew ?? []).filter((m) => {
    const n = (m.name ?? '').trim();
    return n.length > 0 && n !== '—';
  });
  // Merge server + pending so adding one person doesn’t hide existing crew. Dedupe by name so we don’t show placeholder + real card (server has ghost email, optimistic has null).
  const serverNames = new Set(
    serverCrew.map((m) => (m.name ?? '').trim().toLowerCase())
  );
  const pendingOnly = pendingCrew.filter(
    (p) => !serverNames.has((p.name ?? '').trim().toLowerCase())
  );
  const crew = [...serverCrew, ...pendingOnly];
  const ghostOrgId = details.targetOrgId ?? '';
  const isCrewEditable = isPartner && details.isGhost && !!ghostOrgId;

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal
        aria-labelledby="network-detail-title"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed inset-0 z-50 flex justify-end"
      >
        <motion.div
          role="presentation"
          className="absolute inset-0 bg-[oklch(0.06_0_0/0.75)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={handleClose}
          aria-hidden
        />
        <motion.div
          ref={sheetRef}
          id="network-detail-panel"
          data-surface="raised"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={STAGE_HEAVY}
          className="
            fixed inset-y-0 right-0 z-10 flex flex-col h-dvh w-[85vw] max-w-[85vw] md:w-[600px] md:max-w-[600px]
            bg-[var(--stage-surface-raised)]            border-l border-[var(--stage-edge-top)] shadow-2xl rounded-l-[var(--stage-radius-panel,12px)]
          "
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--stage-edge-top)] px-4 py-3 md:px-5 md:py-3">
            <h1 id="network-detail-title" className="min-w-0 flex-1 truncate text-lg font-medium tracking-tight text-[var(--stage-text-primary)]">
              {details.identity.name}
            </h1>
            <div className="flex shrink-0 items-center gap-1">
              {/* Ghost partner — edit their external entity profile */}
              {isPartner && details.isGhost && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/network/entity/${details.id}?kind=external_partner${returnPath ? `&from=${encodeURIComponent(returnPath)}` : ''}`)}
                  className="h-8 gap-1.5 px-2 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.06)]"
                >
                  <FileEdit className="size-4" />
                  Edit
                </Button>
              )}
              {/* Internal employee / contractor — navigate to their person entity studio */}
              {!isPartner && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/network/entity/${details.id}?kind=${details.kind}${returnPath ? `&from=${encodeURIComponent(returnPath)}` : ''}`)}
                  className="h-8 gap-1.5 px-2 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.06)]"
                >
                  <FileEdit className="size-4" />
                  Edit
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--stage-text-secondary)]" aria-label="View profile">
                <Globe className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleClose}
                aria-label="Close"
              >
                <X className="size-5" />
              </Button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            <IdentityHeader
              details={details}
              sourceOrgId={sourceOrgId}
              onSummonSuccess={handleRefresh}
            />

            {/* Contact strip — always visible, outside tabs */}
            {(() => {
              const showEmployeeStrip = !isPartner;
              const showPartnerPersonStrip = isPartner
                && (details.entityDirectoryType === 'person' || details.entityDirectoryType === 'couple')
                && (details.personEmail || details.personPhone);
              const hasPartnerMetrics = !!(isPartner
                && (details.partnerShowCount || details.lifetimeValue || details.lastActiveDate));
              const hasPartnerOpsInfo = !!(isPartner
                && details.entityDirectoryType === 'company'
                && details.orgOperationalSettings
                && (details.orgOperationalSettings.payment_terms || details.orgOperationalSettings.tax_id));

              if (!showEmployeeStrip && !showPartnerPersonStrip && !hasPartnerMetrics && !hasPartnerOpsInfo && !details.relationshipStrength) return null;

              const phone = showEmployeeStrip ? details.phone : details.personPhone;
              const email = showEmployeeStrip ? details.identity.email : details.personEmail;

              return (
                <div className="px-4 py-3 md:px-5 space-y-2 border-b border-[var(--stage-edge-top)]">
                  {/* Contact links */}
                  {(phone || email) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {phone && (
                        <a href={`tel:${phone}`} className="flex items-center gap-1.5 text-sm text-[var(--stage-text-primary)] hover:underline">
                          <Phone className="size-3.5 text-[var(--stage-text-tertiary)]" />
                          {phone}
                        </a>
                      )}
                      {email && (
                        <a href={`mailto:${email}`} className="flex items-center gap-1.5 text-sm text-[var(--stage-text-secondary)] hover:underline truncate">
                          <Mail className="size-3.5 text-[var(--stage-text-tertiary)]" />
                          {email}
                        </a>
                      )}
                    </div>
                  )}
                  {/* Partner computed metrics */}
                  {hasPartnerMetrics && (() => {
                    const parts: string[] = [];
                    const dir = details.direction;
                    const isVenue = details.entityDirectoryType === 'venue';

                    if (isVenue) {
                      if (details.partnerShowCount) parts.push(`${details.partnerShowCount} show${details.partnerShowCount === 1 ? '' : 's'} hosted`);
                    } else {
                      if (details.lifetimeValue) {
                        const label = dir === 'client' ? 'Lifetime' : 'Total spent';
                        parts.push(`${label}: $${details.lifetimeValue.toLocaleString()}`);
                      }
                      if (details.partnerShowCount) parts.push(`${details.partnerShowCount} show${details.partnerShowCount === 1 ? '' : 's'}`);
                    }
                    if (details.lastActiveDate) {
                      const d = new Date(details.lastActiveDate);
                      parts.push(`Last: ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`);
                    }

                    if (!parts.length) return null;
                    return (
                      <p className="text-xs text-[var(--stage-text-secondary)] font-mono tabular-nums">
                        {parts.join(' \u00b7 ')}
                      </p>
                    );
                  })()}
                  {/* Operational info — company entities only */}
                  {hasPartnerOpsInfo && (() => {
                    const ops = details.orgOperationalSettings!;
                    const infoParts: string[] = [];
                    if (ops.payment_terms) infoParts.push(String(ops.payment_terms));
                    if (ops.tax_id) infoParts.push('Tax ID on file');
                    if (!infoParts.length) return null;
                    return (
                      <p className="text-xs text-[var(--stage-text-secondary)]">
                        {infoParts.join(' \u00b7 ')}
                      </p>
                    );
                  })()}
                  {/* Skill pills — employees only */}
                  {showEmployeeStrip && details.skillTags && details.skillTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {details.skillTags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Last booked — employees only */}
                  {showEmployeeStrip && details.lastBooked && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--stage-text-tertiary)]">
                      <Clock className="size-3.5" />
                      <span>
                        Last booked: {details.lastBooked.role}
                        {details.lastBooked.date && ` · ${new Date(details.lastBooked.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                      </span>
                    </div>
                  )}
                  {/* Availability check — employees only */}
                  {showEmployeeStrip && details.subjectEntityId && (
                    <AvailabilityCheck entityId={details.subjectEntityId} />
                  )}
                  {/* Portal status — employees only */}
                  {showEmployeeStrip && details.inviteStatus === 'active' && (
                    <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]">
                      Active on portal
                    </span>
                  )}
                  {/* Relationship strength indicator */}
                  {details.relationshipStrength && (() => {
                    const strengthLabels: Record<NonNullable<typeof details.relationshipStrength>, string> = {
                      new: 'New',
                      growing: 'Growing',
                      strong: 'Strong',
                      cooling: 'Cooling',
                    };
                    const strengthStyles: Record<NonNullable<typeof details.relationshipStrength>, string> = {
                      new: 'bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-tertiary)]',
                      growing: 'bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]',
                      strong: 'bg-[oklch(1_0_0/0.10)] text-[var(--stage-text-primary)]',
                      cooling: 'bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-tertiary)]',
                    };
                    return (
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${strengthStyles[details.relationshipStrength!]}`}>
                        {strengthLabels[details.relationshipStrength!]}
                      </span>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Tab strip with sliding indicator */}
            <div className="shrink-0 border-b border-[var(--stage-edge-top)] px-4 md:px-5">
              <div className="relative flex h-12" role="tablist">
                {getTabsForDetail(details).map((tab) => {
                  const displayLabel = tab.id === 'crew' && details.entityDirectoryType === 'venue'
                    ? 'House contacts'
                    : tab.label;
                  return (
                  <div key={tab.id} className="relative flex flex-1 items-center justify-center">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      aria-controls={`panel-${tab.id}`}
                      id={`tab-${tab.id}`}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        text-xs font-medium uppercase tracking-widest
                        transition-colors duration-[80ms] text-[var(--stage-text-secondary)]
                        hover:text-[var(--stage-text-primary)]
                        ${activeTab === tab.id ? 'text-[var(--stage-text-primary)]' : ''}
                      `}
                    >
                      {displayLabel}
                    </button>
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="network-detail-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--stage-accent)]"
                        initial={false}
                        transition={STAGE_LIGHT}
                      />
                    )}
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Tab panels with crossfade */}
            <div className="flex-1 overflow-y-auto px-4 py-5 md:px-5 md:py-5 relative">
              <AnimatePresence mode="wait">
              {activeTab === 'transmission' && (
                <motion.div
                  key="transmission"
                  id="panel-transmission"
                  role="tabpanel"
                  aria-labelledby="tab-transmission"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={STAGE_NAV_CROSSFADE}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[minmax(120px,auto)]"
                >
                  {/* Ledger cell — col-span-1, partners only */}
                  {isPartner && (
                    <div className="stage-panel rounded-2xl p-4 md:col-span-1">
                      <TradeLedger details={details} />
                    </div>
                  )}
                  {/* Employee summary metrics */}
                  {!isPartner && (details.showCount || details.totalPaid) && (
                    <div className="stage-panel rounded-2xl p-4 md:col-span-1">
                      <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-secondary)] mb-3">Summary</h3>
                      <div className="space-y-2">
                        {details.showCount != null && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[var(--stage-text-secondary)]">Shows</span>
                            <span className="font-mono tabular-nums text-[var(--stage-text-primary)]">{details.showCount}</span>
                          </div>
                        )}
                        {details.totalPaid != null && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[var(--stage-text-secondary)]">Total paid</span>
                            <span className="font-mono tabular-nums text-[var(--stage-text-primary)]">${details.totalPaid.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Upcoming assignments — internal employees/contractors only */}
                  {!isPartner && details.subjectEntityId && (
                    <UpcomingAssignments entityId={details.subjectEntityId} />
                  )}
                  {/* Quick-book on show — internal employees/contractors only */}
                  {!isPartner && details.subjectEntityId && (
                    <QuickBookAction
                      entityId={details.subjectEntityId}
                      entityName={details.identity.name}
                    />
                  )}
                  {/* Deal history — external partners only */}
                  {isPartner && details.subjectEntityId && (
                    <DealHistoryPanel entityId={details.subjectEntityId} />
                  )}
                  {/* Support cell: Notes — col-span-2 */}
                  <div className="stage-panel rounded-2xl p-4 md:col-span-2">
                    <PrivateNotes
                      relationshipId={details.relationshipId}
                      initialNotes={details.notes}
                    />
                  </div>
                  {/* Role — internal_employee only */}
                  {!isPartner && (
                    <InternalMemberRoleCard
                      details={details}
                      sourceOrgId={sourceOrgId}
                      onSaved={handleRefresh}
                    />
                  )}
                  {/* Inline profile fields — internal_employee only */}
                  {!isPartner && (
                    <InternalMemberFieldsCard
                      details={details}
                      sourceOrgId={sourceOrgId}
                      onSaved={handleRefresh}
                    />
                  )}
                  {/* Invite to portal — for ghost/invited internal employees */}
                  {!isPartner && (details.inviteStatus === 'ghost' || details.inviteStatus === 'invited') && (
                    <InviteCard
                      details={details}
                      sourceOrgId={sourceOrgId}
                      onSaved={handleRefresh}
                    />
                  )}
                  {/* Roster status actions — internal_employee + owner/admin only */}
                  {!isPartner && details.canAssignElevatedRole && (
                    <RosterStatusCard
                      details={details}
                      sourceOrgId={sourceOrgId}
                      onRemoved={handleClose}
                      onSaved={handleRefresh}
                    />
                  )}
                  {/* Website — org/venue entities only (not person/couple) */}
                  {isPartner && details.orgWebsite && details.entityDirectoryType !== 'person' && details.entityDirectoryType !== 'couple' && (
                    <div className="stage-panel rounded-2xl p-4 md:col-span-2">
                      <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-secondary)] mb-2">
                        Website
                      </h3>
                      <a
                        href={details.orgWebsite.startsWith('http') ? details.orgWebsite : `https://${details.orgWebsite}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--stage-text-primary)] hover:underline break-all"
                      >
                        {details.orgWebsite}
                      </a>
                    </div>
                  )}
                  {/* Venue specs — venue entities only */}
                  {isPartner && details.entityDirectoryType === 'venue' && details.orgVenueSpecs && (() => {
                    const specs = details.orgVenueSpecs!;
                    const hasAny = specs.capacity || specs.load_in_notes || specs.power_notes || specs.stage_notes;
                    if (!hasAny) return null;
                    return (
                      <div className="stage-panel rounded-2xl p-4 space-y-3 md:col-span-2">
                        <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Venue specs</h3>
                        <dl className="space-y-2">
                          {specs.capacity && (
                            <div className="flex items-center justify-between text-sm">
                              <dt className="text-[var(--stage-text-secondary)]">Capacity</dt>
                              <dd className="font-mono tabular-nums text-[var(--stage-text-primary)]">{specs.capacity.toLocaleString()}</dd>
                            </div>
                          )}
                          {specs.load_in_notes && (
                            <div className="space-y-0.5">
                              <dt className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Load-in</dt>
                              <dd className="text-sm text-[var(--stage-text-primary)]">{specs.load_in_notes}</dd>
                            </div>
                          )}
                          {specs.power_notes && (
                            <div className="space-y-0.5">
                              <dt className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Power</dt>
                              <dd className="text-sm text-[var(--stage-text-primary)]">{specs.power_notes}</dd>
                            </div>
                          )}
                          {specs.stage_notes && (
                            <div className="space-y-0.5">
                              <dt className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Stage</dt>
                              <dd className="text-sm text-[var(--stage-text-primary)]">{specs.stage_notes}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    );
                  })()}
                  {/* Address/contact — company/venue entities only */}
                  {isPartner
                    && details.entityDirectoryType !== 'person'
                    && details.entityDirectoryType !== 'couple'
                    && (details.orgAddress || details.orgSupportEmail)
                    && (() => {
                      const addr = details.orgAddress as { street?: string; city?: string; state?: string; postal_code?: string } | null;
                      return (
                        <div className="stage-panel rounded-2xl p-4 space-y-3 md:col-span-2">
                          <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Contact</h3>
                          {details.orgSupportEmail && (
                            <a href={`mailto:${details.orgSupportEmail}`}
                              className="flex items-center gap-2 text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
                              onClick={(e) => e.stopPropagation()}>
                              {details.orgSupportEmail}
                            </a>
                          )}
                          {addr && (addr.street || addr.city) && (
                            <address className="not-italic space-y-0.5 text-sm text-[var(--stage-text-secondary)]">
                              {addr.street && <p>{addr.street}</p>}
                              {(addr.city || addr.state) && <p>{[addr.city, addr.state].filter(Boolean).join(', ')}</p>}
                              {addr.postal_code && <p>{addr.postal_code}</p>}
                            </address>
                          )}
                        </div>
                      );
                    })()
                  }
                  {/* Active shows — col-span-1 */}
                  {details.active_events.length > 0 && (
                    <div className="stage-panel rounded-2xl p-4 md:col-span-1">
                      <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-secondary)] mb-2">
                        Active shows
                      </h3>
                      <ul className="space-y-1 text-sm text-[var(--stage-text-primary)]">
                        {details.active_events.map((name, i) => (
                          <li key={`${name}-${i}`}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'crew' && (
                <motion.div
                  key="crew"
                  id="panel-crew"
                  role="tabpanel"
                  aria-labelledby="tab-crew"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={STAGE_NAV_CROSSFADE}
                  className="space-y-6"
                >
                  {isPartner ? (
                    <NodeCrewList
                      crew={crew}
                      sourceOrgId={sourceOrgId}
                      ghostOrgId={ghostOrgId}
                      isEditable={isCrewEditable}
                      onAdded={handleCrewAdded}
                    />
                  ) : (
                    <p className="text-sm text-[var(--stage-text-secondary)]">
                      Available for partners.
                    </p>
                  )}
                </motion.div>
              )}

              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
