'use client';

/**
 * AionDealCard — the Aion briefing surface on the deal detail page.
 *
 * Redesigned 2026-04-19 after 4-agent research (User Advocate, Critic, Field
 * Expert, Signal Navigator) stress-tested the initial narrative-first design.
 * Research findings reshaped five core decisions:
 *
 *   1. Narrative-first lost the information-architecture debate. Every shipped
 *      B2B AI card (Attio, Linear, Einstein, Granola, Superhuman, HubSpot)
 *      leads with action + one-line context + evidence on demand. Pure prose
 *      as the lead is a 2023 pattern that has cooled.
 *   2. One sentence of voice, not 2-3. Scanability + generation quality beat
 *      ambitious prose.
 *   3. Single primary CTA, no "also worth considering" link. Menus of actions
 *      transfer decision latency back to the user (NBA literature).
 *   4. Confidence lives in phrasing, not a dot. Drop ConfidenceDot.
 *   5. Third-person, no "I." No shipped product uses first-person AI
 *      recommendations; veteran owners react viscerally.
 *
 * Structure:
 *   Header       : AionMark + voice paragraph (1 sentence + optional memory cite)
 *   Primary CTA  : single boxed action — "Draft nudge for X" OR "Move to Y"
 *   Signals      : evidence list, compact, kind-agnostic for Phase 1
 *   Why this     : folded disclosure (Attio pattern) — opens priority breakdown
 *
 * Variants inherited from the prior build:
 *   - collapsed  → nothing renders
 *   - pipeline_only → PipelineCollapsedLine (single-line advance affordance)
 *   - archive context → outstanding-only, no voice
 */

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowRight, ChevronDown, ChevronUp, ExternalLink, MessageSquare, Mic, Plus, Sparkles } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Button } from '@/shared/ui/button';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { useSession, type Message as SessionMessage } from '@/shared/ui/providers/SessionContext';
import { useRequiredWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import type {
  AionCardData,
  OutboundRow,
  PipelineRow,
  PriorityBreakdown,
} from '../actions/get-aion-card-for-deal';
import { actOnFollowUp } from '../actions/follow-up-actions';
import {
  SectionHeader,
  SignalsList,
  WhyThisDisclosure,
  type SignalEntry,
} from './aion-card-primitives';
import { ProactiveLineContainer } from './proactive-line-pill';
import type { ProactiveLine } from '../actions/proactive-line-actions';
import { AionMarkdown } from '@/app/(dashboard)/(features)/aion/components/AionMarkdown';

// ---------------------------------------------------------------------------
// Types + public API
// ---------------------------------------------------------------------------

export type AionDealCardContext = 'deal_lens' | 'archive';

export type AionDealCardProps = {
  data: AionCardData;
  context?: AionDealCardContext;
  /** Display title stored on the scope-linked session at create time so the
   *  Aion-tab sidebar can label the thread meaningfully before the live
   *  header fetch resolves. Optional — falls back to "Deal" in the header. */
  dealTitle?: string | null;
  onAcceptAdvance?: (row: PipelineRow) => void;
  onDismissAdvance?: (row: PipelineRow) => void;
  /** Fired when the user clicks the Draft CTA — used for telemetry. The card
   *  opens its own inline composer in parallel. */
  onDraftNudge?: (row: OutboundRow) => void;
  /** Fired after a nudge is successfully logged via the inline composer, so
   *  the parent can refresh its Aion bundle (the outbound row goes acted). */
  onNudgeSubmitted?: () => void;
  onDismissNudge?: (row: OutboundRow) => void;
  onSnoozeNudge?: (row: OutboundRow, days: number) => void;
};

// Discriminator for the primary recommendation. Outbound-first bias matches
// User Advocate's mental model (relationship work > internal stage move).
type PrimaryRecommendation =
  | { kind: 'outbound'; row: OutboundRow }
  | { kind: 'pipeline'; row: PipelineRow };

// Chat conversation message shape — uses SessionContext's Message type so the
// card renders the same thread rows the Aion tab does. Role can be 'user' |
// 'assistant' | 'system'; the card's MessageBubble treats anything non-'user'
// as Aion-authored (visually identical to the legacy 'aion' literal).
export type AionChatMessage = SessionMessage;

/**
 * Simple tailwind-style breakpoint hook — mirrors `md:` (768) and `lg:` (1024)
 * so the living logo can size to viewport without duplicating SVG renders.
 */
function useBreakpoint(): 'mobile' | 'tablet' | 'desktop' {
  const [bp, setBp] = React.useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  React.useEffect(() => {
    const mqMd = window.matchMedia('(min-width: 768px)');
    const mqLg = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      if (mqLg.matches) setBp('desktop');
      else if (mqMd.matches) setBp('tablet');
      else setBp('mobile');
    };
    update();
    mqMd.addEventListener('change', update);
    mqLg.addEventListener('change', update);
    return () => {
      mqMd.removeEventListener('change', update);
      mqLg.removeEventListener('change', update);
    };
  }, []);
  return bp;
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function AionDealCard({
  data,
  context = 'deal_lens',
  dealTitle,
  onAcceptAdvance,
  onDismissAdvance,
  onDraftNudge,
  onNudgeSubmitted,
  onDismissNudge,
  onSnoozeNudge,
}: AionDealCardProps) {
  const bp = useBreakpoint();
  // Wire the card's chat surface to the unified session store
  // (cortex.aion_sessions scope='deal'). Messages rendered here are the same
  // rows that show up under the Aion-tab sidebar's "Deals" section — two
  // views into one thread. See docs/reference/aion-deal-chat-design.md §2.
  const workspaceId = useRequiredWorkspace();
  const {
    messages: sessionMessages,
    sessions: allSessions,
    currentSessionId,
    openScopedSession,
    createNewScopedChat,
    sendChatMessage,
  } = useSession();
  const [dealSessionId, setDealSessionId] = React.useState<string | null>(null);

  // Resume or create the deal-scoped session whenever the dealId changes.
  // openScopedSession is idempotent (cortex.resume_or_create_aion_session
  // returns the existing row when one is present), so remounting is cheap.
  // It also sets the session as current — the scope header picks that up.
  //
  // We pass the deal title so the sidebar's grouping label ("Alex &
  // Christine's Wedding") resolves immediately from the optimistic client
  // state. generate-title (see generate-title.ts) now treats a session
  // title that exactly matches the scope entity's title as a placeholder
  // and regenerates from conversation content after the first assistant
  // turn — so threads still get content-based titles while the group
  // header stays correct.
  React.useEffect(() => {
    let cancelled = false;
    openScopedSession({
      workspaceId,
      scopeType: 'deal',
      scopeEntityId: data.dealId,
      title: dealTitle ?? null,
    }).then((id) => {
      if (!cancelled && id) setDealSessionId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [data.dealId, workspaceId, dealTitle, openScopedSession]);

  // Only show thread messages once the async session open resolves AND the
  // current session matches — guards against flashing a prior session's
  // messages during the brief mount-to-resolve window.
  const messages: AionChatMessage[] =
    dealSessionId && currentSessionId === dealSessionId ? sessionMessages : [];

  const handleSendMessage = React.useCallback(
    (content: string) => {
      // Fire-and-forget — sendChatMessage handles streaming + persistence via
      // SessionContext. The user message and assistant reply both appear in
      // the thread via the shared session state.
      sendChatMessage({ text: content, workspaceId }).catch((err) => {
        console.error('[AionDealCard] sendChatMessage failed:', err);
        toast.error('Aion could not send that message. Try again.');
      });
    },
    [sendChatMessage, workspaceId],
  );

  // Spin up a fresh thread under the same deal scope. The new session becomes
  // current; the old one stays under Productions in the sidebar.
  // Title carries the deal name for sidebar grouping; generate-title will
  // replace it with a content-based title after the first assistant turn
  // (the title-matches-scope-entity guard allows replacement).
  const handleNewChatInScope = React.useCallback(async () => {
    const id = await createNewScopedChat({
      workspaceId,
      scopeType: 'deal',
      scopeEntityId: data.dealId,
      title: dealTitle ?? null,
    });
    if (id) setDealSessionId(id);
  }, [createNewScopedChat, workspaceId, data.dealId, dealTitle]);

  // Thread-title for the header bar above the scroll region. Until the title
  // generator fires (after first assistant turn), this falls back to "New
  // conversation" — matches ChatGPT's pre-title placeholder.
  const activeSessionMeta = React.useMemo(
    () => allSessions.find((s) => s.id === dealSessionId) ?? null,
    [allSessions, dealSessionId],
  );
  const threadTitle = activeSessionMeta?.title?.trim() || 'New conversation';

  // Collapsed state is persisted per-deal so each production remembers its
  // own open/closed preference. When the user minimizes chat on Ally &
  // Emily, they expect to find Aion closed there but still open on Corporate
  // Gala. Key is scoped by dealId; only runs client-side.
  const collapseStorageKey = `unusonic.aion_chat_collapsed.${data.dealId}`;
  const [isChatCollapsed, setIsChatCollapsed] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(collapseStorageKey) === 'true';
    } catch {
      return false;
    }
  });
  const toggleChatCollapsed = React.useCallback(() => {
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

  // Proactive-line "Ask Aion" handler. Click on the pill headline posts the
  // insight as a user message into the deal-scoped thread so Aion can riff on
  // it. Plan §3.2.4: "Click expands the thread with the insight auto-posted
  // as a system message to kick off a conversation about it."
  // We send as a user turn (not system) — feels more conversational and
  // reuses the existing sendChatMessage path.
  const handleAskAboutProactiveLine = React.useCallback(
    (line: ProactiveLine) => {
      if (isChatCollapsed) {
        setIsChatCollapsed(false);
        try {
          window.localStorage.setItem(collapseStorageKey, 'false');
        } catch {
          /* ignore */
        }
      }
      handleSendMessage(line.headline);
    },
    [isChatCollapsed, collapseStorageKey, handleSendMessage],
  );

  // Inline composer state — when set, the NudgeComposer renders below the
  // footer CTAs with the row's suggested channel preselected.
  const [draftingRow, setDraftingRow] = React.useState<OutboundRow | null>(null);
  const handleStartDraft = React.useCallback(
    (row: OutboundRow) => {
      // Preserve existing telemetry hook so the parent still logs the event.
      onDraftNudge?.(row);
      setDraftingRow(row);
    },
    [onDraftNudge],
  );
  const handleComposerSubmitted = React.useCallback(() => {
    setDraftingRow(null);
    onNudgeSubmitted?.();
  }, [onNudgeSubmitted]);
  // Suppress: all events in the past → card must not render on live deal page
  if (data.suppress && context !== 'archive') return null;

  const pipelineRows = context === 'archive' ? [] : data.pipelineRows;
  const outboundRows = data.outboundRows;

  const hasOutbound = outboundRows.length > 0;
  const hasPipeline = pipelineRows.length > 0;

  // Archive + no outbound = nothing to show
  if (context === 'archive' && !hasOutbound) return null;

  // Collapsed variant
  if (data.variant === 'collapsed' || (!hasOutbound && !hasPipeline)) return null;

  // Pipeline-only (no outbound) → single-line advance affordance, no briefing
  if (data.variant === 'pipeline_only' && hasPipeline && !hasOutbound) {
    return (
      <PipelineCollapsedLine
        row={pipelineRows[0]}
        onAccept={() => onAcceptAdvance?.(pipelineRows[0])}
        onDismiss={() => onDismissAdvance?.(pipelineRows[0])}
      />
    );
  }

  // Archive context renders the outstanding list without the briefing frame.
  if (context === 'archive') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={STAGE_MEDIUM}
      >
        <StagePanel elevated padding="md" className="space-y-3">
          <SectionHeader>Outstanding</SectionHeader>
          <ul className="space-y-1.5">
            {outboundRows.map((row) => (
              <li key={row.followUpId}>
                <ArchiveOutboundRow
                  row={row}
                  onDraft={() => handleStartDraft(row)}
                  onDismiss={() => onDismissNudge?.(row)}
                  onSnooze={(days) => onSnoozeNudge?.(row, days)}
                />
              </li>
            ))}
          </ul>
          <AnimatePresence>
            {draftingRow && (
              <NudgeComposer
                row={draftingRow}
                onCancel={() => setDraftingRow(null)}
                onSubmitted={handleComposerSubmitted}
              />
            )}
          </AnimatePresence>
        </StagePanel>
      </motion.div>
    );
  }

  // Live briefing: pick ONE primary recommendation.
  const primary: PrimaryRecommendation | null = hasOutbound
    ? { kind: 'outbound', row: outboundRows[0] }
    : hasPipeline
      ? { kind: 'pipeline', row: pipelineRows[0] }
      : null;

  if (!primary) return null;

  const signals = composeSignals({ data, primary });
  const breakdown =
    primary.kind === 'outbound'
      ? primary.row.priorityBreakdown
      : primary.row.priorityBreakdown;
  const cadenceTooltip = primary.kind === 'outbound' ? data.cadenceTooltip : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
    >
      <StagePanel elevated padding="md">
        {/* Mobile identity row — logo + label horizontal at the top when
            the two-column layout collapses on narrow viewports. */}
        {bp === 'mobile' && (
          <div className="flex items-center gap-2 mb-3">
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
        )}

        {/* Briefing region — two-column on md+, single column on mobile. */}
        <div className="flex flex-col md:flex-row md:items-stretch md:gap-5">
          {/* Left column — hidden on mobile (identity rendered above) */}
          {bp !== 'mobile' && (
            <div className="shrink-0 flex flex-col items-center w-[72px] lg:w-[88px]">
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
                <AionMark size={bp === 'tablet' ? 56 : 72} status="loading" />
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col">
            <TopBar data={data} />

            <div className="space-y-3 max-w-[640px] mt-3">
              <ProactiveLineContainer
                dealId={data.dealId}
                onAsk={handleAskAboutProactiveLine}
              />
              <VoiceParagraph voice={data.voice} />
              <SignalsList signals={signals} />
              <WhyThisDisclosure
                breakdown={breakdown}
                cadenceTooltip={cadenceTooltip}
              />
            </div>
          </div>
        </div>

        {/* Conversation zone — renders when messages exist AND chat is not
            collapsed. Header bar shows the thread title (auto-generated
            after first assistant turn) plus controls for spawning a fresh
            thread in this deal scope and for opening the current thread in
            the full /aion view. */}
        {!isChatCollapsed && (
          <ConversationThread
            messages={messages}
            threadTitle={threadTitle}
            sessionId={dealSessionId}
            onNewChat={handleNewChatInScope}
            onCollapse={toggleChatCollapsed}
          />
        )}

        {/* Collapsed-chat row — a single-line "Open chat" pill that replaces
            the input + thread. Clicking it restores the full chat. Primary
            CTAs in FooterActions below stay visible either way. */}
        {isChatCollapsed ? (
          <div
            className="mt-3 pt-3 flex items-center justify-between gap-2"
            style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}
          >
            <button
              type="button"
              onClick={toggleChatCollapsed}
              className={cn(
                'flex-1 flex items-center justify-between gap-2 rounded-md px-3 py-1.5',
                'bg-[var(--ctx-well)] border border-[var(--stage-edge-subtle)]',
                'text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
                'hover:border-[var(--stage-accent)] transition-colors duration-[80ms]',
              )}
              aria-label="Open Aion chat"
            >
              <span className="flex items-center gap-2 min-w-0">
                <AionMark size={14} status="ambient" />
                <span className="truncate">
                  {messages.length > 0
                    ? `Aion chat · ${messages.length} message${messages.length === 1 ? '' : 's'}`
                    : 'Ask Aion'}
                </span>
              </span>
              <ChevronUp size={12} strokeWidth={1.5} aria-hidden />
            </button>
            <div className="flex items-center justify-end gap-2 shrink-0">
              <FooterActions
                primary={primary}
                outboundRow={hasOutbound ? outboundRows[0] : null}
                pipelineRow={hasPipeline ? pipelineRows[0] : null}
                onAcceptAdvance={(row) => onAcceptAdvance?.(row)}
                onDraftNudge={handleStartDraft}
              />
            </div>
          </div>
        ) : (
        <div
          className="mt-3 pt-3 flex flex-col md:flex-row md:items-center gap-2"
          style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}
        >
          <AionChatInput onSend={handleSendMessage} />
          <div className="flex items-center justify-end gap-2">
            <FooterActions
              primary={primary}
              outboundRow={hasOutbound ? outboundRows[0] : null}
              pipelineRow={hasPipeline ? pipelineRows[0] : null}
              onAcceptAdvance={(row) => onAcceptAdvance?.(row)}
              onDraftNudge={handleStartDraft}
            />
          </div>
        </div>
        )}

        {/* Inline nudge composer — appears when Draft is clicked. Logs the
            nudge via actOnFollowUp which flips the follow_up_queue item to
            status=acted and writes a follow_up_log row. No email/SMS sending
            here yet — phase 2 wires Resend/Twilio. */}
        <AnimatePresence>
          {draftingRow && (
            <NudgeComposer
              row={draftingRow}
              onCancel={() => setDraftingRow(null)}
              onSubmitted={handleComposerSubmitted}
            />
          )}
        </AnimatePresence>
      </StagePanel>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Header — AionMark + voice paragraph
// ---------------------------------------------------------------------------

// VoiceParagraph — Aion's narrative, prose-only. Identity lives in the TopBar.
function VoiceParagraph({ voice }: { voice: string }) {
  if (!voice) return null;
  return (
    <p
      className="leading-snug"
      style={{
        fontSize: '15px',
        color: 'var(--stage-text-primary)',
      }}
    >
      {voice}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Snapshot strip — key deal facts above the voice
// ---------------------------------------------------------------------------

// TopBar — Aion identity on the far left, snapshot chips on the same row.
// Reads as: [◈ AION] │ STAGE …  │ EVENT …  │ SERIES …
function TopBar({ data }: { data: AionCardData }) {
  const chips: Array<{ label: string; value: string }> = [];

  if (data.stall?.stageLabel) {
    const dwell = data.stall.daysInStage;
    const rot = data.stall.stageRottingDays;
    const dwellText = dwell != null
      ? (rot != null && dwell >= rot ? `${dwell}d · past rot` : `${dwell}d`)
      : null;
    chips.push({
      label: 'Stage',
      value: dwellText ? `${data.stall.stageLabel} · ${dwellText}` : data.stall.stageLabel,
    });
  }

  if (data.urgency.date) {
    const eventDate = formatShortDate(data.urgency.date);
    const daysOut = data.urgency.daysOut;
    chips.push({
      label: 'Event',
      value: daysOut != null
        ? `${eventDate} · ${daysOut}d out`
        : eventDate,
    });
  }

  if (data.urgency.isSeries && data.urgency.totalShows > 0) {
    chips.push({
      label: 'Series',
      value: `${data.urgency.totalShows} show${data.urgency.totalShows === 1 ? '' : 's'}`,
    });
  }

  if (chips.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1"
      style={{ fontSize: '11px' }}
    >
      {chips.map((chip, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span
              aria-hidden
              className="select-none"
              style={{ color: 'var(--stage-edge-subtle)' }}
            >
              │
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span
              className="stage-label tracking-wide uppercase"
              style={{ color: 'var(--stage-text-tertiary, var(--stage-text-secondary))' }}
            >
              {chip.label}
            </span>
            <span style={{ color: 'var(--stage-text-secondary)' }}>{chip.value}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Conversation thread — renders user/Aion messages as they accumulate.
// Empty by default; appears above the input footer once messages exist.
// Scrolls internally at max-h to keep the card's overall height bounded.
// Backend wiring persists thread state (deal diary) separately.
// ---------------------------------------------------------------------------

function ConversationThread({
  messages,
  threadTitle,
  sessionId,
  onNewChat,
  onCollapse,
}: {
  messages: AionChatMessage[];
  threadTitle: string;
  /** Current session id — powers the "Open in Aion" deep-link. NULL during
   *  the brief mount window before openScopedSession resolves. */
  sessionId: string | null;
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
          aria-label="New chat about this production"
          title="New chat about this production"
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

function AionChatInput({
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

function FooterActions({
  primary,
  outboundRow,
  pipelineRow,
  onAcceptAdvance,
  onDraftNudge,
}: {
  primary: PrimaryRecommendation;
  outboundRow: OutboundRow | null;
  pipelineRow: PipelineRow | null;
  onAcceptAdvance: (row: PipelineRow) => void;
  onDraftNudge: (row: OutboundRow) => void;
}) {
  // When both kinds of recommendation exist for this deal, render them as
  // co-equal peers by intent (NBA research: two actions labeled by intent,
  // not primary/alternative). Secondary gets variant="secondary" (matte);
  // the primary action — picked by outbound-first bias — keeps
  // variant="default" (bright accent).
  const hasBoth = outboundRow != null && pipelineRow != null;

  if (hasBoth) {
    // Primary is outbound-first per composer bias. Secondary is the other.
    const secondaryIsPipeline = primary.kind === 'outbound';

    return (
      <>
        {secondaryIsPipeline && pipelineRow ? (
          <PipelineButton
            row={pipelineRow}
            variant="secondary"
            onClick={() => onAcceptAdvance(pipelineRow)}
          />
        ) : outboundRow ? (
          <OutboundButton
            row={outboundRow}
            variant="secondary"
            onClick={() => onDraftNudge(outboundRow)}
          />
        ) : null}
        <PrimaryCta
          primary={primary}
          onAcceptAdvance={onAcceptAdvance}
          onDraftNudge={onDraftNudge}
        />
      </>
    );
  }

  return (
    <PrimaryCta
      primary={primary}
      onAcceptAdvance={onAcceptAdvance}
      onDraftNudge={onDraftNudge}
    />
  );
}

// ---------------------------------------------------------------------------
// Button helpers — used by both PrimaryCta and the secondary footer slot
// ---------------------------------------------------------------------------

function OutboundButton({
  row,
  variant,
  onClick,
}: {
  row: OutboundRow;
  variant: 'default' | 'secondary';
  onClick: () => void;
}) {
  const channel = row.suggestedChannel;
  const ctaLabel =
    channel === 'sms' ? 'Draft a text'
      : channel === 'phone' ? 'Log a call'
        : 'Draft nudge';
  return (
    <Button variant={variant} size="sm" onClick={onClick}>
      <MessageSquare className="size-3.5" />
      {ctaLabel}
    </Button>
  );
}

function PipelineButton({
  row,
  variant,
  onClick,
}: {
  row: PipelineRow;
  variant: 'default' | 'secondary';
  onClick: () => void;
}) {
  const stageLabel = humanizeStageTag(row.suggestedStageTag ?? '') || 'next stage';
  return (
    <Button variant={variant} size="sm" onClick={onClick}>
      Move to {stageLabel}
      <ArrowRight className="size-3.5" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Primary CTA — the bright accent action (always variant="default")
// ---------------------------------------------------------------------------

function PrimaryCta({
  primary,
  onAcceptAdvance,
  onDraftNudge,
}: {
  primary: PrimaryRecommendation;
  onAcceptAdvance: (row: PipelineRow) => void;
  onDraftNudge: (row: OutboundRow) => void;
}) {
  if (primary.kind === 'outbound') {
    return (
      <OutboundButton
        row={primary.row}
        variant="default"
        onClick={() => onDraftNudge(primary.row)}
      />
    );
  }
  return (
    <PipelineButton
      row={primary.row}
      variant="default"
      onClick={() => onAcceptAdvance(primary.row)}
    />
  );
}

// ---------------------------------------------------------------------------
// Collapsed-line variant (Pipeline only, no stall)
// ---------------------------------------------------------------------------

function PipelineCollapsedLine({
  row,
  onAccept,
  onDismiss,
}: {
  row: PipelineRow;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const stageLabel = humanizeStageTag(row.suggestedStageTag ?? '') || 'next stage';
  const ctaLabel = `Move to ${stageLabel}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-2',
        'bg-[var(--ctx-card)]',
        'shadow-[inset_0_0_0_1px_var(--stage-edge-subtle)]',
      )}
    >
      <span
        className="truncate"
        style={{
          fontSize: 'var(--stage-text-body, 13px)',
          color: 'var(--stage-text-secondary)',
        }}
      >
        {row.title}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="secondary" size="sm" onClick={onAccept}>
          {ctaLabel}
        </Button>
        <button
          type="button"
          aria-label="Not yet"
          onClick={onDismiss}
          className="text-xs text-[var(--stage-text-secondary)] hover:underline underline-offset-2 px-2"
        >
          Not yet
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Archive context row — compact outbound-only listing
// ---------------------------------------------------------------------------

function ArchiveOutboundRow({
  row,
  onDraft,
  onDismiss,
  onSnooze,
}: {
  row: OutboundRow;
  onDraft: () => void;
  onDismiss: () => void;
  onSnooze: (days: number) => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const channel = row.suggestedChannel;
  const ctaLabel = channel === 'sms' ? 'Draft a text'
    : channel === 'phone' ? 'Log a call'
      : 'Draft nudge';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-2',
        'bg-[var(--ctx-card)]',
        'shadow-[inset_0_0_0_1px_var(--stage-edge-subtle)]',
      )}
    >
      <span
        className="truncate"
        style={{ fontSize: 'var(--stage-text-body, 13px)' }}
      >
        {row.reasonLabel}
      </span>

      <div className="flex items-center gap-2 shrink-0">
        <Button variant="secondary" size="sm" onClick={onDraft}>
          <MessageSquare className="size-3.5" />
          {ctaLabel}
        </Button>

        <div className="relative">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="More actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="text-[var(--stage-text-secondary)]"
          >
            <span aria-hidden className="text-sm leading-none">⋯</span>
          </Button>
          {menuOpen && (
            <ActionMenu
              onDismiss={() => { setMenuOpen(false); onDismiss(); }}
              onSnooze={(days) => { setMenuOpen(false); onSnooze(days); }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ActionMenu({
  onDismiss,
  onSnooze,
  onClose,
}: {
  onDismiss: () => void;
  onSnooze: (days: number) => void;
  onClose: () => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        'absolute right-0 top-full mt-1 z-20 min-w-36 rounded-md p-1',
        'bg-[var(--stage-surface-raised)] border border-[var(--stage-edge-subtle)]',
        'shadow-lg text-xs',
      )}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => onSnooze(3)}
        className="block w-full text-left px-2 py-1 rounded-sm hover:bg-[var(--stage-surface)]"
      >
        Snooze 3 days
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => onSnooze(7)}
        className="block w-full text-left px-2 py-1 rounded-sm hover:bg-[var(--stage-surface)]"
      >
        Snooze 7 days
      </button>
      <hr className="my-1 border-[var(--stage-edge-subtle)]" />
      <button
        type="button"
        role="menuitem"
        onClick={onDismiss}
        className="block w-full text-left px-2 py-1 rounded-sm hover:bg-[var(--stage-surface)] text-[var(--stage-text-secondary)]"
      >
        Dismiss
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NudgeComposer — inline composer that opens when the user clicks the Draft
// CTA. Phase 1: logs the nudge as sent manually via actOnFollowUp (writes a
// follow_up_log row + flips the queue item to 'acted'). Phase 2 will wire
// email/SMS sending through Resend/Twilio so "Send" actually dispatches.
// ---------------------------------------------------------------------------

type NudgeChannel = 'email' | 'sms' | 'call';

function resolveInitialChannel(row: OutboundRow): NudgeChannel {
  const c = (row.suggestedChannel ?? '').toLowerCase();
  if (c === 'phone' || c === 'call') return 'call';
  if (c === 'sms' || c === 'text') return 'sms';
  return 'email';
}

function NudgeComposer({
  row,
  onCancel,
  onSubmitted,
}: {
  row: OutboundRow;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const [channel, setChannel] = React.useState<NudgeChannel>(() => resolveInitialChannel(row));
  const [message, setMessage] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!message.trim()) {
      toast.error('Add a message or call summary first.');
      return;
    }
    setSubmitting(true);
    try {
      const actionType =
        channel === 'email' ? 'email_sent' : channel === 'sms' ? 'sms_sent' : 'call_logged';
      const res = await actOnFollowUp(
        row.followUpId,
        actionType,
        channel === 'call' ? 'call' : channel,
        undefined,
        message.trim(),
      );
      if (!res.success) {
        toast.error(res.error ?? 'Could not log nudge.');
        return;
      }
      toast.success(channel === 'call' ? 'Call logged.' : 'Nudge logged.');
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel =
    channel === 'call' ? 'Log call' : channel === 'sms' ? 'Log text' : 'Log email';

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={STAGE_MEDIUM}
      className="overflow-hidden"
    >
      <div
        className="mt-3 p-3 rounded-lg flex flex-col gap-2"
        style={{
          border: '1px solid var(--stage-edge-subtle)',
          background: 'var(--ctx-well)',
        }}
        data-surface="well"
      >
        <div className="flex items-center gap-1">
          {(['email', 'sms', 'call'] as const).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannel(ch)}
              disabled={submitting}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs transition-colors',
                channel === ch
                  ? 'text-[var(--stage-text-primary)] bg-[oklch(1_0_0_/_0.10)]'
                  : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
              )}
            >
              {ch === 'email' ? 'Email' : ch === 'sms' ? 'Text' : 'Call'}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            channel === 'call'
              ? 'Summary of the call…'
              : channel === 'sms'
                ? 'What did you text?'
                : 'What did you send?'
          }
          rows={3}
          disabled={submitting}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          className="w-full bg-transparent text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] resize-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-md p-1"
        />

        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[11px]"
            style={{ color: 'var(--stage-text-tertiary)' }}
          >
            Logs as sent manually. Sending via Resend/Twilio comes next.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] px-2 py-1 transition-colors"
            >
              Cancel
            </button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Logging…' : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Signals composer — derive a short evidence list from available data.
// Phase 1: uses what today's composer already ships (reason label, lastTouchAt,
// cadenceTooltip, voice signals). Phase 2 will replace with a richer
// source-bound signals array produced by the server composer.
// ---------------------------------------------------------------------------

function composeSignals({
  data,
  primary,
}: {
  data: AionCardData;
  primary: PrimaryRecommendation;
}): SignalEntry[] {
  const out: SignalEntry[] = [];

  // Primary recommendation's own evidence first.
  if (primary.kind === 'outbound') {
    if (primary.row.reasonLabel) {
      out.push({ label: 'Status', value: primary.row.reasonLabel, kind: 'context' });
    }
    if (primary.row.lastTouchAt) {
      const days = daysSince(primary.row.lastTouchAt);
      if (days != null) {
        out.push({
          label: 'No reply since',
          value: formatRelativeDate(primary.row.lastTouchAt, days),
          kind: 'timing',
        });
      }
    }
  } else if (primary.row.title) {
    out.push({ label: 'Ready for', value: primary.row.title, kind: 'context' });
  }

  // Stall context — "4d in stage (past 7d rot threshold)"
  if (data.stall?.daysInStage != null) {
    const dwell = data.stall.daysInStage;
    const rot = data.stall.stageRottingDays;
    const value = rot != null && dwell >= rot
      ? `${dwell}d · past ${rot}d rot threshold`
      : `${dwell}d`;
    out.push({ label: 'Stage dwell', value, kind: 'timing' });
  }

  // Cadence profile — "You typically follow up every 3-5 days"
  if (data.cadence?.typicalDaysBetweenFollowups != null) {
    out.push({
      label: 'Your cadence',
      value: `every ${data.cadence.typicalDaysBetweenFollowups}d between touches`,
      kind: 'behavior',
    });
  } else if (data.cadenceTooltip) {
    // Fallback: use the prebuilt tooltip when the numeric profile isn't present.
    out.push({ label: 'Cadence', value: data.cadenceTooltip, kind: 'behavior' });
  }

  // Event approach — "38 days out" (only if not already in the snapshot strip
  // i.e. suppress when we have the full date, since the strip carries it)
  if (data.urgency.daysOut != null && data.urgency.daysOut <= 14) {
    // Only surface when imminent — the snapshot strip covers the far-out case.
    out.push({
      label: 'Event',
      value: `${data.urgency.daysOut} day${data.urgency.daysOut === 1 ? '' : 's'} out`,
      kind: 'timing',
    });
  }

  // voiceSignals dedupe — skip slug-shaped entries (they're machine flags,
  // not display-ready). Only human-case strings get surfaced.
  for (const sig of data.voiceSignals) {
    if (/[A-Z]|[ ]/.test(sig) && !out.some((e) => e.value === sig)) {
      out.push({ label: 'Signal', value: sig, kind: 'context' });
      if (out.length >= 5) break;
    }
  }

  return out.slice(0, 5);
}

function daysSince(iso: string): number | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (24 * 60 * 60 * 1000)));
}

function formatRelativeDate(iso: string, days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) {
    const weekday = new Date(iso).toLocaleDateString('en-US', { weekday: 'long' });
    return `${weekday} (${days}d ago)`;
  }
  return `${days} days ago`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanizeStageTag(tag: string): string {
  const map: Record<string, string> = {
    proposal_sent: 'Proposal',
    contract_out: 'Contract',
    contract_signed: 'Contract Signed',
    deposit_received: 'Deposit Received',
    ready_for_handoff: 'Handoff',
    won: 'Won',
  };
  return map[tag] ?? tag.replace(/_/g, ' ');
}

// Silence unused-type warning when PriorityBreakdown import is only used
// transitively via the row types. Keeps the import graph explicit.
export type { PriorityBreakdown };
