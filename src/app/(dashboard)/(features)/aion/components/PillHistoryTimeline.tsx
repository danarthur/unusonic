'use client';

/**
 * Pill-history Sheet timeline — Wk 10 D7.
 *
 * Renders the reverse-chronological row groups (Today / Yesterday / N days ago)
 * with the per-row useful/not-useful feedback chips. Extracted from
 * PillHistorySheet to keep that file under the file-length lint cap; pure
 * presentation concern.
 */

import * as React from 'react';
import { AlertCircle, DollarSign, Eye, Clock } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type {
  PillHistoryRow,
  PillFeedback,
} from '../actions/pill-history-actions';

const SIGNAL_ICON = {
  money_event: DollarSign,
  proposal_engagement: Eye,
  dead_silence: Clock,
} as const;

interface TimelineProps {
  rows: PillHistoryRow[];
  onFeedback: (lineId: string, feedback: PillFeedback) => void;
  archived?: boolean;
}

export function Timeline({ rows, onFeedback, archived = false }: TimelineProps) {
  const groups = React.useMemo(() => groupByDate(rows), [rows]);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.dateKey} className="space-y-1.5">
          <div
            className="text-[0.72rem] uppercase tracking-wide text-[var(--stage-text-tertiary)]"
          >
            {formatGroupHeader(group.dateKey)}
          </div>
          {group.rows.map((row) => (
            <HistoryRow
              key={row.id}
              row={row}
              onFeedback={onFeedback}
              archived={archived}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function HistoryRow({
  row,
  onFeedback,
  archived,
}: {
  row: PillHistoryRow;
  onFeedback: (lineId: string, feedback: PillFeedback) => void;
  archived?: boolean;
}) {
  const Icon = SIGNAL_ICON[row.signal_type] ?? AlertCircle;
  const isDismissed = row.dismissed_at !== null;
  const dimmed = isDismissed || archived;
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-[6px] px-2 py-1.5',
        'border border-transparent',
        'hover:border-[var(--stage-edge-subtle)]',
        'transition-colors duration-[80ms]',
        dimmed && 'opacity-55',
      )}
      data-testid="pill-history-row"
      data-dismissed={isDismissed ? 'true' : 'false'}
    >
      <Icon
        size={14}
        strokeWidth={1.5}
        aria-hidden
        className="mt-0.5 shrink-0 text-[var(--stage-text-tertiary)]"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[0.88rem] text-[var(--stage-text-primary)]">
            {row.headline}
          </p>
          {isDismissed && (
            <span
              className={cn(
                'shrink-0 text-[0.66rem] uppercase tracking-wide',
                'text-[var(--stage-text-tertiary)]',
              )}
              aria-label="Dismissed"
            >
              Dismissed
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[0.72rem] text-[var(--stage-text-tertiary)]">
          <FeedbackChips
            lineId={row.id}
            feedback={row.user_feedback}
            onFeedback={onFeedback}
          />
        </div>
      </div>
    </div>
  );
}

function FeedbackChips({
  lineId,
  feedback,
  onFeedback,
}: {
  lineId: string;
  feedback: PillFeedback | null;
  onFeedback: (lineId: string, feedback: PillFeedback) => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <FeedbackChip
        label="Useful"
        active={feedback === 'useful'}
        onClick={() => onFeedback(lineId, 'useful')}
      />
      <FeedbackChip
        label="Not useful"
        active={feedback === 'not_useful'}
        onClick={() => onFeedback(lineId, 'not_useful')}
      />
    </span>
  );
}

function FeedbackChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-[4px] px-1.5 py-0.5',
        'transition-colors duration-[80ms]',
        active
          ? 'text-[var(--stage-text-primary)] bg-[oklch(1_0_0_/_0.06)]'
          : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.04)]',
      )}
    >
      {label}
    </button>
  );
}

function groupByDate(
  rows: PillHistoryRow[],
): Array<{ dateKey: string; rows: PillHistoryRow[] }> {
  const map = new Map<string, PillHistoryRow[]>();
  for (const row of rows) {
    const key = row.created_at.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dateKey, groupRows]) => ({ dateKey, rows: groupRows }));
}

function formatGroupHeader(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  const monthDay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (days <= 0) return `Today · ${monthDay}`;
  if (days === 1) return `Yesterday · ${monthDay}`;
  return `${monthDay} · ${days}d ago`;
}
