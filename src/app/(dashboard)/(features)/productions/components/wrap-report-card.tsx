'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';
import { toast } from 'sonner';
import { ClipboardCheck, ChevronDown, Pencil } from 'lucide-react';
import type { DealCrewRow } from '../actions/deal-crew';
import type { EventGearItem } from '../actions/event-gear-items';
import type {
  WrapReport,
  WrapCrewEntry,
  WrapGearEntry,
  GearCondition,
  CrewRating,
} from '../lib/wrap-report-types';
import { GEAR_CONDITIONS } from '../lib/wrap-report-types';
import { getWrapReport, saveWrapReport, prefillWrapReport } from '../actions/wrap-report';
import { markShowWrapped, undoMarkShowWrapped } from '../actions/mark-show-wrapped';

// =============================================================================
// Props
// =============================================================================

type WrapReportCardProps = {
  eventId: string;
  eventStartsAt: string;
  crewRows: DealCrewRow[];
  /** Live gear items from ops.event_gear_items (not the frozen JSONB snapshot). */
  gearItems: EventGearItem[];
  /** Pass 3 Phase 4: wrap state from ops.events.archived_at. */
  archivedAt: string | null;
};

// =============================================================================
// Condition dot colors
// =============================================================================

const CONDITION_COLORS: Record<GearCondition, string> = {
  good: 'var(--color-unusonic-success)',
  damaged: 'var(--color-unusonic-error)',
  missing: 'var(--color-unusonic-warning)',
  quarantined: 'var(--color-unusonic-error)',
};

// =============================================================================
// Component
// =============================================================================

export function WrapReportCard({
  eventId,
  eventStartsAt,
  crewRows,
  gearItems,
  archivedAt,
}: WrapReportCardProps) {
  // Only render if event is in the past
  const isPast = new Date(eventStartsAt) < new Date();
  if (!isPast) return null;

  return <WrapReportInner eventId={eventId} crewRows={crewRows} gearItems={gearItems} archivedAt={archivedAt} />;
}

