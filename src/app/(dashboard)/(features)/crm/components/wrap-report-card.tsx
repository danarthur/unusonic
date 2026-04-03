'use client';

import { useState, useEffect, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';
import { toast } from 'sonner';
import { ClipboardCheck, ChevronDown, Pencil } from 'lucide-react';
import type { DealCrewRow } from '../actions/deal-crew';
import type {
  WrapReport,
  WrapCrewEntry,
  WrapGearEntry,
  GearCondition,
} from '../lib/wrap-report-types';
import { GEAR_CONDITIONS } from '../lib/wrap-report-types';
import { getWrapReport, saveWrapReport, prefillWrapReport } from '../actions/wrap-report';

// =============================================================================
// Props
// =============================================================================

type WrapReportCardProps = {
  eventId: string;
  eventStartsAt: string;
  crewRows: DealCrewRow[];
  gearItems: { id: string; name: string; status: string }[];
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
}: WrapReportCardProps) {
  // Only render if event is in the past
  const isPast = new Date(eventStartsAt) < new Date();
  if (!isPast) return null;

  return <WrapReportInner eventId={eventId} crewRows={crewRows} gearItems={gearItems} />;
}

function WrapReportInner({
  eventId,
  crewRows,
  gearItems,
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

  if (mode === 'loading') return null;

  return (
    <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
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
        <p
          className="stage-readout tracking-tight leading-none"
          style={{ color: 'var(--stage-text-primary)' }}
        >
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
        <h3
          className="stage-readout tracking-tight leading-none"
          style={{ color: 'var(--stage-text-primary)' }}
        >
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
              className="grid grid-cols-[1fr_0.8fr_80px_80px] px-3 py-2 text-xs tracking-tight font-medium"
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
            </div>
            {/* Rows */}
            {report.actual_crew_hours.map((entry, idx) => (
              <div
                key={entry.entity_id ?? `crew-${idx}`}
                className="grid grid-cols-[1fr_0.8fr_80px_80px] px-3 py-2 items-center text-sm tracking-tight"
                style={{
                  color: 'var(--stage-text-primary)',
                  borderBottom: idx < report.actual_crew_hours.length - 1 ? '1px solid oklch(1 0 0 / 0.04)' : undefined,
                }}
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
                    className="w-16 text-right tabular-nums bg-[var(--ctx-well,var(--stage-surface))] border border-[oklch(1_0_0_/_0.08)] px-2 py-1 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)] focus:border-[oklch(1_0_0_/_0.20)]"
                    style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  />
                </div>
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
                    className="w-full bg-[var(--ctx-well,var(--stage-surface))] border border-[oklch(1_0_0_/_0.08)] px-3 py-1.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)] focus:border-[oklch(1_0_0_/_0.20)] tracking-tight"
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
          className="w-full bg-[var(--ctx-well,var(--stage-surface))] border border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)] focus:border-[oklch(1_0_0_/_0.20)] resize-none tracking-tight"
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
          className="w-full bg-[var(--ctx-well,var(--stage-surface))] border border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)] focus:border-[oklch(1_0_0_/_0.20)] resize-none tracking-tight"
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
          className="stage-btn stage-btn-secondary px-4 py-1.5 text-xs disabled:opacity-40"
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
          <h3
            className="stage-readout tracking-tight leading-none"
            style={{ color: 'var(--stage-text-primary)' }}
          >
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
              className="grid grid-cols-[1fr_0.8fr_80px_80px] px-3 py-2 text-xs tracking-tight font-medium"
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
            </div>
            {report.actual_crew_hours.map((entry, idx) => (
              <div
                key={entry.entity_id ?? `crew-${idx}`}
                className="grid grid-cols-[1fr_0.8fr_80px_80px] px-3 py-2 text-sm tracking-tight"
                style={{
                  color: 'var(--stage-text-primary)',
                  borderBottom: idx < report.actual_crew_hours.length - 1 ? '1px solid oklch(1 0 0 / 0.04)' : undefined,
                }}
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
        className="flex items-center gap-1.5 px-2 py-1 text-xs tracking-tight border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well,var(--stage-surface))] text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)] transition-colors"
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
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs tracking-tight text-[var(--stage-text-primary)] hover:bg-[var(--ctx-well-hover,oklch(1_0_0_/_0.04))] transition-colors text-left"
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
