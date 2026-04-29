'use client';

/**
 * AionPlanCard — the production-phase Aion briefing surface on the Plan tab.
 *
 * Visual + behavioral DNA mirrors `AionDealCard` (the Sales-tab Aion card) for
 * cross-tab consistency:
 *   - Two-column layout on desktop (identity column + content column)
 *   - Mobile collapses to a horizontal identity row above the content
 *   - Same StagePanel elevated treatment
 *   - Reuses `SignalsList` from `aion-card-primitives.tsx`
 *   - Event-scoped chat thread + input at the bottom (mirrors the deal-scoped
 *     chat on AionDealCard) so a user on Plan can ask Aion questions about
 *     this specific show
 *   - Brief Me as the trailing footer CTA, replacing the deal card's
 *     follow-up / pipeline FooterActions
 *
 * The Sales card asks "is this deal going to close?"; the Plan card asks
 * "what needs my attention before show day?". Same friend, different room.
 *
 * Reference: docs/reference/aion-plan-card-design.md
 */

import { ChevronDown, ChevronUp, Headphones, Mic } from 'lucide-react';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Button } from '@/shared/ui/button';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { BriefOverlay } from './brief-overlay';
import { SignalsList, type SignalEntry } from './aion-card-primitives';
import { AionMarkdown } from '@/app/(dashboard)/(features)/aion/components/AionMarkdown';
import { useSession, type Message as SessionMessage } from '@/shared/ui/providers/SessionContext';
import { useRequiredWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { EventSignal } from '../lib/compute-event-signals';

export type AionPlanCardProps = {
  eventId: string;
  /** Display title stored on the scope-linked session at create time so the
   *  Aion-tab sidebar can label the thread before the live header fetch
   *  resolves. Falls back to "Event" if not provided. */
  eventTitle?: string | null;
  /** ISO timestamp of when the show begins. Drives the T-X subhead. */
  startsAt: string | null;
  /** Signal stack from the Prism bundle. Empty array = "nothing drifting". */
  signals: EventSignal[];
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Renders the dynamic T-X chip — "23 days out", "T-3", "Show day". */
function formatSubhead(startsAt: string | null, now: number): string {
  if (!startsAt) return 'Plan';
  const diff = new Date(startsAt).getTime() - now;
  const days = Math.floor(diff / DAY_MS);
  if (days < 0) {
    const past = Math.abs(days);
    if (past === 0) return 'Show day';
    return `${past}d after show`;
  }
  if (days === 0) return 'Show day';
  if (days === 1) return 'Tomorrow';
  if (days <= 3) return `T-${days}`;
  return `${days} days out`;
}

/** One-line summary above the signal list. The "voice" of the card. */
function buildVoice(signals: EventSignal[]): string {
  if (signals.length === 0) {
    return 'Nothing drifting. Show is advancing on cadence.';
  }
  return signals[0].sentence;
}

/** Map EventSignal → SignalEntry to reuse the Sales card's primitive. */
function toSignalEntries(signals: EventSignal[]): SignalEntry[] {
  return signals.map((s) => ({
    label: s.label,
    value: s.value,
    kind: 'context',
  }));
}

export function AionPlanCard({ eventId, eventTitle, startsAt, signals }: AionPlanCardProps) {
  const [briefOpen, setBriefOpen] = useState(false);
  const subhead = formatSubhead(startsAt, Date.now());
  const hasConcerns = signals.length > 0;
  const voice = buildVoice(signals);
  const entries = toSignalEntries(signals);

  // Event-scoped chat — the same session store the Aion sidebar reads. Two
  // views into one thread (Aion-tab sidebar shows it grouped under Events).
  const workspaceId = useRequiredWorkspace();
  const {
    messages: sessionMessages,
    currentSessionId,
    openScopedSession,
    sendChatMessage,
  } = useSession();
  const [eventSessionId, setEventSessionId] = useState<string | null>(null);

  // Resume or create the event-scoped session when the eventId changes.
  // openScopedSession is idempotent server-side, so re-mounts are cheap.
  useEffect(() => {
    let cancelled = false;
    openScopedSession({
      workspaceId,
      scopeType: 'event',
      scopeEntityId: eventId,
      title: eventTitle ?? null,
    }).then((id) => {
      if (!cancelled && id) setEventSessionId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, workspaceId, eventTitle, openScopedSession]);

  const messages: SessionMessage[] =
    eventSessionId && currentSessionId === eventSessionId ? sessionMessages : [];

  // Collapsed-by-default for Plan v1. Mirrors the Deal card's persisted
  // pattern but flips the default — when an owner opens a Plan tab fresh,
  // old chat history shouldn't auto-expand and surprise them with stale
  // turns from prior testing or earlier conversations. The input stays
  // visible; the thread is one click away when they want it.
  const collapseStorageKey = `unusonic.aion_chat_collapsed.event.${eventId}`;
  const [isChatCollapsed, setIsChatCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = window.localStorage.getItem(collapseStorageKey);
      // Null means "first visit" — default collapsed. "false" means user
      // explicitly expanded and wants to see thread on return.
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });
  const toggleChatCollapsed = useCallback(() => {
    setIsChatCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(collapseStorageKey, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [collapseStorageKey]);

  const handleSendMessage = useCallback(
    (content: string) => {
      // Auto-expand the thread on send — the user clearly wants to see the
      // reply land, and matches the Deal card's behavior on send.
      if (isChatCollapsed) {
        setIsChatCollapsed(false);
        try {
          window.localStorage.setItem(collapseStorageKey, 'false');
        } catch {
          /* ignore */
        }
      }
      sendChatMessage({ text: content, workspaceId }).catch((err) => {
        console.error('[AionPlanCard] sendChatMessage failed:', err);
        toast.error('Aion could not send that message. Try again.');
      });
    },
    [sendChatMessage, workspaceId, isChatCollapsed, collapseStorageKey],
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={STAGE_MEDIUM}
      >
        <StagePanel elevated padding="md">
          {/* Mobile identity row — horizontal AION + mark above content. */}
          <div className="flex items-center gap-2 mb-3 md:hidden">
            <AionMark size={40} status="loading" />
            <span
              className="stage-label tracking-wide uppercase"
              style={{
                fontSize: '11px',
                color: 'var(--stage-text-tertiary, var(--stage-text-secondary))',
              }}
            >
              Aion
            </span>
          </div>

          {/* Two-column briefing region — left=identity, right=content. */}
          <div className="flex flex-col md:flex-row md:items-stretch md:gap-5">
            {/* Left column: hidden on mobile (identity rendered above) */}
            <div className="hidden md:flex shrink-0 flex-col items-center w-[72px] lg:w-[88px]">
              <span
                className="stage-label tracking-wide uppercase"
                style={{
                  fontSize: '11px',
                  color: 'var(--stage-text-tertiary, var(--stage-text-secondary))',
                }}
              >
                Aion
              </span>
              <div className="flex-1 flex items-center justify-center">
                <AionMark size={56} status="loading" />
              </div>
            </div>

            {/* Right column: T-X chip, voice, signals. */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-center min-w-0">
                <span
                  className="stage-label tracking-tight px-2 py-0.5 rounded-full"
                  style={{
                    color: 'var(--stage-text-secondary)',
                    background: 'var(--stage-surface-elevated)',
                    border: '1px solid var(--stage-edge-subtle)',
                  }}
                >
                  {subhead}
                </span>
              </div>

              <div className="space-y-3 max-w-[640px] mt-3">
                <p
                  className="leading-snug"
                  style={{
                    fontSize: '15px',
                    color: hasConcerns
                      ? 'var(--stage-text-primary)'
                      : 'var(--stage-text-secondary)',
                  }}
                >
                  {voice}
                </p>
                <SignalsList signals={entries} />
              </div>
            </div>
          </div>

          {/* Conversation thread — renders only when expanded. Same shape as
              AionDealCard's ConversationThread, simplified for v1. */}
          {!isChatCollapsed && messages.length > 0 && (
            <ScopedThread messages={messages} />
          )}

          {/* Footer row — when collapsed: a single-line "Open chat / Aion
              chat · N messages" pill that mirrors the Deal card's collapsed
              state, with Brief Me on the right. When expanded: chat input +
              Brief Me, mirroring the Deal card's expanded footer. */}
          {isChatCollapsed ? (
            <div
              className="mt-3 pt-3 flex items-center justify-between gap-2"
              style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}
            >
              <button
                type="button"
                onClick={toggleChatCollapsed}
                className={cn(
                  'flex-1 min-w-0 inline-flex items-center justify-between gap-2 px-3 py-1.5 text-sm',
                  'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
                  'border border-[var(--stage-edge-subtle)] hover:bg-[oklch(1_0_0_/_0.04)]',
                  'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                )}
                style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                aria-label={messages.length > 0 ? 'Open chat' : 'Ask Aion'}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <AionMark size={14} status="ambient" />
                  <span className="truncate">
                    {messages.length > 0
                      ? `Aion chat · ${messages.length} message${messages.length === 1 ? '' : 's'}`
                      : 'Ask Aion about this show'}
                  </span>
                </span>
                <ChevronUp size={12} strokeWidth={1.5} aria-hidden />
              </button>
              <div className="flex items-center justify-end gap-2 shrink-0">
                <BriefMeButton
                  eventId={eventId}
                  onOpen={() => setBriefOpen(true)}
                />
              </div>
            </div>
          ) : (
            <div
              className="mt-3 pt-3 flex flex-col md:flex-row md:items-center gap-2"
              style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}
            >
              <PlanChatInput onSend={handleSendMessage} />
              <div className="flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={toggleChatCollapsed}
                  aria-label="Minimize chat"
                  title="Minimize chat"
                  className={cn(
                    'shrink-0 p-1.5 rounded-[4px]',
                    'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
                    'hover:bg-[oklch(1_0_0_/_0.06)] transition-colors duration-[80ms]',
                  )}
                >
                  <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
                </button>
                <BriefMeButton
                  eventId={eventId}
                  onOpen={() => setBriefOpen(true)}
                />
              </div>
            </div>
          )}
        </StagePanel>
      </motion.div>

      <BriefOverlay eventId={eventId} open={briefOpen} onClose={() => setBriefOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// BriefMeButton — same look in collapsed and expanded footer states. Fires
// the existing brief-open telemetry endpoint, opens the BriefOverlay.
// ---------------------------------------------------------------------------

function BriefMeButton({ eventId, onOpen }: { eventId: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onOpen();
        void fetch('/api/aion/telemetry/brief-open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId }),
        }).catch(() => {});
      }}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm',
        'text-[var(--stage-text-primary)] bg-[var(--stage-surface-elevated)]',
        'border border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.06)]',
        'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
      )}
      style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
      aria-label="Brief me on this show"
    >
      <Headphones size={14} aria-hidden />
      Brief me
    </button>
  );
}

// ---------------------------------------------------------------------------
// ScopedThread — fixed-height scroll region of message bubbles. Same shape as
// AionDealCard's ConversationThread, simplified for v1 (no thread title bar
// or new-chat / open-in-Aion controls — those land if usage justifies them).
// ---------------------------------------------------------------------------

function ScopedThread({ messages }: { messages: SessionMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (messages.length > 0) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length]);

  return (
    <div
      className="mt-3 pt-3 flex flex-col"
      style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}
    >
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

function MessageBubble({ message }: { message: SessionMessage }) {
  const isUser = message.role === 'user';
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
        {isUser ? message.content : <AionMarkdown content={message.content} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlanChatInput — same shape as AionDealCard's AionChatInput, scoped to this
// event. Every message implicitly carries the show's context.
// ---------------------------------------------------------------------------

function PlanChatInput({ onSend }: { onSend?: (content: string) => void }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setValue('');
  };

  const handleMicClick = () => {
    inputRef.current?.focus();
  };

  // Memoize placeholder so React doesn't re-render the input on every parent
  // tick (the prop reference is stable, not the string itself).
  const placeholder = useMemo(() => 'Ask Aion about this show…', []);

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
          placeholder={placeholder}
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