function WrapReportInner({
  eventId,
  crewRows,
  gearItems,
  archivedAt,
}: Omit<WrapReportCardProps, 'eventStartsAt'>) {
  const [mode, setMode] = useState<'loading' | 'empty' | 'edit' | 'view'>('loading');
  const [report, setReport] = useState<WrapReport | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load existing wrap report on mount
  useEffect(() => {
    let cancelled = false;
    getWrapReport(eventId).then((r) => {
      if (cancelled) return;
      if (r) {
        setReport(r);
        setMode('view');
      } else {
        setMode('empty');
      }
    });
    return () => { cancelled = true; };
  }, [eventId]);

  const handleStart = async () => {
    const prefilled = prefillWrapReport(
      eventId,
      crewRows.map((r) => ({
        entity_id: r.entity_id,
        entity_name: r.entity_name,
        role_note: r.role_note,
        call_time: r.call_time,
      })),
      gearItems
    );
    setReport(await prefilled);
    setMode('edit');
  };

  const handleSave = () => {
    if (!report) return;
    startTransition(async () => {
      const result = await saveWrapReport(eventId, report);
      if (result.success) {
        // Re-fetch to get server-stamped completed_at/completed_by
        const saved = await getWrapReport(eventId);
        if (saved) setReport(saved);
        setMode('view');
        toast.success('Wrap report saved');
      } else {
        toast.error(result.error ?? 'Failed to save wrap report');
      }
    });
  };

  // Pass 3 Phase 4 — the deliberate close-out moment. Confirms (PMs have
  // 72h to undo) and stamps archived_at via markShowWrapped. No checklist
  // gate (User Advocate: "mandatory checklist gate is the worst way to
  // solve this"). Single confirm dialog, short factual message.
  const [confirmingWrap, setConfirmingWrap] = useState(false);

  const handleWrap = () => {
    setConfirmingWrap(true);
  };

  const handleConfirmWrap = () => {
    setConfirmingWrap(false);
    startTransition(async () => {
      const result = await markShowWrapped(eventId);
      if (result.success) {
        toast.success('Show wrapped', {
          description: 'You can undo from here for the next 72 hours.',
        });
      } else {
        toast.error(result.error ?? 'Failed to wrap show');
      }
    });
  };

  const handleUndoWrap = () => {
    startTransition(async () => {
      const result = await undoMarkShowWrapped(eventId);
      if (result.success) {
        toast.success('Wrap undone');
      } else {
        toast.error(result.error ?? 'Failed to undo wrap');
      }
    });
  };

  // "Can we still undo this wrap?" — User Advocate's 72-hour window.
  const isWrapped = archivedAt !== null;
  const isUndoAvailable = (() => {
    if (!archivedAt) return false;
    const ms = Date.parse(archivedAt);
    if (Number.isNaN(ms)) return false;
    return Date.now() - ms < 72 * 60 * 60 * 1000;
  })();

  if (mode === 'loading') return null;

  return (
    <StagePanel id="wrap-report" elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'empty' && (
          <EmptyState key="empty" onStart={handleStart} />
        )}
        {mode === 'edit' && report && (
          <EditState
            key="edit"
            report={report}
            onChange={setReport}
            onSave={handleSave}
            onCancel={() => {
              // If we had a saved report, go back to view; otherwise back to empty
              if (report.completed_at) {
                setMode('view');
              } else {
                setMode('empty');
              }
            }}
            saving={isPending}
            hasGear={gearItems.length > 0}
          />
        )}
        {mode === 'view' && report && (
          <ViewState key="view" report={report} onEdit={() => setMode('edit')} hasGear={gearItems.length > 0} />
        )}
      </AnimatePresence>

      {/* Pass 3 Phase 4 — Wrap show action strip. Only visible when the
          wrap report has been saved (mode === 'view'). PMs edit first,
          wrap second. */}
      {mode === 'view' && (
        <div
          className="flex items-center justify-between gap-3 pt-3 mt-3"
          style={{ borderTop: '1px solid oklch(1 0 0 / 0.06)' }}
        >
          <div className="min-w-0 flex-1">
            {isWrapped ? (
              <p className="text-xs text-[var(--stage-text-secondary)] tracking-tight truncate">
                Wrapped {archivedAt ? new Date(archivedAt).toLocaleDateString() : ''}
                {isUndoAvailable && ' — undo available for 72 hours'}
              </p>
            ) : (
              <p className="text-xs text-[var(--stage-text-secondary)] tracking-tight">
                Ready to close out?
              </p>
            )}
          </div>
          {isWrapped && isUndoAvailable ? (
            <button
              type="button"
              onClick={handleUndoWrap}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[22px] text-xs font-medium tracking-tight border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)] transition-colors stage-hover overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
            >
              Undo wrap
            </button>
          ) : !isWrapped ? (
            confirmingWrap ? (
              <div className="flex items-center gap-2">
                <span className="stage-label">It will leave your active pile. 72 hours to undo.</span>
                <button className="stage-btn stage-btn-primary text-sm px-3 py-1.5" onClick={handleConfirmWrap} disabled={isPending}>Wrap show</button>
                <button className="stage-btn stage-btn-secondary text-sm px-3 py-1.5" onClick={() => setConfirmingWrap(false)}>Cancel</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleWrap}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[22px] text-xs font-medium tracking-tight border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)] transition-colors stage-hover overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
              >
                {isPending ? 'Wrapping\u2026' : 'Wrap show'}
              </button>
            )
          ) : null}
        </div>
      )}
    </StagePanel>
  );
}

// =============================================================================
// Empty state
// =============================================================================

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={STAGE_LIGHT}
      className="flex items-start"
      style={{ gap: 'var(--stage-gap-wide, 12px)' }}
    >
      <div
        className="p-3 stage-panel-nested shrink-0"
        style={{ borderRadius: 'var(--stage-radius-nested, 8px)' }}
      >
        <ClipboardCheck size={24} className="text-[var(--stage-text-tertiary)]" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="stage-label">
          Show complete
        </p>
        <p
          className="text-sm tracking-tight leading-relaxed"
          style={{
            color: 'var(--stage-text-secondary)',
            marginTop: 'var(--stage-gap, 6px)',
          }}
        >
          Capture actual crew hours, gear condition, and venue notes
        </p>
        <button
          type="button"
          onClick={onStart}
          className="stage-btn stage-btn-secondary mt-3 px-4 py-1.5 text-xs"
        >
          Start wrap report
        </button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// Edit state
// =============================================================================

