'use client';

/**
 * Deal Lens Timeline renderer.
 *
 * Extracted from deal-lens.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Reads from `ops.deal_timeline_v` (unions deal_activity_log + follow_up_log).
 * Read-only: activity rows come from the Phase 3c dispatcher, follow-up rows
 * come from the follow-up engine. Collapses to 10 rows; "Show more" reveals
 * the rest of the fetched slice.
 *
 * Owns:
 *   - DealActivitySection — the section wrapper with collapse/expand.
 *   - DealActivityRow — a single timeline row (action + actor + relative time).
 *   - formatTimelineSummary / formatActorLabel / formatAbsoluteDateTime —
 *     row-rendering helpers.
 */

import type { DealTimelineEntry } from '../../actions/get-deal-timeline';
import { formatRelTime } from '@/shared/lib/format-currency';

const ACTIVITY_COLLAPSED_CAP = 10;

// Maps follow_up_log.action_type → user-facing verb. Mirrors the labels the
// old FollowUpActionLog used so existing rows read identically here.
const FOLLOW_UP_ACTION_LABELS: Record<string, string> = {
  email_sent: 'Sent email',
  sms_sent: 'Sent text message',
  call_logged: 'Logged phone call',
  snoozed: 'Snoozed follow-up',
  dismissed: 'Marked as handled',
  note_added: 'Added note',
  system_queued: 'System flagged for follow-up',
  system_removed: 'System cleared follow-up',
};

const CHANNEL_LABELS: Record<string, string> = {
  phone: 'Phone',
  call: 'Phone',
  sms: 'Text',
  email: 'Email',
  system: 'System',
  manual: 'Manual',
};

function formatTimelineSummary(entry: DealTimelineEntry): string {
  if (entry.source === 'follow_up' && entry.actionType) {
    return FOLLOW_UP_ACTION_LABELS[entry.actionType] ?? entry.actionSummary;
  }
  return entry.actionSummary;
}

export function DealActivitySection({
  entries,
  expanded,
  onToggleExpanded,
}: {
  entries: DealTimelineEntry[] | null;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  // Silent loading: returning null while we wait avoids the "Loading…" text
  // flash that read as a wave. The section just appears when ready.
  if (entries === null) return null;

  if (entries.length === 0) {
    return (
      <p
        className="text-sm"
        style={{ color: 'var(--stage-text-tertiary)' }}
      >
        Nothing yet
      </p>
    );
  }

  const visible = expanded ? entries : entries.slice(0, ACTIVITY_COLLAPSED_CAP);
  const hiddenCount = entries.length - visible.length;

  return (
    <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 6px)' }}>
      {visible.map((entry) => (
        <DealActivityRow key={`${entry.source}:${entry.id}`} entry={entry} />
      ))}
      {(hiddenCount > 0 || (expanded && entries.length > ACTIVITY_COLLAPSED_CAP)) && (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="self-start text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded"
          style={{
            color: 'var(--stage-text-tertiary)',
            marginTop: 'var(--stage-gap, 6px)',
          }}
        >
          {expanded ? 'Show less' : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}

function formatActorLabel(entry: DealTimelineEntry): string {
  if (entry.actorKind === 'user') return entry.actorName ?? 'Teammate';
  if (entry.actorKind === 'aion') return 'Aion';
  if (entry.actorKind === 'client') return 'Client';
  if (entry.actorKind === 'webhook') return 'Webhook';
  return 'System';
}

function formatAbsoluteDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function DealActivityRow({ entry }: { entry: DealTimelineEntry }) {
  const isFailed = entry.status === 'failed';
  const isUndone = entry.status === 'undone';
  const isPending = entry.status === 'pending';
  const channelLabel = entry.channel ? CHANNEL_LABELS[entry.channel] ?? null : null;
  const actorLabel = formatActorLabel(entry);
  const absoluteTime = formatAbsoluteDateTime(entry.createdAt);
  return (
    <div className="flex items-baseline justify-between gap-3 min-w-0">
      <div className="min-w-0 flex-1 flex items-baseline gap-2">
        <p
          className="text-sm tracking-tight leading-tight truncate"
          style={{
            color: 'var(--stage-text-primary)',
            textDecoration: isUndone ? 'line-through' : undefined,
            opacity: isUndone ? 0.7 : 1,
          }}
        >
          {formatTimelineSummary(entry)}
          <span
            className="ml-2 text-xs"
            style={{ color: 'var(--stage-text-tertiary)' }}
          >
            · {actorLabel}
          </span>
          {isPending && (
            <span
              className="ml-2 text-xs"
              style={{ color: 'var(--stage-text-tertiary)' }}
            >
              pending
            </span>
          )}
        </p>
        {channelLabel && (
          <span
            className="stage-badge-text shrink-0 tabular-nums"
            style={{
              color: 'var(--stage-text-tertiary)',
              background: 'oklch(1 0 0 / 0.06)',
              borderRadius: 'var(--stage-radius-pill)',
              padding: '1px 6px',
            }}
          >
            {channelLabel}
          </span>
        )}
        {isFailed && entry.errorMessage && (
          <p
            className="text-xs leading-tight mt-0.5 break-words"
            style={{ color: 'var(--color-unusonic-error)' }}
          >
            {entry.errorMessage}
          </p>
        )}
      </div>
      <p
        className="stage-label shrink-0 tabular-nums cursor-help"
        style={{ color: 'var(--stage-text-tertiary)' }}
        title={absoluteTime}
      >
        {formatRelTime(entry.createdAt)}
      </p>
    </div>
  );
}
