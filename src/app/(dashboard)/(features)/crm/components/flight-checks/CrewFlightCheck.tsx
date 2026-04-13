'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Users, RefreshCw, Bell } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { syncCrewFromProposalToEvent } from '../../actions/sync-crew-from-proposal';
import { sendCrewReminderByEntity } from '../../actions/send-crew-reminder-by-entity';
import { confirmDealCrew, updateCrewDispatch, type DealCrewRow } from '../../actions/deal-crew';
import type { CrewRolesDiagnostic } from '../../actions/get-crew-roles-from-proposal';
import { AssignCrewSheet } from './AssignCrewSheet';
import { CrewIdentityRow, OpenRoleRow } from '../crew-identity-row';

type DispatchStatus = 'standby' | 'en_route' | 'on_site' | 'wrapped';
const DISPATCH_ORDER: DispatchStatus[] = ['standby', 'en_route', 'on_site', 'wrapped'];
const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  standby: 'Standby',
  en_route: 'En route',
  on_site: 'On site',
  wrapped: 'Wrapped',
};
const DISPATCH_COLORS: Record<DispatchStatus, string> = {
  standby: 'border-[oklch(1_0_0_/_0.06)] bg-[oklch(1_0_0_/_0.04)]',
  en_route: 'bg-[var(--color-unusonic-warning)]/10 text-[var(--stage-text-secondary)] border-transparent',
  on_site: 'bg-[var(--color-unusonic-info)]/10 text-[var(--stage-text-secondary)] border-transparent',
  wrapped: 'bg-[var(--color-unusonic-success)]/12 text-[var(--stage-text-secondary)] border-transparent',
};

type CrewFlightCheckProps = {
  eventId: string;
  crewRows: DealCrewRow[];
  crewLoading?: boolean;
  onUpdated?: () => void;
  defaultCollapsed?: boolean;
  maxVisible?: number;
};

