'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { formatRelTime } from '@/shared/lib/format-currency';
import { type FollowUpLogEntry, getFollowUpLog } from '../actions/follow-up-actions';

// =============================================================================
// Constants
// =============================================================================

const ACTION_LABELS: Record<string, string> = {
  email_sent: 'Sent email',
  sms_sent: 'Sent text message',
  call_logged: 'Logged phone call',
  snoozed: 'Snoozed follow-up',
  dismissed: 'Marked as handled',
  note_added: 'Added note',
  system_queued: 'System flagged for follow-up',
  system_removed: 'System cleared follow-up',
};

const CHANNEL_DOT_COLORS: Record<string, string> = {
  phone: 'oklch(0.65 0.15 250)',   // blue
  sms: 'var(--color-unusonic-success)',     // green
  email: 'var(--color-unusonic-warning)',   // amber
  system: 'var(--stage-text-tertiary)',     // gray
  manual: 'var(--stage-text-primary)',      // white
};

const CHANNEL_LABELS: Record<string, string> = {
  phone: 'Phone',
  call: 'Phone',
  sms: 'Text',
  email: 'Email',
  system: 'System',
  manual: 'Manual',
};

// =============================================================================
// FollowUpActionLog
// =============================================================================

export type FollowUpActionLogProps = {
  dealId: string;
};

export function FollowUpActionLog({ dealId }: FollowUpActionLogProps) {
  const [entries, setEntries] = useState<FollowUpLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchLog = useCallback(async () => {
    const log = await getFollowUpLog(dealId);
    setEntries(log);
    setLoading(false);
  }, [dealId]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  // Don't render anything if no entries
  if (!loading && entries.length === 0) return null;
  if (loading) return null;

  return (
    <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <p className="stage-label" style={{ color: 'var(--stage-text-secondary)' }}>
            Follow-up history
          </p>
          <span
            className="inline-flex items-center justify-center text-[10px] font-medium tabular-nums"
            style={{
              color: 'var(--stage-text-tertiary)',
              background: 'oklch(1 0 0 / 0.06)',
              borderRadius: 'var(--stage-radius-pill)',
              padding: '1px 6px',
              minWidth: '18px',
            }}
          >
            {entries.length}
          </span>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={STAGE_LIGHT}
        >
          <ChevronDown
            size={14}
            className="text-[var(--stage-text-tertiary)]"
          />
        </motion.div>
      </button>

      {/* Expanded timeline */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden"
          >
            <div
              className="flex flex-col"
              style={{ paddingTop: 'var(--stage-gap-wide, 12px)' }}
            >
              {entries.map((entry, idx) => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  isLast={idx === entries.length - 1}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </StagePanel>
  );
}

// =============================================================================
// TimelineEntry
// =============================================================================

function TimelineEntry({
  entry,
  isLast,
}: {
  entry: FollowUpLogEntry;
  isLast: boolean;
}) {
  const [contentExpanded, setContentExpanded] = useState(false);
  const dotColor = CHANNEL_DOT_COLORS[entry.channel ?? 'manual'] ?? CHANNEL_DOT_COLORS.manual;
  const channelLabel = CHANNEL_LABELS[entry.channel ?? 'manual'] ?? entry.channel ?? 'Manual';
  const actionLabel = ACTION_LABELS[entry.action_type] ?? entry.action_type;
  const summary = entry.summary || actionLabel;
  const hasContent = !!entry.content;

  return (
    <div className="flex gap-3 min-w-0">
      {/* Left: dot + vertical line */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className="size-2 rounded-full shrink-0 mt-1.5"
          style={{ background: dotColor }}
        />
        {!isLast && (
          <div
            className="w-px flex-1 min-h-[16px]"
            style={{ background: 'var(--stage-edge-subtle)' }}
          />
        )}
      </div>

      {/* Right: content */}
      <div
        className="flex-1 min-w-0 pb-3"
        style={{ paddingBottom: isLast ? '0' : 'var(--stage-gap-wide, 12px)' }}
      >
        {/* Line 1: summary */}
        <p
          className={cn(
            'text-sm tracking-tight leading-tight',
            hasContent && 'cursor-pointer',
          )}
          style={{ color: 'var(--stage-text-primary)' }}
          onClick={hasContent ? () => setContentExpanded((v) => !v) : undefined}
        >
          {summary}
        </p>

        {/* Line 2: relative time + channel */}
        <p className="stage-label mt-0.5" style={{ color: 'var(--stage-text-tertiary)' }}>
          {formatRelTime(entry.created_at)}
          <span className="mx-1">&middot;</span>
          {channelLabel}
        </p>

        {/* Expandable content */}
        <AnimatePresence>
          {contentExpanded && entry.content && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={STAGE_LIGHT}
              className="overflow-hidden"
            >
              <p
                className="text-xs leading-relaxed whitespace-pre-wrap break-words mt-1.5"
                style={{ color: 'var(--stage-text-secondary)' }}
              >
                {entry.content}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
