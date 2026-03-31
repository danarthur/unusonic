'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Users, RefreshCw, Bell } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { updateFlightCheckStatus } from '../../actions/update-flight-check-status';
import { syncCrewFromProposalToEvent } from '../../actions/sync-crew-from-proposal';
import { sendCrewReminderByEntity } from '../../actions/send-crew-reminder-by-entity';
import { confirmDealCrew, updateCrewDispatch, type DealCrewRow } from '../../actions/deal-crew';
import type { CrewRolesDiagnostic } from '../../actions/get-crew-roles-from-proposal';
import { normalizeCrewItems, type CrewItem, type CrewStatus } from './types';
import type { RunOfShowData } from '@/entities/event/api/get-event-summary';
import { AssignCrewSheet } from './AssignCrewSheet';
import { CrewIdentityRow, OpenRoleRow } from '../crew-identity-row';

type DispatchStatus = 'standby' | 'en_route' | 'on_site' | 'wrapped';
const DISPATCH_ORDER: DispatchStatus[] = ['standby', 'en_route', 'on_site', 'wrapped'];
const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  standby: 'Standby',
  en_route: 'En Route',
  on_site: 'On Site',
  wrapped: 'Wrapped',
};
const DISPATCH_COLORS: Record<DispatchStatus, string> = {
  standby: 'border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)]',
  en_route: 'bg-[var(--color-unusonic-warning)]/15 text-[var(--stage-text-primary)] border-[var(--color-unusonic-warning)]/30',
  on_site: 'bg-[var(--color-unusonic-info)]/15 text-[var(--stage-text-primary)] border-[var(--color-unusonic-info)]/30',
  wrapped: 'bg-[var(--color-unusonic-success)]/20 text-[var(--stage-text-primary)] border-[var(--color-unusonic-success)]/40',
};

const CREW_STATUS_ORDER: CrewStatus[] = ['requested', 'confirmed', 'dispatched'];
const CREW_LABELS: Record<CrewStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  dispatched: 'Dispatched',
};

type CrewFlightCheckProps = {
  eventId: string;
  crewRows?: DealCrewRow[];
  crewLoading?: boolean;
  runOfShowData: RunOfShowData | null;
  onUpdated?: () => void;
  defaultCollapsed?: boolean;
  maxVisible?: number;
};

