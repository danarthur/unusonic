'use client';

/**
 * MessageTile — single message display within an expanded thread.
 *
 * Extracted from v1 RepliesCard.tsx to support:
 *   - Quoted-reply auto-collapse per message (v2 spec §5 Tier 4)
 *   - Auto-reply muted treatment (from PR #19)
 *   - Inbound stripe indicator + sender chip + role badge (Phase 1.5 badge)
 *   - Attachment chips + outbound delivery footer
 *
 * See docs/reference/replies-card-v2-design.md §5 Tier 4.
 *
 * @module features/comms/replies/ui/MessageTile
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Paperclip } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatRelTime } from '@/shared/lib/format-currency';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { splitQuotedReply, countQuotedLines } from '../lib/quote-stripper';
import type { ReplyMessage } from '../api/get-deal-replies';

export type MessageTileProps = {
  message: ReplyMessage;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function senderLabel(message: ReplyMessage): string {
  if (message.direction === 'inbound') {
    return message.fromEntityName ?? message.fromAddress;
  }
  return message.sentByName ?? 'You';
}

function senderKind(message: ReplyMessage): string {
  if (message.isAutoReply) return 'Auto-reply';
  if (message.direction === 'inbound') return 'Client';
  return 'You';
}

export function MessageTile({ message }: MessageTileProps) {
  const isInbound = message.direction === 'inbound';
  const isAutoReply = message.isAutoReply;

  const { visible, quoted } = splitQuotedReply(message.bodyText);
  const quotedLineCount = countQuotedLines(quoted);
  const [quotedOpen, setQuotedOpen] = useState(false);

  return (
    <div
      className="flex flex-col"
      style={{
        gap: 'var(--stage-gap, 6px)',
        padding: 'var(--stage-gap-wide, 12px)',
        borderRadius: 'var(--stage-radius-nested, 8px)',
        background: isInbound ? 'var(--ctx-well)' : 'oklch(1 0 0 / 0.02)',
        border: '1px solid var(--stage-edge-subtle)',
        borderLeftWidth: '2px',
        borderLeftColor:
          isAutoReply
            ? 'var(--stage-edge-subtle)'
            : isInbound
              ? 'var(--color-unusonic-info)'
              : 'transparent',
        opacity: isAutoReply ? 0.62 : 1,
      }}
      data-surface={isInbound ? 'well' : undefined}
    >
      {/* Sender row */}
      <div className="flex items-center justify-between" style={{ gap: 'var(--stage-gap, 6px)' }}>
        <div className="flex items-center min-w-0" style={{ gap: 'var(--stage-gap, 6px)' }}>
          <span
            className="stage-badge-text tracking-wide uppercase shrink-0"
            style={{
              color: isAutoReply
                ? 'var(--stage-text-tertiary)'
                : isInbound
                  ? 'var(--color-unusonic-info)'
                  : 'var(--stage-text-tertiary)',
            }}
          >
            {senderKind(message)}
          </span>
          <span
            className="text-sm tracking-tight truncate"
            style={{
              color: 'var(--stage-text-primary)',
              fontStyle: isAutoReply ? 'italic' : 'normal',
            }}
          >
            {senderLabel(message)}
          </span>
        </div>
        <span
          className="stage-label shrink-0 tabular-nums"
          style={{ color: 'var(--stage-text-tertiary)' }}
          title={
            isAutoReply && message.autoReplyReason
              ? `Auto-reply (${message.autoReplyReason}) · ${new Date(message.createdAt).toLocaleString()}`
              : new Date(message.createdAt).toLocaleString()
          }
        >
          {formatRelTime(message.createdAt)}
        </span>
      </div>

      {/* Body — visible portion of the split */}
      {visible && (
        <p
          className={cn(
            'text-sm leading-relaxed whitespace-pre-wrap break-words',
            isAutoReply && 'italic',
          )}
          style={{ color: 'var(--stage-text-primary)' }}
        >
          {visible}
        </p>
      )}

      {/* Quoted-reply collapse */}
      {quoted && quotedLineCount > 0 && (
        <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 6px)' }}>
          <button
            type="button"
            onClick={() => setQuotedOpen((v) => !v)}
            className="stage-label self-start inline-flex items-center transition-colors"
            style={{
              color: 'var(--stage-text-tertiary)',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
            aria-expanded={quotedOpen}
          >
            <motion.span
              animate={{ rotate: quotedOpen ? 180 : 0 }}
              transition={STAGE_LIGHT}
              style={{ display: 'inline-flex' }}
            >
              <ChevronDown size={12} />
            </motion.span>
            {quotedOpen
              ? `Hide ${quotedLineCount} earlier ${quotedLineCount === 1 ? 'line' : 'lines'}`
              : `Show ${quotedLineCount} earlier quoted ${quotedLineCount === 1 ? 'line' : 'lines'}`}
          </button>
          <AnimatePresence initial={false}>
            {quotedOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={STAGE_LIGHT}
                style={{ overflow: 'hidden' }}
              >
                <pre
                  className="text-xs leading-relaxed whitespace-pre-wrap break-words"
                  style={{
                    color: 'var(--stage-text-tertiary)',
                    borderLeft: '2px solid var(--stage-edge-subtle)',
                    paddingLeft: 'var(--stage-gap-wide, 12px)',
                    fontFamily: 'inherit',
                    margin: 0,
                  }}
                >
                  {quoted}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Attachments */}
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 'var(--stage-gap, 6px)' }}>
          {message.attachments.map((att, idx) => (
            <div
              key={idx}
              className={cn('inline-flex items-center rounded-md', 'stage-badge-text')}
              style={{
                gap: '6px',
                padding: '4px 8px',
                background: 'oklch(1 0 0 / 0.04)',
                border: '1px solid var(--stage-edge-subtle)',
                color: 'var(--stage-text-secondary)',
              }}
            >
              <Paperclip size={12} />
              <span className="truncate max-w-[220px]">{att.filename ?? 'attachment'}</span>
              {typeof att.size === 'number' && (
                <span style={{ color: 'var(--stage-text-tertiary)' }}>{formatBytes(att.size)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Outbound delivery status footer */}
      {!isInbound && (message.deliveredAt || message.openedAt || message.bouncedAt) && (
        <div
          className="flex items-center stage-label"
          style={{
            gap: 'var(--stage-gap, 6px)',
            color: message.bouncedAt
              ? 'var(--color-unusonic-error)'
              : 'var(--stage-text-tertiary)',
          }}
        >
          {message.bouncedAt ? (
            <span>Bounced {formatRelTime(message.bouncedAt)}</span>
          ) : message.openedAt ? (
            <span>Opened {formatRelTime(message.openedAt)}</span>
          ) : message.deliveredAt ? (
            <span>Delivered {formatRelTime(message.deliveredAt)}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
