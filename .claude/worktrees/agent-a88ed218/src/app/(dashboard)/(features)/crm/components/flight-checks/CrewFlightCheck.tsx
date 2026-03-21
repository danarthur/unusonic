'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Users, RefreshCw } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import { updateFlightCheckStatus } from '../../actions/update-flight-check-status';
import { syncCrewFromProposalToEvent } from '../../actions/sync-crew-from-proposal';
import type { CrewRolesDiagnostic } from '../../actions/get-crew-roles-from-proposal';
import { normalizeCrewItems, type CrewItem, type CrewStatus } from './types';
import type { RunOfShowData } from '@/entities/event/api/get-event-summary';
import { AssignCrewSheet } from './AssignCrewSheet';

const CREW_STATUS_ORDER: CrewStatus[] = ['requested', 'confirmed', 'dispatched'];
const CREW_LABELS: Record<CrewStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  dispatched: 'Dispatched',
};

type CrewFlightCheckProps = {
  eventId: string;
  runOfShowData: RunOfShowData | null;
  onUpdated?: () => void;
  defaultCollapsed?: boolean;
  maxVisible?: number;
};

export function CrewFlightCheck({
  eventId,
  runOfShowData,
  onUpdated,
  defaultCollapsed = false,
  maxVisible = 5,
}: CrewFlightCheckProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [updating, setUpdating] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [assignSheetIndex, setAssignSheetIndex] = useState<number | null>(null);

  const items = normalizeCrewItems(runOfShowData);
  const showCollapse = items.length > maxVisible;
  const visibleItems = collapsed && showCollapse ? items.slice(0, maxVisible) : items;
  const hasMore = collapsed && showCollapse && items.length > maxVisible;

  const setStatus = async (index: number, status: CrewStatus) => {
    const next: CrewItem[] = items.map((item, i) =>
      i === index ? { ...item, status } : item
    );
    setUpdating(`${index}`);
    const result = await updateFlightCheckStatus(eventId, { crew_items: next });
    setUpdating(null);
    if (result.success) onUpdated?.();
  };

  const cycleStatus = (index: number) => {
    const current = items[index]?.status ?? 'requested';
    const idx = CREW_STATUS_ORDER.indexOf(current);
    const next = CREW_STATUS_ORDER[(idx + 1) % CREW_STATUS_ORDER.length];
    setStatus(index, next);
  };

  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  function formatDiagnostic(d: CrewRolesDiagnostic): string {
    if (d.step === 'no_proposal') {
      return 'No proposal found for this deal.';
    }
    if (d.step === 'no_items') {
      return 'This proposal has no line items. Add packages from the catalog to the proposal.';
    }
    if (d.step === 'no_package_ids') {
      return `Proposal has ${d.itemCount ?? 0} item(s) but none are catalog packages (they may be custom lines). Add a service or package from the catalog.`;
    }
    if (d.step === 'no_packages_found') {
      return 'Proposal references packages that could not be loaded. Check workspace.';
    }
    if (d.step === 'no_roles') {
      const parts: string[] = [];
      if (d.packages?.length) {
        const list = d.packages.map((p) => `${p.name} (${p.category}${p.staffRole ? `, staff role: ${p.staffRole}` : ''})`).join('; ');
        parts.push(`On proposal: ${list}.`);
      }
      if (d.ingredients?.length) {
        const list = d.ingredients.map((p) => `${p.name} (${p.category}${p.staffRole ? `, staff role: ${p.staffRole}` : ', no staff role'})`).join('; ');
        parts.push(`Inside bundles: ${list}.`);
      }
      if (parts.length) {
        parts.push('To get crew roles: in Catalog, open each service item, set "Staff role" (e.g. DJ), then save.');
        return parts.join(' ');
      }
      return 'No crew roles found. In Catalog, set "Staff role" on service packages (e.g. DJ), then add them (or a package that contains them) to the proposal.';
    }
    return 'No crew roles found. Add service packages with a staff role in Catalog, then add them to the proposal.';
  }

  const handleSyncFromProposal = async () => {
    setSyncError(null);
    setSyncMessage(null);
    setSyncing(true);
    const result = await syncCrewFromProposalToEvent(eventId);
    setSyncing(false);
    if (result.success) {
      onUpdated?.();
      if (result.added === 0 && result.diagnostic) {
        setSyncMessage(formatDiagnostic(result.diagnostic));
      } else if (result.added === 0) {
        setSyncMessage('No crew roles found. Add service packages with a staff role in Catalog, then add them to the proposal.');
      }
    } else {
      setSyncError(result.error);
    }
  };

  if (items.length === 0) {
    return (
      <LiquidPanel className="p-5 rounded-[28px] border border-white/10">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Users size={20} className="shrink-0 text-ink-muted" aria-hidden />
            <div>
              <h3 className="text-xs font-medium uppercase tracking-widest text-ink-muted">Crew</h3>
              <p className="text-sm text-ink-muted mt-0.5">No roles requested yet</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSyncFromProposal}
            disabled={syncing}
            className="inline-flex items-center gap-2 py-2 px-3 rounded-xl text-sm font-medium tracking-tight text-ceramic border border-white/10 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 transition-colors"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} aria-hidden />
            {syncing ? 'Syncing…' : 'Pull crew from proposal'}
          </button>
          {syncError && (
            <p className="text-xs text-[var(--color-signal-error)]">{syncError}</p>
          )}
          {syncMessage && (
            <p className="text-xs text-ink-muted leading-relaxed">{syncMessage}</p>
          )}
        </div>
      </LiquidPanel>
    );
  }

  return (
    <LiquidPanel className="p-5 rounded-[28px] border border-white/10">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-xl"
      >
        <div className="flex items-center gap-3">
          <Users size={20} className="shrink-0 text-ink-muted" aria-hidden />
          <h3 className="text-xs font-medium uppercase tracking-widest text-ink-muted">Crew</h3>
        </div>
        {showCollapse && (
          <span className="text-ink-muted">
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </span>
        )}
      </button>
      <ul className="mt-4 space-y-3">
        {visibleItems.map((item, index) => (
          <motion.li
            key={`${item.role}-${index}`}
            layout
            initial={false}
            animate={{ opacity: 1 }}
            transition={SIGNAL_PHYSICS}
            className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0"
          >
            <div className="min-w-0 flex-1">
              <span className="text-ceramic font-medium tracking-tight text-sm truncate block">
                {item.role}
              </span>
              {item.assignee_name && (
                <span className="text-xs text-ink-muted truncate block mt-0.5">{item.assignee_name}</span>
              )}
            </div>
            {item.status === 'requested' ? (
              <motion.button
                type="button"
                onClick={() => setAssignSheetIndex(index)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={SIGNAL_PHYSICS}
                className="shrink-0 px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight border border-white/10 bg-white/[0.06] text-neon transition-colors hover:bg-white/[0.1] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
              >
                Select from team
              </motion.button>
            ) : (
              <motion.button
                type="button"
                onClick={() => cycleStatus(index)}
                disabled={updating === `${index}`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={SIGNAL_PHYSICS}
                className={`
                  shrink-0 px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight
                  border transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]
                  disabled:opacity-60
                  ${item.status === 'dispatched' ? 'bg-[var(--color-signal-success)]/20 text-ceramic border-[var(--color-signal-success)]/40 hover:brightness-110' : ''}
                  ${item.status === 'confirmed' ? 'bg-[var(--color-neon-blue)]/15 text-ceramic border-[var(--color-neon-blue)]/30 hover:brightness-110' : ''}
                `}
              >
                {updating === `${index}` ? '…' : CREW_LABELS[item.status]}
              </motion.button>
            )}
          </motion.li>
        ))}
      </ul>
      <AssignCrewSheet
        open={assignSheetIndex !== null}
        onOpenChange={(open) => !open && setAssignSheetIndex(null)}
        role={assignSheetIndex !== null && items[assignSheetIndex] ? items[assignSheetIndex].role : ''}
        eventId={eventId}
        crewIndex={assignSheetIndex ?? 0}
        onAssigned={onUpdated}
      />
      {hasMore && (
        <p className="text-xs text-ink-muted mt-2">
          +{items.length - maxVisible} more
        </p>
      )}
    </LiquidPanel>
  );
}