export function CrewFlightCheck({
  eventId,
  crewRows = [],
  crewLoading = false,
  runOfShowData,
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

  const useDealCrew = crewRows.length > 0;
  const legacyItems = normalizeCrewItems(runOfShowData);
  const hasCrew = useDealCrew || legacyItems.length > 0;
  const totalCount = useDealCrew ? crewRows.length : legacyItems.length;
  const showCollapse = totalCount > maxVisible;
  const visibleCount = collapsed && showCollapse ? maxVisible : totalCount;

  // ── Dispatch status cycling ──
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

  // ── Legacy JSONB cycling ──
  const legacyCycleStatus = async (index: number) => {
    const current = legacyItems[index]?.status ?? 'requested';
    const idx = CREW_STATUS_ORDER.indexOf(current);
    const next = CREW_STATUS_ORDER[(idx + 1) % CREW_STATUS_ORDER.length];
    const nextItems: CrewItem[] = legacyItems.map((item, i) =>
      i === index ? { ...item, status: next } : item
    );
    setUpdating(`legacy-${index}`);
    const result = await updateFlightCheckStatus(eventId, { crew_items: nextItems });
    setUpdating(null);
    if (result.success) onUpdated?.();
  };

  // ── Reminder ──
  const handleSendReminder = async (entityId: string) => {
    setReminderSending(entityId);
    const result = await sendCrewReminderByEntity(eventId, entityId);
    setReminderSending(null);
    setReminderResults((prev) => ({ ...prev, [entityId]: result.success ? 'sent' : 'error' }));
    setTimeout(() => {
      setReminderResults((prev) => { const next = { ...prev }; delete next[entityId]; return next; });
    }, 4000);
  };

  // ── Sync ──
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

  // ── Reminder button helper ──
  function ReminderButton({ entityId }: { entityId: string }) {
    if (reminderResults[entityId]) {
      return (
        <span className={`text-[10px] font-medium px-2 py-1 rounded-lg border ${
          reminderResults[entityId] === 'sent'
            ? 'text-[var(--color-unusonic-success)] bg-[var(--color-unusonic-success)]/10 border-[var(--color-unusonic-success)]/20'
            : 'text-[var(--color-unusonic-error)] bg-[var(--color-unusonic-error)]/10 border-[var(--color-unusonic-error)]/20'
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
        className="p-2 rounded-xl text-[var(--stage-text-secondary)] border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.04)] hover:bg-[var(--stage-surface-hover)] hover:text-[var(--stage-text-primary)] disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
      >
        <Bell size={13} strokeWidth={1.5} className={reminderSending === entityId ? 'animate-ping' : ''} aria-hidden />
      </button>
    );
  }

  // ── Empty state ──
  if (!hasCrew && !crewLoading) {
    return (
      <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Users size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
            <div>
              <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Crew</h3>
              <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5">No roles requested yet</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSyncFromProposal}
            disabled={syncing}
            className="inline-flex items-center gap-2 py-2 px-3 rounded-xl text-sm font-medium tracking-tight text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-60 transition-colors"
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

  if (crewLoading) {
    return (
      <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
        <div className="flex items-center gap-3">
          <Users size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Crew</h3>
          <span className="text-xs text-[var(--stage-text-secondary)]">Loading...</span>
        </div>
      </StagePanel>
    );
  }

  // ── Assign sheet helpers ──
  const assignSheetRole = (() => {
    if (assignSheetIndex === null) return '';
    if (useDealCrew) return crewRows[assignSheetIndex]?.role_note ?? '';
    return legacyItems[assignSheetIndex]?.role ?? '';
  })();

  const assignedEntityIds = useDealCrew
    ? crewRows.map((r) => r.entity_id).filter((id): id is string => !!id)
    : legacyItems.map((i) => i.entity_id).filter((id): id is string => !!id);

  // ── Populated state ──
  return (
    <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-xl"
      >
        <div className="flex items-center gap-3">
          <Users size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Crew</h3>
        </div>
        {showCollapse && (
          <span className="text-[var(--stage-text-secondary)]">
            {collapsed ? <ChevronDown size={18} strokeWidth={1.5} /> : <ChevronUp size={18} strokeWidth={1.5} />}
          </span>
        )}
      </button>

      <div className="mt-4 space-y-0">
        {useDealCrew ? (
          crewRows.slice(0, visibleCount).map((row, index) => {
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
                        className="px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)] transition-colors hover:bg-[var(--stage-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-60"
                      >
                        {updating === row.id ? '...' : 'Confirm'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => cycleDispatchStatus(row)}
                      disabled={updating === row.id}
                      className={`px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-60 ${DISPATCH_COLORS[dispatchStatus ?? 'standby']}`}
                    >
                      {updating === row.id ? '...' : DISPATCH_LABELS[dispatchStatus ?? 'standby']}
                    </button>
                  )
                }
              />
            );
          })
        ) : (
          /* Legacy JSONB fallback */
          legacyItems.slice(0, visibleCount).map((item, index) => (
            <motion.div
              key={`${item.role}-${index}`}
              layout
              initial={false}
              animate={{ opacity: 1 }}
              transition={STAGE_LIGHT}
              className="flex items-center justify-between gap-4 py-2 border-b border-[oklch(1_0_0_/_0.05)] last:border-0"
            >
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)] truncate block">{item.role}</span>
                {item.assignee_name && <span className="text-xs text-[var(--stage-text-secondary)] truncate block mt-0.5">{item.assignee_name}</span>}
              </div>
              {item.status === 'requested' ? (
                <div className="flex items-center gap-2 shrink-0">
                  {item.entity_id && <ReminderButton entityId={item.entity_id} />}
                  <button type="button" onClick={() => setAssignSheetIndex(index)} className="px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)] transition-colors hover:bg-[var(--stage-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]">
                    Select from team
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => legacyCycleStatus(index)}
                  disabled={updating === `legacy-${index}`}
                  className={`shrink-0 px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-60 ${item.status === 'dispatched' ? 'bg-[var(--color-unusonic-success)]/20 text-[var(--stage-text-primary)] border-[var(--color-unusonic-success)]/40' : ''} ${item.status === 'confirmed' ? 'bg-[var(--color-unusonic-info)]/15 text-[var(--stage-text-primary)] border-[var(--color-unusonic-info)]/30' : ''}`}
                >
                  {updating === `legacy-${index}` ? '...' : CREW_LABELS[item.status]}
                </button>
              )}
            </motion.div>
          ))
        )}
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
