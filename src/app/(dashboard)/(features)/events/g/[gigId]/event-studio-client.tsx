'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  DollarSign,
  FileText,
  ScrollText,
  Check,
  X as XIcon,
  Pencil,
  AlertTriangle,
  Plus,
  UserX,
  Building2,
  MapPin,
  ClipboardList,
} from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';
import { StatusPill, updateEventCommand, InlineEditNumber } from '@/features/event-dashboard';
import { useConflictDetection } from '@/features/ops/hooks/use-conflict-detection';
import { PlanVitalsRow } from '@/app/(dashboard)/(features)/crm/components/plan-vitals-row';
import { AssignCrewSheet } from '@/app/(dashboard)/(features)/crm/components/flight-checks/AssignCrewSheet';
import {
  CrewFlightCheck,
  GearFlightCheck,
  LogisticsFlightCheck,
} from '@/app/(dashboard)/(features)/crm/components/flight-checks';
import { assignOrAddCrewMember } from '@/app/(dashboard)/(features)/crm/actions/assign-or-add-crew-member';
import { removeCrewItem } from '@/app/(dashboard)/(features)/crm/actions/remove-crew-item';
import type { InternalTeamMember } from '@/app/(dashboard)/(features)/crm/actions/get-internal-team-for-role';
import type { EventCommandDTO, EventLifecycleStatus } from '@/entities/event';
import type { EventSummaryForPrism } from '@/app/(dashboard)/(features)/crm/actions/get-event-summary';
import { cn } from '@/shared/lib/utils';

/** Lead roles always shown as named quick-slots at the top of the Team card. */
const LEAD_ROLES = ['Producer', 'PM'] as const;

type EventStudioClientProps = {
  event: EventCommandDTO;
  summary: EventSummaryForPrism;
};

