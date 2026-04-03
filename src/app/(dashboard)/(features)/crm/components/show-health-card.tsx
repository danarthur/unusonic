'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';
import { formatRelTime } from '@/shared/lib/format-currency';
import { toast } from 'sonner';
import { updateDealScalars } from '../actions/update-deal-scalars';

type ShowHealthStatus = 'on_track' | 'at_risk' | 'blocked';

type ShowHealthCardProps = {
  dealId: string;
  health: {
    status: ShowHealthStatus;
    note: string;
    updated_at: string;
    updated_by_name: string;
  } | null;
  onSaved?: () => void;
  /** When true, renders without its own StagePanel wrapper (for nesting inside another panel). */
  inline?: boolean;
};

const STATUS_CONFIG: Record<ShowHealthStatus, { label: string; color: string }> = {
  on_track: { label: 'On track', color: 'var(--color-unusonic-success)' },
  at_risk: { label: 'At risk', color: 'var(--color-unusonic-warning)' },
  blocked: { label: 'Blocked', color: 'var(--color-unusonic-error)' },
};

export function ShowHealthCard({ dealId, health, onSaved, inline }: ShowHealthCardProps) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<ShowHealthStatus>(health?.status ?? 'on_track');
  const [note, setNote] = useState(health?.note ?? '');
  const [isPending, startTransition] = useTransition();

  const handleEdit = () => {
    setStatus(health?.status ?? 'on_track');
    setNote(health?.note ?? '');
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateDealScalars(dealId, {
        show_health: {
          status,
          note,
          updated_at: new Date().toISOString(),
          updated_by_name: 'PM',
        },
      });
      if (result.success) {
        setEditing(false);
        onSaved?.();
      } else {
        toast.error(result.error ?? 'Failed to save');
      }
    });
  };

  const cfg = health ? STATUS_CONFIG[health.status] : null;

  const inner = (
      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_MEDIUM}
          >
            {/* Status pills */}
            <div className="flex items-center gap-2 mb-3">
              {(Object.entries(STATUS_CONFIG) as [ShowHealthStatus, { label: string; color: string }][]).map(
                ([key, { label, color }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatus(key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium tracking-tight transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]"
                    style={{
                      borderRadius: 'var(--stage-radius-input, 6px)',
                      color: status === key ? color : 'var(--stage-text-tertiary)',
                      backgroundColor:
                        status === key
                          ? `color-mix(in oklch, ${color} 12%, transparent)`
                          : 'var(--stage-surface)',
                      border: `1px solid ${status === key ? `color-mix(in oklch, ${color} 30%, transparent)` : 'oklch(1 0 0 / 0.06)'}`,
                    }}
                  >
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {label}
                  </button>
                ),
              )}
            </div>

            {/* Note textarea */}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Brief status update..."
              maxLength={500}
              rows={2}
              className="w-full bg-[var(--ctx-well,var(--stage-surface))] border border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)] focus:border-[oklch(1_0_0_/_0.20)] resize-none tracking-tight"
              style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
            />

            {/* Actions */}
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="stage-btn stage-btn-secondary px-3 py-1 text-xs disabled:opacity-40"
              >
                {isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none px-2 py-1"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="read"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STAGE_LIGHT}
          >
            {health && cfg ? (
              <div
                role="button"
                tabIndex={0}
                onClick={handleEdit}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleEdit(); }}
                className="flex items-center gap-3 cursor-pointer group"
              >
                {/* Dot + label */}
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cfg.color }}
                  />
                  <span className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight">
                    {cfg.label}
                  </span>
                </div>

                {/* Note */}
                {health.note && (
                  <span className="flex-1 min-w-0 text-sm text-[var(--stage-text-secondary)] truncate tracking-tight">
                    {health.note}
                  </span>
                )}

                {/* Relative time */}
                <span className="shrink-0 text-xs text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-secondary)] transition-colors">
                  {formatRelTime(health.updated_at)}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--stage-text-tertiary)] tracking-tight">
                  No status set
                </span>
                <button
                  type="button"
                  onClick={handleEdit}
                  className="text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
                >
                  Set status
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
  );

  if (inline) return inner;
  return <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>{inner}</StagePanel>;
}
