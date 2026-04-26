'use client';

/**
 * RecentRepliesWidget — workspace-wide cross-deal feed of recent replies.
 *
 * Lobby pane that closes the discoverability gap: instead of opening
 * each of 23 deals to find what changed since Sunday, Marcus sees the
 * last 12 inbound messages across all deals in one tile and taps a row
 * to deep-link into the right deal's Replies card.
 *
 * Auto-replies aggregate into a muted rollup row at the bottom — they
 * exist so Marcus doesn't wonder "did I miss something" but they don't
 * occupy main-feed real estate.
 *
 * @module widgets/recent-replies/ui/RecentRepliesWidget
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, Inbox, Paperclip } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { formatRelTime } from '@/shared/lib/format-currency';
import { getRecentReplies, type RecentRepliesData } from '../api/get-recent-replies';

export function RecentRepliesWidget() {
  const [data, setData] = useState<RecentRepliesData | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRecentReplies(12)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            items: [],
            autoReplyCount: 0,
            autoReplyOldest: null,
            autoReplyNewest: null,
            unreadTotal: 0,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StagePanel
      elevated
      style={{
        padding: 'var(--stage-padding, 16px)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 'var(--stage-gap-wide, 12px)' }}
      >
        <p className="stage-label">
          Recent replies
          {data && data.unreadTotal > 0 && (
            <span style={{ color: 'var(--stage-text-primary)', fontWeight: 500 }}>
              {' · '}
              {data.unreadTotal} unread
            </span>
          )}
        </p>
      </div>

      {data === null ? (
        <Skeleton />
      ) : data.items.length === 0 ? (
        <EmptyState autoReplyCount={data.autoReplyCount} />
      ) : (
        <div
          className="flex flex-col flex-1 overflow-y-auto"
          style={{ gap: 'var(--stage-gap, 6px)', minHeight: 0 }}
        >
          {data.items.map((item) => (
            <ReplyRow key={item.messageId} item={item} />
          ))}
          {data.autoReplyCount > 0 && (
            <AutoReplyRollup
              count={data.autoReplyCount}
              oldest={data.autoReplyOldest}
              newest={data.autoReplyNewest}
            />
          )}
        </div>
      )}
    </StagePanel>
  );
}

// =============================================================================
// Row
// =============================================================================

function ReplyRow({ item }: { item: { messageId: string; threadId: string; dealId: string | null; dealTitle: string | null; fromAddress: string; fromEntityName: string | null; subject: string | null; preview: string; createdAt: string; hasAttachments: boolean; isOwed: boolean; dealHref: string | null } }) {
  const senderName = item.fromEntityName ?? item.fromAddress;
  const dealLabel = item.dealTitle ?? '\u2014 unmatched';

  const inner = (
    <div
      className="flex items-start"
      style={{
        gap: 'var(--stage-gap, 6px)',
        padding: 'var(--stage-gap-wide, 12px)',
        borderRadius: 'var(--stage-radius-nested, 8px)',
        border: '1px solid transparent',
        transition: 'background 80ms ease-out, border-color 80ms ease-out',
      }}
    >
      {/* State dot */}
      <div
        className="shrink-0"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: item.isOwed
            ? 'var(--color-unusonic-warning)'
            : 'var(--stage-text-tertiary)',
          marginTop: 7,
        }}
        aria-label={item.isOwed ? 'Owed reply' : 'Acknowledged reply'}
      />

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ gap: '2px' }}>
        <div
          className="flex items-center justify-between"
          style={{ gap: 'var(--stage-gap, 6px)' }}
        >
          <span
            className="text-sm tracking-tight truncate"
            style={{ color: 'var(--stage-text-primary)', fontWeight: 500 }}
          >
            {senderName}
          </span>
          <span
            className="stage-label tabular-nums shrink-0"
            style={{ color: 'var(--stage-text-tertiary)' }}
            title={new Date(item.createdAt).toLocaleString()}
          >
            {formatRelTime(item.createdAt)}
          </span>
        </div>
        <span
          className="stage-label truncate"
          style={{ color: 'var(--stage-text-tertiary)' }}
        >
          <Mail
            size={10}
            style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }}
          />
          {dealLabel}
          {item.subject && (
            <>
              {' \u00b7 '}
              {item.subject}
            </>
          )}
        </span>
        {item.preview && (
          <span
            className="text-xs truncate"
            style={{ color: 'var(--stage-text-secondary)' }}
          >
            {item.preview}
          </span>
        )}
        {item.hasAttachments && (
          <span
            className="stage-label inline-flex items-center"
            style={{ color: 'var(--stage-text-tertiary)', gap: '3px' }}
          >
            <Paperclip size={10} />
            attachment
          </span>
        )}
      </div>
    </div>
  );

  if (!item.dealHref) {
    // No deal context — render unclickable. Edge case for unmatched
    // inbound that didn't bind to a deal.
    return inner;
  }

  return (
    <Link
      href={item.dealHref}
      className="text-decoration-none"
      style={{ color: 'inherit' }}
      onMouseEnter={(e) => {
        const child = e.currentTarget.firstElementChild as HTMLElement | null;
        if (child) {
          child.style.background = 'oklch(1 0 0 / 0.04)';
          child.style.borderColor = 'var(--stage-edge-subtle)';
        }
      }}
      onMouseLeave={(e) => {
        const child = e.currentTarget.firstElementChild as HTMLElement | null;
        if (child) {
          child.style.background = 'transparent';
          child.style.borderColor = 'transparent';
        }
      }}
    >
      {inner}
    </Link>
  );
}

// =============================================================================
// Auto-reply rollup
// =============================================================================

function AutoReplyRollup({
  count,
  oldest,
  newest,
}: {
  count: number;
  oldest: string | null;
  newest: string | null;
}) {
  const range =
    oldest && newest && oldest !== newest
      ? `${formatRelTime(oldest)} \u2192 ${formatRelTime(newest)}`
      : oldest
      ? formatRelTime(oldest)
      : '';

  return (
    <div
      className="flex items-center stage-label"
      style={{
        gap: 'var(--stage-gap, 6px)',
        padding: 'var(--stage-gap-wide, 12px)',
        borderTop: '1px solid var(--stage-edge-subtle)',
        marginTop: 'var(--stage-gap, 6px)',
        color: 'var(--stage-text-tertiary)',
        fontStyle: 'italic',
      }}
    >
      <Inbox size={11} />
      <span>
        {count} auto-{count === 1 ? 'reply' : 'replies'}
        {range && ` \u00b7 ${range}`}
      </span>
    </div>
  );
}

// =============================================================================
// Empty / loading
// =============================================================================

function EmptyState({ autoReplyCount }: { autoReplyCount: number }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1" style={{ gap: '8px' }}>
      <Inbox size={20} style={{ color: 'var(--stage-text-tertiary)' }} />
      <p
        className="stage-label text-center"
        style={{ color: 'var(--stage-text-secondary)' }}
      >
        Nothing in the last 24 hours.
      </p>
      {autoReplyCount > 0 && (
        <p
          className="stage-label text-center"
          style={{ color: 'var(--stage-text-tertiary)', fontStyle: 'italic' }}
        >
          ({autoReplyCount} auto-{autoReplyCount === 1 ? 'reply' : 'replies'})
        </p>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 6px)' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-2" style={{ padding: 'var(--stage-gap-wide, 12px)' }}>
          <div className="size-2 shrink-0 rounded-full stage-skeleton mt-1.5" />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-3 w-40 rounded stage-skeleton" />
            <div className="h-3 w-56 rounded stage-skeleton" />
            <div className="h-3 w-3/4 rounded stage-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}