function EditState({
  report,
  onChange,
  onSave,
  onCancel,
  saving,
  hasGear,
}: {
  report: WrapReport;
  onChange: (r: WrapReport) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  hasGear: boolean;
}) {
  const updateCrewEntry = (idx: number, patch: Partial<WrapCrewEntry>) => {
    const updated = [...report.actual_crew_hours];
    updated[idx] = { ...updated[idx], ...patch };
    onChange({ ...report, actual_crew_hours: updated });
  };

  const updateGearEntry = (idx: number, patch: Partial<WrapGearEntry>) => {
    const updated = [...report.gear_condition_notes];
    updated[idx] = { ...updated[idx], ...patch };
    onChange({ ...report, gear_condition_notes: updated });
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col"
      style={{ gap: 'var(--stage-gap-wide, 12px)' }}
    >
      {/* Header */}
      <div className="flex items-center" style={{ gap: 'var(--stage-gap, 6px)' }}>
        <ClipboardCheck size={18} className="text-[var(--stage-text-secondary)]" aria-hidden />
        <h3 className="stage-label">
          Wrap report
        </h3>
      </div>

      {/* Section: Crew hours */}
      {report.actual_crew_hours.length > 0 && (
        <div>
          <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}>
            Crew hours
          </p>
          <div
            className="border border-[oklch(1_0_0_/_0.06)] overflow-hidden"
            style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
          >
            {/* Table header */}
            <div
              className="grid grid-cols-[1fr_0.7fr_64px_64px_80px] px-3 py-2 text-xs tracking-tight font-medium"
              style={{
                color: 'var(--stage-text-tertiary)',
                backgroundColor: 'var(--ctx-well, var(--stage-surface))',
                borderBottom: '1px solid oklch(1 0 0 / 0.06)',
              }}
            >
              <span>Name</span>
              <span>Role</span>
              <span className="text-right tabular-nums">Planned</span>
              <span className="text-right tabular-nums">Actual</span>
              <span className="text-center">Rating</span>
            </div>
            {/* Rows */}
            {report.actual_crew_hours.map((entry, idx) => (
              <div
                key={entry.entity_id ?? `crew-${idx}`}
                className="flex flex-col"
                style={{
                  borderBottom: idx < report.actual_crew_hours.length - 1 ? '1px solid oklch(1 0 0 / 0.04)' : undefined,
                }}
              >
                <div
                  className="grid grid-cols-[1fr_0.7fr_64px_64px_80px] px-3 py-2 items-center text-sm tracking-tight"
                  style={{ color: 'var(--stage-text-primary)' }}
                >
                  <span className="truncate">{entry.name}</span>
                  <span className="truncate text-[var(--stage-text-secondary)]">
                    {entry.role ?? '\u2014'}
                  </span>
                  <span className="text-right tabular-nums text-[var(--stage-text-tertiary)]">
                    {entry.planned_hours != null ? `${entry.planned_hours}h` : '\u2014'}
                  </span>
                  <div className="flex justify-end">
                    <input
                      type="number"
                      min={0}
                      max={999}
                      step={0.5}
                      value={entry.actual_hours ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : parseFloat(e.target.value);
                        updateCrewEntry(idx, { actual_hours: val });
                      }}
                      placeholder="\u2014"
                      className="w-14 text-right tabular-nums bg-[var(--ctx-well,var(--stage-surface))] border border-[oklch(1_0_0_/_0.08)] px-2 py-1 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:border-[var(--stage-accent)]"
                      style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                    />
                  </div>
                  <div className="flex justify-center">
                    <StarRating
                      value={entry.rating ?? null}
                      onChange={(r) => updateCrewEntry(idx, { rating: r })}
                    />
                  </div>
                </div>
                {/* Crew note — expands below the row when rating is set */}
                {entry.rating != null && (
                  <div className="px-3 pb-2">
                    <input
                      type="text"
                      value={entry.crew_note ?? ''}
                      onChange={(e) => updateCrewEntry(idx, { crew_note: e.target.value || null })}
                      placeholder="Note about this crew member..."
                      className="w-full bg-[var(--ctx-well,var(--stage-surface))] border border-[oklch(1_0_0_/_0.08)] px-2.5 py-1 text-xs text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:border-[var(--stage-accent)] tracking-tight"
                      style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section: Gear condition */}
      {hasGear && report.gear_condition_notes.length > 0 && (
        <div>
          <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}>
            Gear condition
          </p>
          <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 6px)' }}>
            {report.gear_condition_notes.map((entry, idx) => (
              <div
                key={entry.item_id}
                className="flex flex-col"
                style={{ gap: 'var(--stage-gap, 6px)' }}
              >
                <div className="flex items-center" style={{ gap: 'var(--stage-gap, 6px)' }}>
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: CONDITION_COLORS[entry.condition] }}
                  />
                  <span className="flex-1 min-w-0 truncate text-sm text-[var(--stage-text-primary)] tracking-tight">
                    {entry.name}
                  </span>
                  <ConditionDropdown
                    value={entry.condition}
                    onChange={(c) => {
                      updateGearEntry(idx, {
                        condition: c,
                        notes: c === 'good' ? null : entry.notes,
                      });
                    }}
                  />
                </div>
                {entry.condition !== 'good' && (
                  <input
                    type="text"
                    value={entry.notes ?? ''}
                    onChange={(e) => updateGearEntry(idx, { notes: e.target.value || null })}
                    placeholder="Describe the issue..."
                    className="w-full bg-[var(--ctx-well,var(--stage-surface))] border border-[oklch(1_0_0_/_0.08)] px-3 py-1.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:border-[var(--stage-accent)] tracking-tight"
                    style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasGear && (
        <div>
          <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}>
            Gear condition
          </p>
          <p className="text-sm text-[var(--stage-text-tertiary)] tracking-tight">
            No gear tracked for this show
          </p>
        </div>
      )}

      {/* Section: Venue notes */}
      <div>
        <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}>
          Venue notes
        </p>
        <textarea
          value={report.venue_notes ?? ''}
          onChange={(e) => onChange({ ...report, venue_notes: e.target.value || null })}
          placeholder="Observations about the venue for future shows..."
          rows={2}
          maxLength={2000}
          className="w-full bg-[var(--ctx-well,var(--stage-surface))] border border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:border-[var(--stage-accent)] resize-none tracking-tight"
          style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
        />
      </div>

      {/* Section: Client feedback */}
      <div>
        <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}>
          Client feedback
        </p>
        <textarea
          value={report.client_feedback ?? ''}
          onChange={(e) => onChange({ ...report, client_feedback: e.target.value || null })}
          placeholder="How was the client experience?"
          rows={2}
          maxLength={2000}
          className="w-full bg-[var(--ctx-well,var(--stage-surface))] border border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:border-[var(--stage-accent)] resize-none tracking-tight"
          style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
        />
      </div>

      {/* Actions */}
      <div
        className="flex items-center"
        style={{ gap: 'var(--stage-gap, 6px)', paddingTop: 'var(--stage-gap, 6px)', borderTop: '1px solid var(--stage-edge-subtle)' }}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="stage-btn stage-btn-secondary px-4 py-1.5 text-xs disabled:opacity-45"
        >
          {saving ? 'Saving...' : 'Complete wrap report'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none px-2 py-1.5"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// View state (read-only)
// =============================================================================

function ViewState({
  report,
  onEdit,
  hasGear,
}: {
  report: WrapReport;
  onEdit: () => void;
  hasGear: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={STAGE_LIGHT}
      className="flex flex-col"
      style={{ gap: 'var(--stage-gap-wide, 12px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: 'var(--stage-gap, 6px)' }}>
          <ClipboardCheck size={18} className="text-[var(--color-unusonic-success)]" aria-hidden />
          <h3 className="stage-label">
            Wrap report
          </h3>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
        >
          <Pencil size={12} aria-hidden />
          Edit
        </button>
      </div>

      {/* Completion stamp */}
      {report.completed_at && (
        <p className="text-xs text-[var(--stage-text-tertiary)] tracking-tight">
          Completed by {report.completed_by ?? 'Unknown'} on{' '}
          {new Date(report.completed_at).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}

      {/* Crew hours */}
      {report.actual_crew_hours.length > 0 && (
        <div>
          <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}>
            Crew hours
          </p>
          <div
            className="border border-[oklch(1_0_0_/_0.06)] overflow-hidden"
            style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
          >
            <div
              className="grid grid-cols-[1fr_0.7fr_64px_64px_80px] px-3 py-2 text-xs tracking-tight font-medium"
              style={{
                color: 'var(--stage-text-tertiary)',
                backgroundColor: 'var(--ctx-well, var(--stage-surface))',
                borderBottom: '1px solid oklch(1 0 0 / 0.06)',
              }}
            >
              <span>Name</span>
              <span>Role</span>
              <span className="text-right tabular-nums">Planned</span>
              <span className="text-right tabular-nums">Actual</span>
              <span className="text-center">Rating</span>
            </div>
            {report.actual_crew_hours.map((entry, idx) => (
              <div
                key={entry.entity_id ?? `crew-${idx}`}
                className="flex flex-col"
                style={{
                  borderBottom: idx < report.actual_crew_hours.length - 1 ? '1px solid oklch(1 0 0 / 0.04)' : undefined,
                }}
              >
                <div
                  className="grid grid-cols-[1fr_0.7fr_64px_64px_80px] px-3 py-2 text-sm tracking-tight"
                  style={{ color: 'var(--stage-text-primary)' }}
                >
                  <span className="truncate">{entry.name}</span>
                  <span className="truncate text-[var(--stage-text-secondary)]">
                    {entry.role ?? '\u2014'}
                  </span>
                  <span className="text-right tabular-nums text-[var(--stage-text-tertiary)]">
                    {entry.planned_hours != null ? `${entry.planned_hours}h` : '\u2014'}
                  </span>
                  <span className="text-right tabular-nums">
                    {entry.actual_hours != null ? `${entry.actual_hours}h` : '\u2014'}
                  </span>
                  <div className="flex justify-center">
                    <StarRating value={entry.rating ?? null} readOnly />
                  </div>
                </div>
                {entry.crew_note && (
                  <p className="px-3 pb-2 text-xs text-[var(--stage-text-secondary)] tracking-tight">
                    {entry.crew_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gear condition */}
      {hasGear && report.gear_condition_notes.length > 0 && (
        <div>
          <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}>
            Gear condition
          </p>
          <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 6px)' }}>
            {report.gear_condition_notes.map((entry) => (
              <div key={entry.item_id} className="flex flex-col" style={{ gap: 2 }}>
                <div className="flex items-center" style={{ gap: 'var(--stage-gap, 6px)' }}>
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: CONDITION_COLORS[entry.condition] }}
                  />
                  <span className="text-sm text-[var(--stage-text-primary)] tracking-tight">
                    {entry.name}
                  </span>
                  <span className="text-xs text-[var(--stage-text-tertiary)]">
                    {GEAR_CONDITIONS.find((c) => c.value === entry.condition)?.label}
                  </span>
                </div>
                {entry.notes && (
                  <p className="text-xs text-[var(--stage-text-secondary)] tracking-tight ml-4">
                    {entry.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Venue notes */}
      {report.venue_notes && (
        <div>
          <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}>
            Venue notes
          </p>
          <p className="text-sm text-[var(--stage-text-primary)] tracking-tight whitespace-pre-wrap">
            {report.venue_notes}
          </p>
        </div>
      )}

      {/* Client feedback */}
      {report.client_feedback && (
        <div>
          <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}>
            Client feedback
          </p>
          <p className="text-sm text-[var(--stage-text-primary)] tracking-tight whitespace-pre-wrap">
            {report.client_feedback}
          </p>
        </div>
      )}
    </motion.div>
  );
}

// =============================================================================
// Condition dropdown (inline select)
// =============================================================================

function ConditionDropdown({
  value,
  onChange,
}: {
  value: GearCondition;
  onChange: (c: GearCondition) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = GEAR_CONDITIONS.find((c) => c.value === value)?.label ?? value;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs tracking-tight border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well,var(--stage-surface))] text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors"
        style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
      >
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: CONDITION_COLORS[value] }}
        />
        {label}
        <ChevronDown size={12} className="text-[var(--stage-text-tertiary)]" aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={STAGE_LIGHT}
              className="absolute right-0 top-full mt-1 z-50 min-w-[140px] py-1 border border-[oklch(1_0_0_/_0.08)] shadow-lg"
              style={{
                borderRadius: 'var(--stage-radius-input, 6px)',
                backgroundColor: 'var(--ctx-dropdown, var(--stage-elevated))',
              }}
            >
              {GEAR_CONDITIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    onChange(c.value);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs tracking-tight text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors text-left"
                >
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: CONDITION_COLORS[c.value] }}
                  />
                  {c.label}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// Star rating (1-5)
// =============================================================================

function StarRating({
  value,
  onChange,
  readOnly,
}: {
  value: CrewRating | null;
  onChange?: (r: CrewRating | null) => void;
  readOnly?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div
      className="flex items-center"
      style={{ gap: '1px' }}
      onMouseLeave={() => !readOnly && setHover(null)}
    >
      {([1, 2, 3, 4, 5] as const).map((star) => {
        const filled = hover != null ? star <= hover : value != null && star <= value;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHover(star)}
            onClick={() => {
              if (readOnly || !onChange) return;
              // Toggle off if clicking the same value
              onChange(value === star ? null : star);
            }}
            className="p-0 focus:outline-none disabled:cursor-default transition-colors"
            aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          >
            <svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill={filled ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={1.5}
              style={{
                color: filled
                  ? 'var(--color-unusonic-warning)' // warm gold
                  : 'var(--stage-text-tertiary)',
              }}
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
