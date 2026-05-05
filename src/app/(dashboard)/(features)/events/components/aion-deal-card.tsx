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
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ChevronUp, History } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { useRequiredWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import type {
  AionCardData,
  OutboundRow,
  PipelineRow,
  PriorityBreakdown,
} from '../actions/get-aion-card-for-deal';
import {
  SectionHeader,
  SignalsList,
  WhyThisDisclosure,
} from './aion-card-primitives';
import { ProactiveLineContainer } from './proactive-line-pill';
import type { ProactiveLine } from '../actions/proactive-line-actions';
import { PillUnseenDot } from '@/app/(dashboard)/(features)/aion/components/PillUnseenDot';
import {
  getActiveSignalDisablesForWorkspace,
  getUnseenPillCountsForDeals,
} from '@/app/(dashboard)/(features)/aion/actions/pill-history-actions';
import type { AionChatMessage, PrimaryRecommendation } from './aion-deal-card/types';
import { composeSignals } from './aion-deal-card/signals';
import {
  ConversationThread,
  AionChatInput,
} from './aion-deal-card/conversation-thread';
import {
  FooterActions,
  PipelineCollapsedLine,
  ArchiveOutboundRow,
} from './aion-deal-card/footer-actions';
import { NudgeComposer } from './aion-deal-card/nudge-composer';

// Lazy-load the pill-history Sheet — keeps Prism mount budget unchanged
// (design §4.1). Only fetches when the user actually opens History.
const PillHistorySheet = dynamic(
  () => import('@/app/(dashboard)/(features)/aion/components/PillHistorySheet').then((m) => m.PillHistorySheet),
  { ssr: false },
);

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
// PrimaryRecommendation + AionChatMessage moved to ./aion-deal-card/types
// (Phase 0.5-style split, 2026-04-28). Re-exported above for callers that
// historically imported them from this file.
export type { AionChatMessage };

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

// React.memo wrapper at the bottom of the file — see end. AionDealCard is
// the heaviest ambient panel and re-rendering it on every parent keystroke
// is wasted work. Default shallow equality is sufficient here — props are
// scalar values + a small set of callbacks (which the parent should be
// stabilizing via useCallback).
function AionDealCardImpl({
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
    isLoadingSession,
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

  // Pill-history Sheet — Wk 10 D7. Lazy-loaded; the muted-indicator dot on
  // the History button signals an active workspace disable so owners can
  // discover the Resurface affordance without opening blind.
  const [historySheetOpen, setHistorySheetOpen] = React.useState(false);
  const [hasMutedSignal, setHasMutedSignal] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    getActiveSignalDisablesForWorkspace(workspaceId)
      .then((r) => { if (!cancelled) setHasMutedSignal(r.rows.length > 0); })
      .catch(() => { if (!cancelled) setHasMutedSignal(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  // Wk 10 D7 — chat-collapsed unseen-pill dot. Reuses the bulk-fetch action
  // with a single-deal payload so this code path stays canonical even though
  // the card is rendered one-deal-at-a-time. The Sheet stamps seen on every
  // visible row when opened, so closing the Sheet flips this back to false
  // on the next refetch trigger (history sheet open/close).
  const [hasUnseenPill, setHasUnseenPill] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    getUnseenPillCountsForDeals([data.dealId])
      .then((counts) => {
        if (!cancelled) setHasUnseenPill((counts[data.dealId] ?? 0) > 0);
      })
      .catch(() => { if (!cancelled) setHasUnseenPill(false); });
    return () => { cancelled = true; };
    // Refetch when the history sheet closes — markPillSeen runs on open, so
    // the unseen count drops to zero by the time the user dismisses the Sheet.
  }, [data.dealId, historySheetOpen]);

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

  // No outbound and no pipeline → render the quiet "watching" empty state
  // instead of nothing, so users on a fresh deal know Aion is here even
  // though there's nothing actionable yet. Without this, brand-new deals
  // looked like "Aion is broken on this deal" — confusing UX.
  if (data.variant === 'collapsed' || (!hasOutbound && !hasPipeline)) {
    return <AionEmptyCard data={data} dealTitle={dealTitle} />;
  }

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
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <TopBar data={data} />
              </div>
              <button
                type="button"
                onClick={() => setHistorySheetOpen(true)}
                aria-label={hasMutedSignal ? 'Pill history (signals paused)' : 'Pill history'}
                title={hasMutedSignal ? 'History — signals paused' : 'History'}
                className={cn(
                  'shrink-0 flex items-center gap-1 rounded-[4px] px-1.5 py-0.5',
                  'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
                  'hover:bg-[oklch(1_0_0_/_0.06)]',
                  'transition-colors duration-[80ms]',
                  'focus:outline-none focus-visible:text-[var(--stage-text-primary)]',
                )}
              >
                <History size={13} strokeWidth={1.5} aria-hidden />
                <span className="text-[0.72rem]">History</span>
                <PillUnseenDot
                  show={hasMutedSignal}
                  ariaLabel="One or more signals are paused"
                  size={6}
                />
              </button>
            </div>

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
            isLoadingSession={isLoadingSession}
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
                <PillUnseenDot
                  show={hasUnseenPill}
                  ariaLabel="Unseen Aion pill on this deal"
                  size={7}
                />
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

      {historySheetOpen && (
        <PillHistorySheet
          open={historySheetOpen}
          onOpenChange={setHistorySheetOpen}
          dealId={data.dealId}
          workspaceId={workspaceId}
        />
      )}
    </motion.div>
  );
}

export const AionDealCard = React.memo(AionDealCardImpl);

// ---------------------------------------------------------------------------
// Header — AionMark + voice paragraph
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AionEmptyCard — quiet "watching" state for deals with no signals yet
// ---------------------------------------------------------------------------
// Rendered when the deal has zero outbound follow-ups and zero pipeline
// suggestions (variant === 'collapsed'). Without this, new deals looked
// like "Aion is broken" — silent omission was confusing UX. The empty
// state explains what Aion is doing right now and sets expectations.
//
// Copy is stage-aware: a fresh inquiry gets different language than a
// deal post-handoff. All variants share the same structure (AionMark + one
// quiet sentence) so the visual identity is consistent.
function AionEmptyCard({
  data,
  dealTitle,
}: {
  data: AionCardData;
  dealTitle?: string | null;
}) {
  const bp = useBreakpoint();
  const stageLabel = data.stall?.stageLabel ?? null;
  const daysOut = data.urgency.daysOut;
  const message = composeAionEmptyMessage(stageLabel, daysOut);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
    >
      <StagePanel elevated padding="md">
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
        <div className="flex flex-col md:flex-row md:items-center md:gap-5">
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
          <div className="flex-1 min-w-0">
            <p
              className="leading-snug"
              style={{
                fontSize: '14px',
                color: 'var(--stage-text-secondary)',
                fontStyle: 'italic',
              }}
            >
              {message}
            </p>
            {dealTitle && (
              <p
                className="mt-2 stage-label tracking-wide uppercase"
                style={{
                  fontSize: '10px',
                  color: 'var(--stage-text-tertiary)',
                }}
              >
                Watching {dealTitle}
              </p>
            )}
          </div>
        </div>
      </StagePanel>
    </motion.div>
  );
}

/** Pure copy logic for the empty state. Stage-aware so the message reads
 *  like Aion knows where the deal is. Intentionally short, declarative,
 *  no exclamation. */
function composeAionEmptyMessage(
  stageLabel: string | null,
  daysOut: number | null,
): string {
  const stage = (stageLabel ?? '').toLowerCase();

  // Late-stage / progressing deals — owner has done the work, just watching.
  if (stage.includes('contract') || stage.includes('signed') || stage.includes('deposit') || stage.includes('won')) {
    if (daysOut != null && daysOut > 0 && daysOut <= 30) {
      return `Quiet for now — deal's progressing. I'll flag anything that needs attention before show day.`;
    }
    return `Quiet for now — deal's progressing. I'll flag if anything stalls.`;
  }

  // Proposal-sent stages — waiting on client engagement.
  if (stage.includes('proposal') || stage.includes('sent')) {
    return `Waiting on the client. I'll surface follow-up timing if it goes quiet.`;
  }

  // Inquiry / pre-proposal — fresh deal, no proposal yet.
  if (stage.includes('inquiry') || stage.includes('initial') || stage.includes('lead')) {
    return `No nudges yet — once you send a proposal, I'll surface follow-up timing and flag anything important.`;
  }

  // Generic fallback — covers unknown stage names and freshly-created deals.
  return `Watching this deal. I'll surface anything important as it develops.`;
}

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

// Silence unused-type warning when PriorityBreakdown import is only used
// transitively via the row types. Keeps the import graph explicit.
export type { PriorityBreakdown };
