'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { FileEdit, Globe, Pencil, Send, Phone, Mail, Clock } from 'lucide-react';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { networkQueries } from '@/features/network-data/api/queries';
import { queryKeys } from '@/shared/api/query-keys';
import { Button } from '@/shared/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/shared/ui/sheet';
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
import { STAGE_LIGHT, STAGE_NAV_CROSSFADE } from '@/shared/lib/motion-constants';
import { UpcomingAssignments } from './UpcomingAssignments';
import { AvailabilityCheck } from './AvailabilityCheck';
import { QuickBookAction } from './QuickBookAction';
import { CrewKitSection } from './CrewKitSection';

type TabId = 'transmission' | 'crew';

interface NetworkDetailSheetProps {
  /** When provided, useQuery fetches details internally. */
  nodeId?: string;
  kind?: 'internal_employee' | 'extended_team' | 'external_partner';
  /** Pre-fetched details (legacy prop — used when nodeId is not provided). */
  details?: NodeDetail;
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
      } else {
        setError(result.error);
      }
    },
    [details.id, sourceOrgId, onSaved]
  );

  const selectedPreset = UNUSONIC_ROLE_PRESETS.find((p) => p.id === role);

  return (
    <div className="space-y-2">
      <p className="stage-label text-[var(--stage-text-secondary)]">
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
          <span className="inline-flex items-center rounded-full border border-[var(--stage-edge-subtle)] bg-[oklch(1_0_0_/_0.04)] px-2.5 py-0.5 stage-badge-text text-[var(--stage-text-primary)]">
            {getRoleLabel(role)}
          </span>
        </div>
      )}

      {selectedPreset?.description && (
        <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] leading-relaxed">
          {selectedPreset.description}
        </p>
      )}

      {error && (
        <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{error}</p>
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
        <p className="mb-1 stage-label text-[var(--stage-text-secondary)]">
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
          <p role="alert" className="mt-1 text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{saveError}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1 stage-label text-[var(--stage-text-secondary)]">
        {label}
      </p>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex w-full items-center gap-2 text-left"
      >
        <span className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
          {value || <span className="text-[var(--stage-text-secondary)]">—</span>}
        </span>
        <Pencil className="size-3 opacity-0 transition-opacity duration-[80ms] group-hover:opacity-100 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
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
    <div className="space-y-4">
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
    } else if (result.ok && result.sent === 0) {
      setError('No invite to send. Check that this member has an email address.');
    } else if (!result.ok) {
      setError(result.error);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[length:var(--stage-data-size)] font-medium text-[var(--stage-text-primary)]">
            {sent ? 'Invite sent' : 'Invite to portal'}
          </h3>
          <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] mt-0.5">
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
            <Send className="size-3.5 mr-1.5" strokeWidth={1.5} />
            {sending ? 'Sending...' : 'Send invite'}
          </Button>
        )}
        {sent && (
          <span className="stage-badge-text px-2.5 py-1 rounded-full bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]">
            Pending
          </span>
        )}
      </div>
      {error && <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)] mt-2">{error}</p>}
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
    <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-3" data-surface="elevated">
      <h3 className="stage-label text-[var(--stage-text-secondary)]">
        Roster actions
      </h3>

      {/* Do-not-rebook */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">Do not rebook</p>
            <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
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
                className="rounded-lg px-2.5 py-1 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] transition-colors disabled:opacity-[0.45]"
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
        {dnrError && <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{dnrError}</p>}
      </div>

      {/* Archive / Unarchive */}
      <div className="space-y-1 pt-1 border-t border-[var(--stage-edge-top)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
              {isArchived ? 'Archived' : 'Archive'}
            </p>
            <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
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
              className="rounded-lg border border-[var(--stage-edge-top)] px-3 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] transition-colors disabled:opacity-[0.45]"
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
                className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] transition-colors"
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
        {archiveError && <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{archiveError}</p>}
      </div>

      {/* Remove from roster */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-[var(--stage-edge-top)]">
        <div className="flex-1">
          <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">Remove from roster</p>
          <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
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
              className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] transition-colors"
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
      {removeError && <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{removeError}</p>}
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

