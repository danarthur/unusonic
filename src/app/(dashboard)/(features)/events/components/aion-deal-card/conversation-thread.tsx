'use client';

/**
 * Conversation thread + message bubble + chat input for the AionDealCard.
 *
 * Extracted from aion-deal-card.tsx (Phase 0.5-style split, 2026-04-28).
 *
 * Owns:
 *   - ConversationThread — sticky thread chrome + scroll region. Renders a
 *     skeleton while the parent's session DB fetch is in flight on cache-
 *     miss (perf-patterns.md §14), `null` when truly empty.
 *   - MessageBubble — individual user/assistant row.
 *   - AionChatInput — single-line composer with send + voice affordances.
 */

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink, Mic, Plus, Sparkles } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { AionMarkdown } from '@/app/(dashboard)/(features)/aion/components/AionMarkdown';
import { cn } from '@/shared/lib/utils';
import type { AionChatMessage } from './types';

// ---------------------------------------------------------------------------
// Conversation thread — renders user/Aion messages as they accumulate.
// Empty by default; appears above the input footer once messages exist.
// Scrolls internally at max-h to keep the card's overall height bounded.
// Backend wiring persists thread state (deal diary) separately.
// ---------------------------------------------------------------------------

export function ConversationThread({
  messages,
  threadTitle,
  sessionId,
  isLoadingSession,
  onNewChat,
  onCollapse,
}: {
  messages: AionChatMessage[];
  threadTitle: string;
  /** Current session id — powers the "Open in Aion" deep-link. NULL during
   *  the brief mount window before openScopedSession resolves. */
  sessionId: string | null;
  /** True while the post-selectSession DB fetch is mid-flight on cache-miss.
   *  Drives the thread skeleton render that replaces the (briefly) empty
   *  state — matches the /aion ChatInterface pattern so the deal-card and
   *  the full Aion tab tell the same loading story. */
  isLoadingSession: boolean;
  /** Spawn a fresh thread in this deal scope (same production, new topic). */
  onNewChat: () => void;
  /** Collapse the chat region (thread + input). Parent persists the state
   *  per-deal so each production remembers its preference. */
  onCollapse: () => void;
}) {
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (messages.length > 0) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length]);

  // Show a thread skeleton during the post-selectSession DB fetch on cache-
  // miss instead of returning null (which reads as "this deal has no chat
  // yet" — wrong on a session whose history is in the DB). Mirrors the
  // /aion ChatInterface skeleton at perf-patterns.md §14.
  if (messages.length === 0 && isLoadingSession) {
    return (
      <div
        className="mt-3 pt-3 flex flex-col gap-2"
        style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}
        aria-hidden
      >
        <div className="flex justify-end">
          <div className="stage-skeleton h-8 w-2/5 rounded-2xl" />
        </div>
        <div className="flex justify-start">
          <div className="stage-skeleton h-12 w-3/4 rounded-2xl" />
        </div>
        <div className="flex justify-end">
          <div className="stage-skeleton h-7 w-1/3 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (messages.length === 0) return null;

  // Deep-link into /aion with this session pre-selected. AionPageClient reads
  // the `session` query param and hands it to selectSession on mount.
  const openInAionHref = sessionId
    ? `/aion?session=${encodeURIComponent(sessionId)}`
    : '/aion';

  return (
    <div
      className="mt-3 pt-3 flex flex-col"
      style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}
    >
      {/* Thread header — title + controls. Card compression fix per
          docs/reference/aion-deal-chat-design.md §3 (sticky header above a
          fixed-height scroll region keeps the card from becoming a monolith
          as the thread grows). */}
      <div className="flex items-center gap-1.5 pb-2">
        <p
          className="text-xs truncate flex-1 leading-none"
          style={{ color: 'var(--stage-text-secondary)' }}
          title={threadTitle}
        >
          {threadTitle}
        </p>
        <button
          type="button"
          onClick={onNewChat}
          className={cn(
            'shrink-0 p-1 rounded-[4px]',
            'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
            'hover:bg-[oklch(1_0_0_/_0.06)] transition-colors duration-[80ms]',
          )}
          aria-label="New chat about this event"
          title="New chat about this event"
        >
          <Plus size={13} strokeWidth={1.5} />
        </button>
        <Link
          href={openInAionHref}
          className={cn(
            'shrink-0 p-1 rounded-[4px]',
            'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
            'hover:bg-[oklch(1_0_0_/_0.06)] transition-colors duration-[80ms]',
          )}
          aria-label="Open in Aion"
          title="Open in Aion"
        >
          <ExternalLink size={13} strokeWidth={1.5} />
        </Link>
        <button
          type="button"
          onClick={onCollapse}
          className={cn(
            'shrink-0 p-1 rounded-[4px]',
            'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
            'hover:bg-[oklch(1_0_0_/_0.06)] transition-colors duration-[80ms]',
          )}
          aria-label="Minimize chat"
          title="Minimize chat"
        >
          <ChevronDown size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* Fixed-height scroll region — 320px matches Field Expert spec. Keeps
          the briefing + signals always visible even as the conversation
          grows. The "Open in Aion" link is the escape valve for longer
          reviews of history. */}
      <div
        className="h-[320px] overflow-y-auto space-y-2 pr-1"
        data-surface="elevated"
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: AionChatMessage }) {
  const isUser = message.role === 'user';
  // Assistant messages lead with the AionMark living logo as the avatar —
  // identity signature for every Aion turn. User turns render right-aligned
  // without an avatar (the user is implicit).
  return (
    <div className={cn('flex items-start gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="shrink-0 mt-0.5">
          <AionMark size={22} status="ambient" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[80%] rounded-md px-3 py-2 leading-snug',
          isUser
            ? 'bg-[var(--stage-surface-raised)] shadow-[inset_0_0_0_1px_var(--stage-edge-subtle)]'
            : 'bg-[var(--ctx-card)]',
        )}
        style={{
          fontSize: 'var(--stage-text-body, 13px)',
          color: isUser
            ? 'var(--stage-text-primary)'
            : 'var(--stage-text-secondary)',
        }}
      >
        {/* Assistant text is run through AionMarkdown so inline <citation>
            tags render as clickable CitationPills (Phase 2 §3.1.3). User
            text is left plain — no markdown on human-authored input. */}
        {!isUser && (message as { preamble?: string }).preamble?.trim() && (
          <div
            className="mb-1.5 flex items-start gap-1 text-[0.72rem] italic leading-snug"
            style={{ color: 'var(--stage-text-tertiary)' }}
            aria-label="Aion's reasoning"
          >
            <Sparkles size={9} strokeWidth={1.5} className="shrink-0 mt-[3px] opacity-60" aria-hidden />
            <span className="whitespace-pre-wrap">
              {(message as { preamble?: string }).preamble!.trim()}
            </span>
          </div>
        )}
        {isUser ? message.content : <AionMarkdown content={message.content} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deal-scoped chat input — scaffold only, backend wires separately.
// Every message implicitly carries this deal's context, so users never
// re-state the subject. Microphone button reserves the voice-input slot.
// ---------------------------------------------------------------------------

export function AionChatInput({
  onSend,
}: {
  onSend?: (content: string) => void;
}) {
  const [value, setValue] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setValue('');
  };

  const handleMicClick = () => {
    // Placeholder for voice capture — will wire into the existing voice
    // pipeline (AionVoice component or Web Speech API) in the backend pass.
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 min-w-0 flex items-center gap-1.5">
      <div
        className={cn(
          'flex items-center flex-1 min-w-0 rounded-md px-3',
          'bg-[var(--ctx-well)]',
          'border border-[var(--stage-edge-subtle)]',
          'focus-within:border-[var(--stage-accent)]',
          'focus-within:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)]',
          'transition-colors',
        )}
        style={{ height: 'calc(var(--stage-input-height, 34px) - 6px)' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask Aion about this deal…"
          className={cn(
            'flex-1 min-w-0 bg-transparent outline-none',
            'text-sm text-[var(--stage-text-primary)]',
            'placeholder:text-[var(--stage-text-tertiary,var(--stage-text-secondary))]',
          )}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Voice input"
        onClick={handleMicClick}
        className="text-[var(--stage-text-secondary)] shrink-0"
      >
        <Mic className="size-3.5" aria-hidden />
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Footer actions — one or two co-equal CTAs
// ---------------------------------------------------------------------------

