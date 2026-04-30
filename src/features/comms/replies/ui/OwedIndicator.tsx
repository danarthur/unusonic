/**
 * OwedIndicator — the single "what do I owe" line at the top of the card.
 *
 * Replaces the v1 filter row (which Marcus explicitly rejected). One of:
 *
 *   "Caught up · last reply Tue 4:12pm"
 *   "Owed · Ally Chen asked about the smoke permit (Wed 10:47pm)"
 *   "2 owed · Ally (smoke permit) · Pramila (final headcount)"
 *
 * Derived from the per-thread `isOwed` flag computed in get-deal-replies
 * (heuristic + manual override via Fork C).
 *
 * See docs/reference/replies-card-v2-design.md §1.
 *
 * @module features/comms/replies/ui/OwedIndicator
 */

import { CheckCircle2, AlertCircle } from 'lucide-react';
import { formatRelTime } from '@/shared/lib/format-currency';
import type { ReplyThread } from '../api/get-deal-replies';

export type OwedIndicatorProps = {
  threads: ReplyThread[];
};

function firstInboundSubjectFragment(thread: ReplyThread): string {
  // Try: thread subject (minus "Re:" prefix), falling back to latestPreview
  // first clause, falling back to participant name.
  const subj = thread.subject?.replace(/^\s*(Re|Fwd|Fw):\s*/i, '').trim();
  if (subj) return subj;
  if (thread.latestPreview) {
    const first = thread.latestPreview.split(/[.!?]/)[0];
    if (first && first.length < 60) return first.trim();
    return thread.latestPreview.slice(0, 60) + '\u2026';
  }
  return thread.participants[0]?.displayName ?? 'thread';
}

export function OwedIndicator({ threads }: OwedIndicatorProps) {
  const owed = threads.filter((t) => t.isOwed);

  // Caught up
  if (owed.length === 0) {
    const latest = threads
      .map((t) => t.lastMessageAt)
      .sort()
      .pop();

    return (
      <div
        className="flex items-center stage-label"
        style={{
          gap: 'var(--stage-gap, 6px)',
          color: 'var(--stage-text-tertiary)',
        }}
      >
        <CheckCircle2 size={12} style={{ color: 'var(--stage-text-tertiary)' }} />
        {latest ? (
          <span>Caught up · last reply {formatRelTime(latest)}</span>
        ) : (
          <span>Caught up</span>
        )}
      </div>
    );
  }

  // Single owed
  if (owed.length === 1) {
    const t = owed[0];
    const who = t.participants[0]?.displayName ?? t.primaryEntityName ?? 'Someone';
    const firstName = who.split(/\s+/)[0];
    const what = firstInboundSubjectFragment(t);

    return (
      <div
        className="flex items-center min-w-0 stage-label"
        style={{
          gap: 'var(--stage-gap, 6px)',
          color: 'var(--stage-text-secondary)',
        }}
      >
        <AlertCircle
          size={12}
          className="shrink-0"
          style={{ color: 'var(--color-unusonic-warning)' }}
        />
        <span className="truncate">
          <strong style={{ fontWeight: 500, color: 'var(--stage-text-primary)' }}>Owed</strong>
          {' · '}
          {firstName} — {what}{' '}
          <span style={{ color: 'var(--stage-text-tertiary)' }}>
            ({formatRelTime(t.lastMessageAt)})
          </span>
        </span>
      </div>
    );
  }

  // Multiple owed
  const labels = owed.slice(0, 3).map((t) => {
    const who = (t.participants[0]?.displayName ?? 'Someone').split(/\s+/)[0];
    const what = firstInboundSubjectFragment(t);
    return `${who} (${what.length > 30 ? what.slice(0, 30) + '\u2026' : what})`;
  });
  const overflow = owed.length - labels.length;

  return (
    <div
      className="flex items-center min-w-0 stage-label"
      style={{
        gap: 'var(--stage-gap, 6px)',
        color: 'var(--stage-text-secondary)',
      }}
    >
      <AlertCircle
        size={12}
        className="shrink-0"
        style={{ color: 'var(--color-unusonic-warning)' }}
      />
      <span className="truncate">
        <strong style={{ fontWeight: 500, color: 'var(--stage-text-primary)' }}>
          {owed.length} owed
        </strong>
        {' · '}
        {labels.join(' · ')}
        {overflow > 0 && (
          <span style={{ color: 'var(--stage-text-tertiary)' }}> +{overflow} more</span>
        )}
      </span>
    </div>
  );
}