export function CrewFlightCheck({
  eventId,
  crewRows,
  crewLoading = false,
  onUpdated,
  defaultCollapsed = false,
  maxVisible = 5,
}: CrewFlightCheckProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [updating, setUpdating] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [assignSheetIndex, setAssignSheetIndex] = useState<number | null>(null);
  const [reminderSending, setReminderSending] = useState<string | null>(null);
  const [reminderResults, setReminderResults] = useState<Record<string, 'sent' | 'error'>>({});

  const totalCount = crewRows.length;
  const showCollapse = totalCount > maxVisible;
  const visibleCount = collapsed && showCollapse ? maxVisible : totalCount;

  const cycleDispatchStatus = async (row: DealCrewRow) => {
    const current = row.dispatch_status as DispatchStatus | null ?? 'standby';
    const idx = DISPATCH_ORDER.indexOf(current);
    const next = DISPATCH_ORDER[(idx + 1) % DISPATCH_ORDER.length];
    setUpdating(row.id);
    const result = await updateCrewDispatch(row.id, { dispatch_status: next });
    setUpdating(null);
    if (result.success) onUpdated?.();
  };

  const handleConfirm = async (row: DealCrewRow) => {
    setUpdating(row.id);
    const result = await confirmDealCrew(row.id);
    setUpdating(null);
    if (result.success) onUpdated?.();
  };

  const handleSendReminder = async (entityId: string) => {
    setReminderSending(entityId);
    const result = await sendCrewReminderByEntity(eventId, entityId);
    setReminderSending(null);
    setReminderResults((prev) => ({ ...prev, [entityId]: result.success ? 'sent' : 'error' }));
    setTimeout(() => {
      setReminderResults((prev) => { const next = { ...prev }; delete next[entityId]; return next; });
    }, 4000);
  };

  function formatDiagnostic(d: CrewRolesDiagnostic): string {
    if (d.step === 'no_proposal') return 'No proposal found for this deal.';
    if (d.step === 'no_items') return 'This proposal has no line items.';
    if (d.step === 'no_package_ids') return `Proposal has ${d.itemCount ?? 0} item(s) but none are catalog packages.`;
    if (d.step === 'no_packages_found') return 'Proposal references packages that could not be loaded.';
    if (d.step === 'no_roles') {
      const parts: string[] = [];
      if (d.packages?.length) parts.push(`On proposal: ${d.packages.map((p) => `${p.name} (${p.category})`).join('; ')}.`);
      if (d.ingredients?.length) parts.push(`Inside bundles: ${d.ingredients.map((p) => `${p.name} (${p.category})`).join('; ')}.`);
      if (parts.length) { parts.push('Set "Staff role" on service items in Catalog.'); return parts.join(' '); }
      return 'No crew roles found. Set "Staff role" on service packages in Catalog.';
    }
    return 'No crew roles found.';
  }

  const handleSyncFromProposal = async () => {
    setSyncError(null);
    setSyncMessage(null);
    setSyncing(true);
    const result = await syncCrewFromProposalToEvent(eventId);
    setSyncing(false);
    if (result.success) {
      onUpdated?.();
      if (result.added === 0 && result.diagnostic) setSyncMessage(formatDiagnostic(result.diagnostic));
      else if (result.added === 0) setSyncMessage('No crew roles found.');
    } else {
      setSyncError(result.error);
    }
  };

  function ReminderButton({ entityId }: { entityId: string }) {
    if (reminderResults[entityId]) {
      return (
        <span className={`stage-badge-text px-1.5 py-0.5 rounded-md ${
          reminderResults[entityId] === 'sent'
            ? 'text-[var(--color-unusonic-success)] bg-[var(--color-unusonic-success)]/8'
            : 'text-[var(--color-unusonic-error)] bg-[var(--color-unusonic-error)]/8'
        }`}>
          {reminderResults[entityId] === 'sent' ? 'Sent' : 'Error'}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => handleSendReminder(entityId)}
        disabled={reminderSending === entityId}
        title="Send reminder email"
        className="p-1.5 rounded-md text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] disabled:opacity-45 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
      >
        <Bell size={13} strokeWidth={1.5} className={reminderSending === entityId ? 'animate-ping' : ''} aria-hidden />
      </button>
    );
  }

  if (crewLoading) {
    return (
      <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
        <div className="flex items-center gap-3">
          <Users size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <h3 className="stage-label">Crew</h3>
          <span className="text-xs text-[var(--stage-text-secondary)]">Loading...</span>
        </div>
      </StagePanel>
    );
  }

  if (totalCount === 0) {
    return (
      <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Users size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
            <div>
              <h3 className="stage-label">Crew</h3>
              <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5">No roles requested yet</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSyncFromProposal}
            disabled={syncing}
            className="inline-flex items-center gap-2 py-2 px-3 rounded-xl stage-readout border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45 transition-colors"
          >
            <RefreshCw size={14} strokeWidth={1.5} className={syncing ? 'animate-spin' : ''} aria-hidden />
            {syncing ? 'Syncing...' : 'Pull crew from proposal'}
          </button>
          {syncError && <p className="text-xs text-[var(--color-unusonic-error)]">{syncError}</p>}
          {syncMessage && <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">{syncMessage}</p>}
        </div>
      </StagePanel>
    );
  }

  const assignSheetRole =
    assignSheetIndex !== null ? crewRows[assignSheetIndex]?.role_note ?? '' : '';

  const assignedEntityIds = crewRows.map((r) => r.entity_id).filter((id): id is string => !!id);

  return (
    <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-xl"
      >
        <div className="flex items-center gap-3">
          <Users size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <h3 className="stage-label">Crew</h3>
        </div>
        {showCollapse && (
          <span className="text-[var(--stage-text-secondary)]">
            {collapsed ? <ChevronDown size={18} strokeWidth={1.5} /> : <ChevronUp size={18} strokeWidth={1.5} />}
          </span>
        )}
      </button>

      <div className="mt-4 space-y-0">
        {crewRows.slice(0, visibleCount).map((row, index) => {
          if (!row.entity_id) {
            return <OpenRoleRow key={row.id} row={row} onAssign={() => setAssignSheetIndex(index)} />;
          }

          const isConfirmed = row.confirmed_at != null;
          const dispatchStatus = row.dispatch_status as DispatchStatus | null;

          return (
            <CrewIdentityRow
              key={row.id}
              row={row}
              onClickName={row.employment_status === 'internal_employee' && row.roster_rel_id
                ? () => window.open(`/network/entity/${row.roster_rel_id}?kind=internal_employee`, '_blank')
                : undefined
              }
              actions={
                !isConfirmed ? (
                  <>
                    {row.entity_id && <ReminderButton entityId={row.entity_id} />}
                    <button
                      type="button"
                      onClick={() => handleConfirm(row)}
                      disabled={updating === row.id}
                      className="px-3 py-1.5 rounded-[22px] stage-badge-text tracking-tight border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
                    >
                      {updating === row.id ? '...' : 'Confirm'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => cycleDispatchStatus(row)}
                    disabled={updating === row.id}
                    className={`px-3 py-1.5 rounded-[22px] stage-badge-text tracking-tight border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45 ${DISPATCH_COLORS[dispatchStatus ?? 'standby']}`}
                  >
                    {updating === row.id ? '...' : DISPATCH_LABELS[dispatchStatus ?? 'standby']}
                  </button>
                )
              }
            />
          );
        })}
      </div>

      <AssignCrewSheet
        open={assignSheetIndex !== null}
        onOpenChange={(open) => !open && setAssignSheetIndex(null)}
        role={assignSheetRole}
        eventId={eventId}
        onAssigned={onUpdated}
        assignedEntityIds={assignedEntityIds}
      />

      {collapsed && showCollapse && (
        <p className="text-xs text-[var(--stage-text-secondary)] mt-2">+{totalCount - maxVisible} more</p>
      )}
    </StagePanel>
  );
}