export function NetworkDetailSheet({ nodeId, kind, details: detailsProp, onClose, sourceOrgId, returnPath }: NetworkDetailSheetProps) {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<TabId>('transmission');

  // Fetch details via useQuery when nodeId/kind are provided; fall back to prop
  const { data: queryDetails } = useQuery({
    ...networkQueries.nodeDetail(workspaceId ?? '', nodeId ?? '', kind ?? 'external_partner', sourceOrgId),
    enabled: !!nodeId && !!kind && !!workspaceId,
    initialData: detailsProp ?? undefined,
  });
  const details = queryDetails ?? detailsProp;

  const invalidateDetail = React.useCallback(() => {
    if (nodeId && workspaceId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.entities.detail(workspaceId, nodeId) });
    }
    // Also invalidate the network list so the grid updates
    if (workspaceId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.entities.all(workspaceId) });
    }
  }, [queryClient, nodeId, workspaceId]);

  const handleClose = React.useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      router.push(returnPath ?? '/network');
    }
  }, [onClose, returnPath, router]);

  const [pendingCrew, setPendingCrew] = React.useState<NodeDetailCrewMember[]>([]);

  React.useEffect(() => {
    if (details?.id) setPendingCrew([]);
  }, [details?.id]);

  React.useEffect(() => {
    if (!details) return;
    const tabList = getTabsForDetail(details);
    const ids = tabList.map((t) => t.id);
    if (!ids.includes(activeTab)) setActiveTab(ids[0] ?? 'transmission');
  }, [details?.id, details?.kind, details?.entityDirectoryType, activeTab, details]);

  const handleRefresh = React.useCallback(() => {
    invalidateDetail();
  }, [invalidateDetail]);

  const handleCrewAdded = React.useCallback(
    (newMember?: NodeDetailCrewMember) => {
      if (newMember) setPendingCrew((prev) => [...prev, newMember]);
      setTimeout(() => invalidateDetail(), 800);
    },
    [invalidateDetail]
  );

  if (!details) return null;

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
    <Sheet open onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent
        side="right"
        className="w-[min(100%,37.5rem)] rounded-l-[var(--stage-radius-panel,12px)] bg-[var(--stage-surface)]"
        data-surface="surface"
      >
        <SheetHeader>
          <SheetTitle className="truncate">{details.identity.name}</SheetTitle>
          <div className="flex shrink-0 items-center gap-1">
            {/* Ghost partner — edit their external entity profile */}
            {isPartner && details.isGhost && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/network/entity/${details.id}?kind=external_partner${returnPath ? `&from=${encodeURIComponent(returnPath)}` : ''}`)}
                className="h-8 gap-1.5 px-2 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.08)]"
              >
                <FileEdit className="size-4" strokeWidth={1.5} />
                Edit
              </Button>
            )}
            {/* Internal employee / contractor — navigate to their person entity studio */}
            {!isPartner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/network/entity/${details.id}?kind=${details.kind}${returnPath ? `&from=${encodeURIComponent(returnPath)}` : ''}`)}
                className="h-8 gap-1.5 px-2 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.08)]"
              >
                <FileEdit className="size-4" strokeWidth={1.5} />
                Edit
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--stage-text-secondary)]" aria-label="View profile">
              <Globe className="size-4" strokeWidth={1.5} />
            </Button>
            <SheetClose />
          </div>
        </SheetHeader>

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
                <div className="px-6 py-3 space-y-2 border-b border-[var(--stage-edge-subtle)]">
                  {/* Contact links */}
                  {(phone || email) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {phone && (
                        <a href={`tel:${phone}`} className="flex items-center gap-1.5 text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] hover:underline">
                          <Phone className="size-3.5 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
                          {phone}
                        </a>
                      )}
                      {email && (
                        <a href={`mailto:${email}`} className="flex items-center gap-1.5 text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)] hover:underline truncate">
                          <Mail className="size-3.5 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
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
                      <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] font-mono tabular-nums">
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
                      <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
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
                          className="stage-badge-text px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Last booked — employees only */}
                  {showEmployeeStrip && details.lastBooked && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)]">
                      <Clock className="size-3.5" strokeWidth={1.5} />
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
                    <span className="inline-flex stage-badge-text px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]">
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
                      <span className={`inline-flex stage-badge-text px-2 py-0.5 rounded-full ${strengthStyles[details.relationshipStrength!]}`}>
                        {strengthLabels[details.relationshipStrength!]}
                      </span>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Tab strip with sliding indicator */}
            <div className="shrink-0 border-b border-[var(--stage-edge-subtle)] px-6">
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
                        stage-label
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
            <div className="flex-1 overflow-y-auto px-6 py-5 relative">
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
                  className="space-y-5"
                >
                  {/* ── Employee: Summary metrics (horizontal readouts) ── */}
                  {!isPartner && (details.showCount != null || details.totalPaid != null) && (
                    <div className="flex items-baseline gap-6">
                      {details.showCount != null && (
                        <div>
                          <p className="stage-label text-[var(--stage-text-secondary)]">Shows</p>
                          <p className="text-lg font-mono tabular-nums text-[var(--stage-text-primary)] mt-0.5">{details.showCount}</p>
                        </div>
                      )}
                      {details.totalPaid != null && (
                        <div>
                          <p className="stage-label text-[var(--stage-text-secondary)]">Total paid</p>
                          <p className="text-lg font-mono tabular-nums text-[var(--stage-text-primary)] mt-0.5">${details.totalPaid.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Partner: Ledger card ── */}
                  {isPartner && (
                    <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
                      <TradeLedger details={details} />
                    </div>
                  )}

                  {/* ── Employee: Role + Profile fields (on surface) ── */}
                  {!isPartner && (
                    <>
                      <div className="h-px bg-[var(--stage-edge-subtle)]" />
                      <div className="space-y-4">
                        <InternalMemberRoleCard
                          details={details}
                          sourceOrgId={sourceOrgId}
                          onSaved={handleRefresh}
                        />
                        <InternalMemberFieldsCard
                          details={details}
                          sourceOrgId={sourceOrgId}
                          onSaved={handleRefresh}
                        />
                      </div>
                    </>
                  )}

                  {/* ── Partner: Contact fields (on surface) ── */}
                  {isPartner
                    && details.entityDirectoryType !== 'person'
                    && details.entityDirectoryType !== 'couple'
                    && (details.orgWebsite || details.orgAddress || details.orgSupportEmail)
                    && (() => {
                      const addr = details.orgAddress as { street?: string; city?: string; state?: string; postal_code?: string } | null;
                      const ops = details.orgOperationalSettings as { payment_terms?: string; tax_id?: string } | null | undefined;
                      return (
                        <>
                          <div className="h-px bg-[var(--stage-edge-subtle)]" />
                          <div className="space-y-3">
                            {details.orgWebsite && (
                              <div>
                                <p className="stage-label text-[var(--stage-text-secondary)] mb-1">Website</p>
                                <a
                                  href={details.orgWebsite.startsWith('http') ? details.orgWebsite : `https://${details.orgWebsite}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] hover:underline break-all"
                                >
                                  {details.orgWebsite}
                                </a>
                              </div>
                            )}
                            {details.orgSupportEmail && (
                              <div>
                                <p className="stage-label text-[var(--stage-text-secondary)] mb-1">Support email</p>
                                <a href={`mailto:${details.orgSupportEmail}`}
                                  className="text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors">
                                  {details.orgSupportEmail}
                                </a>
                              </div>
                            )}
                            {addr && (addr.street || addr.city) && (
                              <div>
                                <p className="stage-label text-[var(--stage-text-secondary)] mb-1">Address</p>
                                <address className="not-italic space-y-0.5 text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)]">
                                  {addr.street && <p>{addr.street}</p>}
                                  {(addr.city || addr.state) && <p>{[addr.city, addr.state].filter(Boolean).join(', ')}</p>}
                                  {addr.postal_code && <p>{addr.postal_code}</p>}
                                </address>
                              </div>
                            )}
                            {ops && (ops.payment_terms || ops.tax_id) && (
                              <div className="flex gap-6">
                                {ops.payment_terms && (
                                  <div>
                                    <p className="stage-label text-[var(--stage-text-secondary)] mb-1">Terms</p>
                                    <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">{String(ops.payment_terms)}</p>
                                  </div>
                                )}
                                {ops.tax_id && (
                                  <div>
                                    <p className="stage-label text-[var(--stage-text-secondary)] mb-1">Tax ID</p>
                                    <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">On file</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()
                  }

                  {/* ── Partner: Venue specs (on surface) ── */}
                  {isPartner && details.entityDirectoryType === 'venue' && details.orgVenueSpecs && (() => {
                    const specs = details.orgVenueSpecs!;
                    const hasAny = specs.capacity || specs.load_in_notes || specs.power_notes || specs.stage_notes;
                    if (!hasAny) return null;
                    return (
                      <>
                        <div className="h-px bg-[var(--stage-edge-subtle)]" />
                        <div className="space-y-3">
                          <h3 className="stage-label text-[var(--stage-text-secondary)]">Venue specs</h3>
                          <dl className="space-y-3">
                            {specs.capacity && (
                              <div>
                                <dt className="stage-label text-[var(--stage-text-secondary)] mb-0.5">Capacity</dt>
                                <dd className="text-[length:var(--stage-data-size)] font-mono tabular-nums text-[var(--stage-text-primary)]">{specs.capacity.toLocaleString()}</dd>
                              </div>
                            )}
                            {specs.load_in_notes && (
                              <div>
                                <dt className="stage-label text-[var(--stage-text-secondary)] mb-0.5">Load-in</dt>
                                <dd className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">{specs.load_in_notes}</dd>
                              </div>
                            )}
                            {specs.power_notes && (
                              <div>
                                <dt className="stage-label text-[var(--stage-text-secondary)] mb-0.5">Power</dt>
                                <dd className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">{specs.power_notes}</dd>
                              </div>
                            )}
                            {specs.stage_notes && (
                              <div>
                                <dt className="stage-label text-[var(--stage-text-secondary)] mb-0.5">Stage</dt>
                                <dd className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">{specs.stage_notes}</dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      </>
                    );
                  })()}

                  {/* ── Divider before cards ── */}
                  <div className="h-px bg-[var(--stage-edge-subtle)]" />

                  {/* ── Employee: Upcoming assignments card ── */}
                  {!isPartner && details.subjectEntityId && (
                    <UpcomingAssignments entityId={details.subjectEntityId} />
                  )}

                  {/* ── Employee: Kit (equipment profile) ── */}
                  {!isPartner && details.subjectEntityId && (
                    <CrewKitSection entityId={details.subjectEntityId} />
                  )}

                  {/* ── Employee: Quick-book card ── */}
                  {!isPartner && details.subjectEntityId && (
                    <QuickBookAction
                      entityId={details.subjectEntityId}
                      entityName={details.identity.name}
                    />
                  )}

                  {/* ── Partner: Deal history card ── */}
                  {isPartner && details.subjectEntityId && (
                    <DealHistoryPanel entityId={details.subjectEntityId} />
                  )}

                  {/* ── Notes card ── */}
                  <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
                    <PrivateNotes
                      relationshipId={details.relationshipId}
                      initialNotes={details.notes}
                    />
                  </div>

                  {/* ── Active shows card ── */}
                  {details.active_events.length > 0 && (
                    <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
                      <h3 className="stage-label text-[var(--stage-text-secondary)] mb-2">
                        Active shows
                      </h3>
                      <ul className="space-y-1 text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
                        {details.active_events.map((name, i) => (
                          <li key={`${name}-${i}`}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ── Employee: Invite card ── */}
                  {!isPartner && (details.inviteStatus === 'ghost' || details.inviteStatus === 'invited') && (
                    <InviteCard
                      details={details}
                      sourceOrgId={sourceOrgId}
                      onSaved={handleRefresh}
                    />
                  )}

                  {/* ── Employee: Roster status card ── */}
                  {!isPartner && details.canAssignElevatedRole && (
                    <RosterStatusCard
                      details={details}
                      sourceOrgId={sourceOrgId}
                      onRemoved={handleClose}
                      onSaved={handleRefresh}
                    />
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
                    <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)]">
                      Available for partners.
                    </p>
                  )}
                </motion.div>
              )}

              </AnimatePresence>
            </div>
          </div>
      </SheetContent>
    </Sheet>
  );
}