export function EventStudioClient({ event, summary }: EventStudioClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Title inline editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(event.title ?? '');

  // Notes
  const [notesValue, setNotesValue] = useState(event.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);

  // Guest count
  const [guestCount, setGuestCount] = useState<number | null>(event.guest_count_expected ?? null);

  const saveGuestCount = useCallback(async (value: string | number): Promise<{ ok: boolean; error?: string }> => {
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    const count = Number.isNaN(n) ? null : n;
    setGuestCount(count);
    const result = await updateEventCommand(event.id, { guest_count_expected: count });
    if (result.ok) router.refresh();
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }, [event.id, router]);

  const { conflicts } = useConflictDetection({ eventId: event.id, enabled: true });

  const refresh = useCallback(() => router.refresh(), [router]);

  const saveTitle = useCallback(async () => {
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === event.title) {
      setEditingTitle(false);
      return;
    }
    startTransition(async () => {
      await updateEventCommand(event.id, { title: trimmed });
      setEditingTitle(false);
      router.refresh();
    });
  }, [event.id, event.title, titleValue, router]);

  const cancelTitle = useCallback(() => {
    setTitleValue(event.title ?? '');
    setEditingTitle(false);
  }, [event.title]);

  const saveNotes = useCallback(async () => {
    if (notesValue === (event.notes ?? '')) return;
    setSavingNotes(true);
    await updateEventCommand(event.id, { notes: notesValue || undefined });
    setSavingNotes(false);
    router.refresh();
  }, [event.id, event.notes, notesValue, router]);

  const handleStatusSave = useCallback(
    async (v: EventLifecycleStatus) => {
      await updateEventCommand(event.id, { lifecycle_status: v });
      router.refresh();
      return { ok: true as const };
    },
    [event.id, router]
  );

  const runOfShowData = summary.run_of_show_data ?? null;

  // Crew items are the canonical team source — from ops.crew_assignments (normalized), each has an `id` UUID.
  const crewItems = (Array.isArray(runOfShowData?.crew_items) ? runOfShowData.crew_items : []).map((c, i) => ({
    ...c,
    id: (c as { id?: string }).id ?? `crew-${i}`,
  }));

  // Assign sheet state
  const [assignSheetOpen, setAssignSheetOpen] = useState(false);
  const [assigningRole, setAssigningRole] = useState('');

  // Add-crew inline form
  const [addingRole, setAddingRole] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState('');

  const openAssignSheet = (role: string) => {
    setAssigningRole(role);
    setAssignSheetOpen(true);
  };

  const handleCrewAssign = useCallback(
    async (member: InternalTeamMember) => {
      const result = await assignOrAddCrewMember(event.id, assigningRole, member.entity_id, member.name);
      if (result.success) refresh();
      return result;
    },
    [event.id, assigningRole, refresh]
  );

  const handleRemoveCrew = useCallback(
    async (assignmentId: string) => {
      await removeCrewItem(event.id, assignmentId);
      refresh();
    },
    [event.id, refresh]
  );

  const handleAddRoleSubmit = () => {
    const role = newRoleInput.trim();
    if (!role) return;
    setNewRoleInput('');
    setAddingRole(false);
    openAssignSheet(role);
  };

  return (
    <div className="relative min-h-screen">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-6 py-3 border-b border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)]">
        <Link
          href="/crm"
          className="shrink-0 p-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-surface-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          aria-label="Back to CRM"
        >
          <ArrowLeft size={18} />
        </Link>

        <div className="min-w-0 flex-1 flex items-center gap-3">
          {/* Inline title */}
          {editingTitle ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <input
                autoFocus
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') cancelTitle();
                }}
                className="min-w-0 flex-1 bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.15)] rounded-lg px-2 py-1 text-sm font-medium text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              />
              <button
                type="button"
                onClick={saveTitle}
                disabled={pending}
                aria-label="Save title"
                className="shrink-0 p-1 rounded text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                onClick={cancelTitle}
                aria-label="Cancel"
                className="shrink-0 p-1 rounded text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              >
                <XIcon size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="group flex items-center gap-2 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
            >
              <span className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                {event.title ?? 'Untitled'}
              </span>
              <Pencil
                size={11}
                className="shrink-0 text-[var(--stage-text-secondary)] opacity-0 group-hover:opacity-50 transition-opacity"
                aria-hidden
              />
            </button>
          )}

          <StatusPill
            value={(event.lifecycle_status ?? 'lead') as EventLifecycleStatus}
            onSave={handleStatusSave}
          />
        </div>

        {/* Quick nav */}
        <div className="flex items-center gap-2 shrink-0">
          {event.client_entity_id && event.client_name && (
            <Link
              href={`/network/entity/${event.client_entity_id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--stage-text-secondary)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            >
              <Building2 size={13} />
              {event.client_name}
            </Link>
          )}
          {event.venue_entity_id && event.venue_name && (
            <Link
              href={`/network/entity/${event.venue_entity_id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--stage-text-secondary)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            >
              <MapPin size={13} />
              {event.venue_name}
            </Link>
          )}
          <Link
            href={`/events/${event.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--stage-text-secondary)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            <Pencil size={13} />
            Edit details
          </Link>
          <Link
            href={`/events/${event.id}/deal`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--stage-text-secondary)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            <FileText size={13} />
            Deal room
          </Link>
          <Link
            href={`/events/g/${event.id}/pull-sheet`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--stage-text-secondary)] border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            <ClipboardList size={13} />
            Pull sheet
          </Link>
          <Link
            href={`/events/${event.id}/finance`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--stage-text-primary)] border border-[var(--stage-accent)]/30 bg-[var(--stage-accent)]/10 hover:bg-[var(--stage-accent)]/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            <DollarSign size={13} />
            Finance
          </Link>
        </div>
      </header>

      <div className="p-6 flex flex-col gap-8 max-w-7xl mx-auto w-full">

        {/* Conflict alert */}
        {conflicts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={STAGE_HEAVY}
            className="rounded-[var(--stage-radius-panel)] border border-[var(--color-unusonic-warning)]/50 bg-[var(--color-unusonic-warning)]/10 p-4 flex items-start gap-4"
            role="alert"
          >
            <AlertTriangle size={20} className="shrink-0 text-[var(--color-unusonic-warning)] mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[var(--stage-text-primary)] font-medium tracking-tight">
                Resource conflict{conflicts.length > 1 ? 's' : ''} detected
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--stage-text-secondary)]">
                {conflicts.map((c, i) => (
                  <li key={`${c.eventId}-${c.resourceType}-${c.resourceName}-${i}`}>
                    <span className="font-medium text-[var(--stage-text-primary)]">{c.resourceName}</span>
                    {c.resourceType === 'crew' ? ' (crew)' : ' (gear)'} —{' '}
                    <span className="text-[var(--color-unusonic-warning)]">{c.eventName}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}

        {/* Vitals */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_HEAVY}
        >
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]/60 mb-4">
            Vitals
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <PlanVitalsRow
              eventId={event.id}
              event={summary}
              datesLoadIn={event.dates_load_in}
              datesLoadOut={event.dates_load_out}
              onEventUpdated={refresh}
            />
          </div>
        </motion.section>

        {/* Operations */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...STAGE_HEAVY, delay: 0.04 }}
        >
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]/60 mb-4">
            Operations
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <CrewFlightCheck
              eventId={event.id}
              runOfShowData={runOfShowData}
              onUpdated={refresh}
              defaultCollapsed={false}
              maxVisible={10}
            />
            <GearFlightCheck
              eventId={event.id}
              eventStartsAt={summary.starts_at ?? null}
              eventEndsAt={summary.ends_at ?? null}
              onUpdated={refresh}
              defaultCollapsed={false}
              maxVisible={10}
            />
            <LogisticsFlightCheck
              eventId={event.id}
              runOfShowData={runOfShowData}
              onUpdated={refresh}
              defaultCollapsed={false}
            />
          </div>
        </motion.section>

        {/* Run of show */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...STAGE_HEAVY, delay: 0.08 }}
        >
          <Link
            href={`/crm/${event.id}`}
            className="flex items-center justify-between min-h-[80px] rounded-[var(--stage-radius-panel)] border-2 border-dashed border-[oklch(1_0_0_/_0.08)] p-6 transition-all hover:border-[var(--stage-accent)]/40 hover:bg-[var(--stage-accent)]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] group"
          >
            <div>
              <p className="text-[var(--stage-text-primary)] font-medium tracking-tight group-hover:text-[var(--stage-accent)] transition-colors">
                Run of show
              </p>
              <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">Cues, timeline, and detailed schedule</p>
            </div>
            <ScrollText size={18} className="shrink-0 text-[var(--stage-text-secondary)]/50 group-hover:text-[var(--stage-accent)]/60 transition-colors" aria-hidden />
          </Link>
        </motion.div>

        {/* Guest count */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...STAGE_HEAVY, delay: 0.10 }}
        >
          <StagePanel className="p-6 sm:p-7 flex items-center gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]/80 mb-2">
                Expected guests
              </p>
              <InlineEditNumber
                value={guestCount}
                onSave={saveGuestCount}
                placeholder="—"
                min={0}
                className="text-[var(--stage-text-primary)] font-medium tracking-tight"
              />
            </div>
          </StagePanel>
        </motion.div>

        {/* Notes + Team */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...STAGE_HEAVY, delay: 0.12 }}
        >
          {/* Notes */}
          <StagePanel className="p-6 sm:p-7 flex flex-col gap-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]/80">
              Notes
            </p>
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              onBlur={saveNotes}
              placeholder="General notes…"
              rows={5}
              className="w-full min-w-0 bg-transparent border-0 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]/40 focus:outline-none resize-none leading-relaxed"
            />
            {savingNotes && (
              <p className="text-[10px] text-[var(--stage-text-secondary)]/60">Saving…</p>
            )}
          </StagePanel>

          {/* Team */}
          <StagePanel className="p-6 sm:p-7 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]/80">
                Team
              </p>
              {!addingRole && (
                <button
                  type="button"
                  onClick={() => setAddingRole(true)}
                  className="flex items-center gap-1 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
                >
                  <Plus size={12} />
                  Add
                </button>
              )}
            </div>

            {/* Lead role quick-slots */}
            <div className="flex flex-col gap-3">
              {LEAD_ROLES.map((role) => {
                const slot = crewItems.find(
                  (c) => c.role?.toLowerCase() === role.toLowerCase() && c.entity_id
                );
                return (
                  <div key={role} className="flex items-center gap-3">
                    <div className={cn(
                      'size-9 rounded-full border flex items-center justify-center text-sm font-medium shrink-0',
                      slot
                        ? 'bg-[oklch(1_0_0_/_0.10)] border-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)]'
                        : 'bg-[oklch(1_0_0_/_0.03)] border-dashed border-[oklch(1_0_0_/_0.15)] text-[var(--stage-text-secondary)]/40'
                    )}>
                      {slot ? (slot.assignee_name ?? '?').slice(0, 1).toUpperCase() : '—'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--stage-text-primary)] leading-tight truncate">
                        {slot ? (slot.assignee_name ?? '—') : (
                          <button
                            type="button"
                            onClick={() => openAssignSheet(role)}
                            className="text-sm text-[var(--stage-text-secondary)]/60 hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none"
                          >
                            Unassigned
                          </button>
                        )}
                      </p>
                      <p className="text-xs text-[var(--stage-text-secondary)]">{role}</p>
                    </div>
                    {slot ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveCrew(slot.id)}
                        aria-label={`Remove ${role}`}
                        className="shrink-0 p-1 rounded text-[var(--stage-text-secondary)]/40 hover:text-[var(--color-unusonic-error)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                      >
                        <UserX size={13} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openAssignSheet(role)}
                        aria-label={`Assign ${role}`}
                        className="shrink-0 rounded-[22px] border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.04)] px-2.5 py-1 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                      >
                        Assign
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Additional crew */}
            {crewItems
              .filter((c) => !LEAD_ROLES.some((r) => r.toLowerCase() === c.role?.toLowerCase()))
              .map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="size-9 rounded-full bg-[oklch(1_0_0_/_0.10)] border border-[oklch(1_0_0_/_0.10)] flex items-center justify-center text-sm font-medium text-[var(--stage-text-primary)] shrink-0">
                    {c.entity_id
                      ? (c.assignee_name ?? '?').slice(0, 1).toUpperCase()
                      : '—'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--stage-text-primary)] leading-tight truncate">
                      {c.entity_id ? (c.assignee_name ?? '—') : (
                        <button
                          type="button"
                          onClick={() => openAssignSheet(c.role)}
                          className="text-sm text-[var(--stage-text-secondary)]/60 hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none"
                        >
                          Unassigned
                        </button>
                      )}
                    </p>
                    <p className="text-xs text-[var(--stage-text-secondary)]">{c.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCrew(c.id)}
                    aria-label={`Remove ${c.role}`}
                    className="shrink-0 p-1 rounded text-[var(--stage-text-secondary)]/40 hover:text-[var(--color-unusonic-error)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  >
                    <UserX size={13} />
                  </button>
                </div>
              ))}

            {/* Add role form */}
            {addingRole && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  autoFocus
                  value={newRoleInput}
                  onChange={(e) => setNewRoleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddRoleSubmit();
                    if (e.key === 'Escape') { setAddingRole(false); setNewRoleInput(''); }
                  }}
                  placeholder="Role name…"
                  className="min-w-0 flex-1 bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.15)] rounded-lg px-2 py-1 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                />
                <button
                  type="button"
                  onClick={handleAddRoleSubmit}
                  disabled={!newRoleInput.trim()}
                  className="shrink-0 p-1 rounded text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/10 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingRole(false); setNewRoleInput(''); }}
                  className="shrink-0 p-1 rounded text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                >
                  <XIcon size={14} />
                </button>
              </div>
            )}

            {crewItems.length === 0 && !addingRole && (
              <p className="text-sm text-[var(--stage-text-secondary)]">No team assigned yet.</p>
            )}
          </StagePanel>

          {/* Assign crew sheet */}
          <AssignCrewSheet
            open={assignSheetOpen}
            onOpenChange={setAssignSheetOpen}
            role={assigningRole}
            eventId={event.id}
            onSelect={handleCrewAssign}
            onAssigned={refresh}
          />
        </motion.div>

      </div>
    </div>
  );
}
