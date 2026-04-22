'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Copy, Check, PanelLeft, ChevronDown, Square, ThumbsUp, ThumbsDown, Pencil, RotateCw, Sparkles, Zap, Brain } from 'lucide-react';
import { useSession } from '@/shared/ui/providers/SessionContext';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { AionInput } from '@/app/(dashboard)/(features)/aion/components/AionInput';
import type { AionChatResponse, SuggestionChip, AionModelMode } from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { AionMessageRenderer } from './AionMessageRenderer';
import type { DraftEditedData } from './DraftPreviewCard';
import { AionThinkingSteps } from './AionThinkingSteps';
import { AionMarkdown } from './AionMarkdown';
import { AionSidebar } from './AionSidebar';
import { ChatScopeHeader } from './ChatScopeHeader';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { usePageContextStore } from '@/shared/lib/page-context-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_CHIPS = [
  { label: 'Draft a follow-up', value: 'Help me draft a follow-up message' },
  { label: 'Review my queue', value: 'Show my follow-up queue' },
  { label: 'Prep for a call', value: 'Help me prepare for my next call' },
];

const SIDEBAR_STORAGE_KEY = 'unusonic.aion_sidebar_open';

// ---------------------------------------------------------------------------
// Date separator helper
// ---------------------------------------------------------------------------

function formatDateLabel(date: Date): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function shouldShowDateSeparator(messages: Array<{ id: string; timestamp: string }>, idx: number): string | null {
  const current = Number(messages[idx].id);
  if (isNaN(current)) return idx === 0 ? 'Today' : null;

  const currentDate = new Date(current);

  if (idx === 0) return formatDateLabel(currentDate);

  const prev = Number(messages[idx - 1].id);
  if (isNaN(prev)) return null;

  const prevDate = new Date(prev);
  if (currentDate.toDateString() !== prevDate.toDateString()) {
    return formatDateLabel(currentDate);
  }
  return null;
}

// ---------------------------------------------------------------------------
// ChatInterface
// ---------------------------------------------------------------------------

interface ChatInterfaceProps {
  viewState?: 'overview' | 'chat';
  onInteraction?: () => void;
  workspaceId?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ viewState, workspaceId }) => {
  const {
    messages, isLoading, addMessage, startNewChat, setWorkspaceId,
    sendChatMessage, sendMessage, sessions, currentSessionId, selectSession,
    removeSession, createNewScopedChat,
    pinSession, unpinSession, archiveSession, continueSessionInNewChat,
    editAndResend, retryLastMessage, cancelStreaming, streamingMessageId, activeToolLabel,
    modelMode, setModelMode,
  } = useSession();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const initFetched = useRef(false);
  const [initError, setInitError] = useState(false);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) return stored === 'true';
    return window.innerWidth >= 1024;
  });

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // [ — toggle sidebar (not in inputs)
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !inInput) {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Escape — clear input or cancel edit
      if (e.key === 'Escape') {
        if (editingMsgId) {
          setEditingMsgId(null);
          setEditText('');
          return;
        }
        if (inInput && input.trim()) {
          setInput('');
          return;
        }
      }

      // Cmd+Shift+A — focus Aion input
      if (e.key === 'a' && e.metaKey && e.shiftKey) {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSidebar, editingMsgId, input]);

  // Scroll detection
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handler = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setIsScrolledUp(distFromBottom > 120);
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setInput(e.target.value);

  useEffect(() => {
    if (workspaceId) setWorkspaceId(workspaceId);
  }, [workspaceId, setWorkspaceId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Init greeting — fires at most ONCE per session per tab.
  //
  // Prior bug (2026-04-22): every time ChatInterface remounted (e.g. after
  // navigating to a citation pill's destination and returning to /aion),
  // `initFetched` reset to false and a fresh greeting was posted — even when
  // the session already had history. In one session owners saw the "You have
  // N deals..." greeting stack 3+ times.
  //
  // Dedup strategy: sessionStorage key per (session|default). Once greeted,
  // we don't greet that session again in this tab. Clears naturally on tab
  // close — a new tab on the same session gets one fresh greeting, which is
  // correct.
  useEffect(() => {
    if (!workspaceId || messages.length > 0 || initFetched.current) return;
    const greetedKey = `unusonic.aion_greeted.${currentSessionId || 'default'}`;
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(greetedKey) === '1') {
      // Already greeted this session in this tab — skip. Don't reset
      // initFetched so the effect doesn't keep re-checking.
      initFetched.current = true;
      return;
    }
    initFetched.current = true;
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(greetedKey, '1');
    }
    setInitError(false);
    fetch('/api/aion/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [], workspaceId, pageContext: (() => {
        const ctx = usePageContextStore.getState();
        return ctx.type ? { type: ctx.type, entityId: ctx.entityId, label: ctx.label, secondaryId: ctx.secondaryId, secondaryType: ctx.secondaryType } : undefined;
      })() }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('greeting fetch failed');
        return res.json();
      })
      .then((data: AionChatResponse) => {
        const textContent = data.messages.filter((m) => m.type === 'text').map((m) => m.text).join('\n');
        addMessage('assistant', textContent || 'Hey, I’m Aion.', data.messages);
      })
      .catch(() => { setInitError(true); });
  }, [workspaceId, messages.length, addMessage, currentSessionId]);

  const handleNewChat = useCallback(() => {
    startNewChat();
    initFetched.current = false;
    // Clear the greeting dedup so the brand-new chat gets its welcome.
    // Only the default-key entry needs clearing — new sessions get new keys.
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('unusonic.aion_greeted.default');
    }
  }, [startNewChat]);

  const handleSelectSession = useCallback(
    // Do NOT reset initFetched here. Pre-multi-thread, resetting was harmless
    // because sessions were roughly 1:1 with users. With per-deal multi-
    // thread sessions, every sidebar click was re-firing the init greeting
    // AND racing the DB message load (the load effect briefly sets
    // messages=[]), so the init effect saw length=0 and stacked another
    // greeting on every switch. initFetched only needs to reset on explicit
    // new-chat creation, which handleNewChat handles.
    (id: string) => selectSession(id),
    [selectSession],
  );

  const handleChipTap = useCallback(
    (value: string) => {
      setInitError(false);
      if (workspaceId) sendChatMessage({ text: value, workspaceId });
      else sendMessage({ text: value });
    },
    [workspaceId, sendChatMessage, sendMessage],
  );

  // Edit & resend
  const startEdit = useCallback((msgId: string, content: string) => {
    setEditingMsgId(msgId);
    setEditText(content);
  }, []);

  const submitEdit = useCallback(() => {
    if (!editingMsgId || !editText.trim() || !workspaceId) return;
    editAndResend(editingMsgId, editText.trim(), workspaceId);
    setEditingMsgId(null);
    setEditText('');
  }, [editingMsgId, editText, workspaceId, editAndResend]);

  const cancelEdit = useCallback(() => {
    setEditingMsgId(null);
    setEditText('');
  }, []);

  const handleDraftEdited = useCallback(async (data: DraftEditedData) => {
    if (data.classification === 'approved_unchanged') return;
    try {
      await fetch('/api/aion/learn-from-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original: data.original,
          edited: data.edited,
          dealId: data.dealId,
          channel: data.channel,
          classification: data.classification,
          distance: data.distance,
        }),
      });
    } catch {
      // Fire-and-forget — don't block the user
    }
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <AionSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelect={handleSelectSession}
        onNewChat={handleNewChat}
        onDelete={removeSession}
        onNewScopedChat={({ scopeType, scopeEntityId }) => {
          if (!workspaceId) return;
          // Only deal scope is wired today; event is Phase 2+ per the RPC.
          if (scopeType !== 'deal') return;
          void createNewScopedChat({ workspaceId, scopeType, scopeEntityId });
        }}
        onPin={(id) => void pinSession(id)}
        onUnpin={(id) => void unpinSession(id)}
        onArchive={(id) => void archiveSession(id)}
        onContinueInNewChat={(id) => void continueSessionInNewChat(id)}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      {/* Chat area */}
      <LayoutGroup>
        <div className="flex flex-col h-full flex-1 min-w-0 relative">
          {/* Sidebar toggle */}
          {!sidebarOpen && (
            <div className="absolute top-4 left-4 z-50">
              <button
                type="button"
                onClick={toggleSidebar}
                className="p-1.5 rounded-[6px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors duration-[80ms]"
                aria-label="Open sidebar"
              >
                <PanelLeft size={16} strokeWidth={1.5} />
              </button>
            </div>
          )}

          {/* Sticky scope header — renders when the current session is scope-linked
              (e.g. a specific deal). General chats render nothing here. */}
          {(() => {
            const current = sessions.find((s) => s.id === currentSessionId);
            return current ? <ChatScopeHeader session={current} /> : null;
          })()}

          {/* Empty state */}
          {isEmpty && viewState !== 'overview' && (
            <div className="flex-1 flex flex-col items-center justify-center px-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={STAGE_MEDIUM}
                className="mb-10 select-none flex flex-col items-center gap-4"
              >
                <motion.div layoutId="aion-mark" transition={STAGE_MEDIUM}>
                  <AionMark
                    size={96}
                    status={initError ? 'error' : input.trim() ? 'loading' : 'ambient'}
                  />
                </motion.div>
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={STAGE_LIGHT}
                  className="text-sm font-medium tracking-wide text-[var(--stage-text-tertiary)]"
                >
                  Aion
                </motion.span>
                {initError && (
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={STAGE_LIGHT}
                    className="text-xs text-[var(--stage-text-tertiary)]"
                  >
                    Could not connect. Type a message to try again.
                  </motion.p>
                )}
              </motion.div>
              <motion.div layoutId="aion-input-area" transition={STAGE_MEDIUM} className="w-full max-w-2xl">
                <AionInput
                  input={input}
                  setInput={setInput}
                  handleInputChange={handleInputChange}
                  isLoading={isLoading}
                  workspaceId={workspaceId}
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={STAGE_LIGHT}
                className="flex flex-wrap gap-2 mt-5 max-w-2xl justify-center"
              >
                {EMPTY_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => handleChipTap(chip.value)}
                    className="stage-btn stage-btn-secondary shrink-0 px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors duration-[80ms]"
                  >
                    {chip.label}
                  </button>
                ))}
              </motion.div>
            </div>
          )}

          {/* Message stream */}
          {!isEmpty && (
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-10 scrollbar-hide pb-36">
              <div className="max-w-2xl mx-auto px-6 space-y-4">
                <AnimatePresence initial={false}>
                  {messages.map((msg, idx) => {
                    const dateSep = shouldShowDateSeparator(messages, idx);
                    const isEditing = editingMsgId === msg.id;

                    return (
                      <React.Fragment key={`${msg.id}-${idx}`}>
                        {/* Date separator */}
                        {dateSep && (
                          <div className="flex items-center gap-3 py-2 select-none">
                            <div className="flex-1 h-px bg-[oklch(1_0_0_/_0.04)]" />
                            <span className="stage-label font-mono text-[var(--stage-text-tertiary)]">
                              {dateSep}
                            </span>
                            <div className="flex-1 h-px bg-[oklch(1_0_0_/_0.04)]" />
                          </div>
                        )}

                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={STAGE_MEDIUM}
                          className="flex w-full aion-chat-message group/row"
                        >
                          <div className="w-full flex flex-col gap-2">
                            {/* Role label + timestamp */}
                            <div className="flex items-center gap-2">
                              {msg.role === 'user' ? (
                                <span className="stage-label font-mono text-[var(--stage-text-tertiary)]">
                                  You
                                </span>
                              ) : (
                                <motion.div
                                  {...(idx === 0 ? { layoutId: 'aion-mark' } : {})}
                                  transition={STAGE_MEDIUM}
                                >
                                  <AionMark
                                    size={16}
                                    status={
                                      streamingMessageId === msg.id && msg.content
                                        ? 'thinking'
                                        : msg.isError
                                          ? 'error'
                                          : 'idle'
                                    }
                                  />
                                </motion.div>
                              )}
                              {msg.role === 'assistant' && msg.modelTier && (
                                <span className="stage-micro font-mono text-[var(--stage-text-tertiary)] opacity-0 group-hover/row:opacity-100 transition-opacity duration-[80ms] px-1.5 py-0.5 rounded bg-[oklch(1_0_0_/_0.04)]">
                                  {msg.modelTier === 'fast' ? 'haiku' : msg.modelTier === 'standard' ? 'sonnet' : 'opus'}
                                </span>
                              )}
                              {msg.timestamp && (
                                <span className="text-label text-[var(--stage-text-tertiary)] opacity-0 group-hover/row:opacity-100 transition-opacity duration-[80ms] tabular-nums">
                                  {msg.timestamp}
                                </span>
                              )}
                            </div>

                            {/* Message body */}
                            <div
                              className={cn(
                                'text-sm leading-relaxed font-sans relative',
                                msg.role === 'user'
                                  ? 'py-2.5 px-3.5 rounded-lg bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-primary)]'
                                  : 'py-2.5 text-[var(--stage-text-primary)] group/msg',
                              )}
                            >
                              {msg.role === 'user' ? (
                                isEditing ? (
                                  // Edit mode
                                  <div className="flex flex-col gap-2">
                                    <textarea
                                      value={editText}
                                      onChange={(e) => setEditText(e.target.value)}
                                      className="w-full bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.08)] rounded-md p-2 text-sm text-[var(--stage-text-primary)] outline-none focus-visible:border-[var(--stage-accent)] resize-none"
                                      rows={3}
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                    />
                                    <div className="flex gap-1.5">
                                      <button type="button" onClick={submitEdit} className="stage-btn stage-btn-primary text-xs px-3 py-1">Save & resend</button>
                                      <button type="button" onClick={cancelEdit} className="stage-btn stage-btn-ghost text-xs px-3 py-1">Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <p className="whitespace-pre-wrap font-normal">{msg.content}</p>
                                    {/* Edit button — hover-reveal */}
                                    {!isLoading && workspaceId && (
                                      <button
                                        type="button"
                                        onClick={() => startEdit(msg.id, msg.content)}
                                        className="absolute top-1.5 right-1.5 p-1.5 rounded-[4px] opacity-0 group-hover/row:opacity-100 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-[opacity,color,background-color] duration-[80ms]"
                                        aria-label="Edit message"
                                      >
                                        <Pencil size={12} strokeWidth={1.5} />
                                      </button>
                                    )}
                                  </>
                                )
                              ) : (
                                <>
                                  {/* Thinking preamble — the model's "I'll search for..."
                                      chatter that precedes a tool call. Rendered as a
                                      muted italic header above the answer so it doesn't
                                      compete with main content. Absent on plain turns. */}
                                  {msg.preamble && msg.preamble.trim().length > 0 && (
                                    <div
                                      className="mb-2 flex items-start gap-1.5 pl-0.5 text-[0.78rem] italic text-[var(--stage-text-tertiary)] leading-snug"
                                      aria-label="Aion's reasoning"
                                    >
                                      <Sparkles size={11} strokeWidth={1.5} className="shrink-0 mt-[3px] opacity-70" aria-hidden />
                                      <span className="whitespace-pre-wrap">{msg.preamble.trim()}</span>
                                    </div>
                                  )}
                                  {msg.content ? (
                                    <>
                                      <AionMarkdown content={msg.content} />
                                      {streamingMessageId === msg.id && <span className="aion-cursor" />}
                                    </>
                                  ) : streamingMessageId === msg.id ? (
                                    <span className="aion-cursor" />
                                  ) : null}
                                  {/* Retry button for error messages */}
                                  {msg.isError && workspaceId && (
                                    <button
                                      type="button"
                                      onClick={() => retryLastMessage(msg.id, workspaceId)}
                                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms]"
                                      aria-label="Retry"
                                    >
                                      <RotateCw size={12} strokeWidth={1.5} />
                                      Retry
                                    </button>
                                  )}
                                  {/* Message actions — copy + thumbs */}
                                  {streamingMessageId !== msg.id && msg.content && !msg.isError && (
                                    <MessageActions content={msg.content} msgId={msg.id} sessionId={currentSessionId} />
                                  )}
                                </>
                              )}
                            </div>

                            {/* Suggestion chips */}
                            {msg.structured?.map((block, blockIdx) => {
                              if (block.type === 'suggestions' && block.chips.length > 0) {
                                return <SuggestionChipsInline key={blockIdx} chips={block.chips} workspaceId={workspaceId} />;
                              }
                              return null;
                            })}

                            {/* Rich content blocks */}
                            {msg.structured && msg.structured.some((b) => b.type !== 'text' && b.type !== 'suggestions') && (
                              <AionMessageRenderer contents={msg.structured} workspaceId={workspaceId} onDraftEdited={handleDraftEdited} />
                            )}
                          </div>
                        </motion.div>
                      </React.Fragment>
                    );
                  })}

                  {/* Thinking steps with real tool labels */}
                  {isLoading && !(streamingMessageId && messages.find(m => m.id === streamingMessageId)?.content) && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={STAGE_LIGHT} className="py-2">
                      <div className="flex items-start gap-2.5">
                        <AionMark size={20} status="thinking" className="mt-0.5" />
                        <AionThinkingSteps activeToolLabel={activeToolLabel} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={scrollRef} />
              </div>
            </div>
          )}

          {/* Floating action buttons */}
          {!isEmpty && (
            <div className="absolute bottom-20 left-0 right-0 z-40 flex justify-center gap-2 pointer-events-none">
              <AnimatePresence>
                {isScrolledUp && (
                  <motion.button
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    transition={STAGE_LIGHT} type="button" onClick={scrollToBottom}
                    className="pointer-events-auto p-2 rounded-full bg-[var(--stage-surface-elevated)] border border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] shadow-lg transition-colors duration-[80ms]"
                    aria-label="Scroll to bottom"
                  >
                    <ChevronDown size={16} strokeWidth={1.5} />
                  </motion.button>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {streamingMessageId && (
                  <motion.button
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    transition={STAGE_LIGHT} type="button" onClick={cancelStreaming}
                    className="pointer-events-auto px-3 py-1.5 rounded-full bg-[var(--stage-surface-elevated)] border border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] shadow-lg transition-colors duration-[80ms] text-xs font-medium inline-flex items-center gap-1.5"
                    aria-label="Stop generating"
                  >
                    <Square size={10} strokeWidth={2} className="fill-current" />
                    Stop
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Bottom-fixed input */}
          {!isEmpty && viewState !== 'overview' && (
            <div className="absolute bottom-0 left-0 right-0 pb-6 z-40">
              {/* Fade gradient — void surface to transparent */}
              <div
                className="absolute bottom-full left-0 right-0 h-24 pointer-events-none"
                style={{ background: 'linear-gradient(to top, var(--stage-void), transparent)' }}
              />
              <motion.div layoutId="aion-input-area" transition={STAGE_MEDIUM} className="max-w-2xl mx-auto">
                <ModelModePicker mode={modelMode} setMode={setModelMode} />
                <AionInput
                  input={input}
                  setInput={setInput}
                  handleInputChange={handleInputChange}
                  isLoading={isLoading}
                  workspaceId={workspaceId}
                />
              </motion.div>
            </div>
          )}
        </div>
      </LayoutGroup>
    </div>
  );
};

// =============================================================================
// Message actions — copy + thumbs up/down (hover-reveal)
// =============================================================================

function MessageActions({ content, msgId, sessionId }: { content: string; msgId: string; sessionId: string }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleFeedback = useCallback((type: 'up' | 'down') => {
    const next = feedback === type ? null : type;
    setFeedback(next);
    import('@/app/(dashboard)/(features)/aion/actions/aion-session-actions')
      .then(mod => mod.saveMessageFeedback(sessionId, msgId, next))
      .catch(() => {});
  }, [feedback, sessionId, msgId]);

  return (
    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-[80ms]">
      <button
        type="button"
        onClick={() => handleFeedback('up')}
        className={cn(
          'p-1.5 rounded-[4px] transition-colors duration-[80ms]',
          feedback === 'up'
            ? 'text-[var(--color-unusonic-success)] bg-[oklch(1_0_0_/_0.06)]'
            : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)]',
        )}
        aria-label="Good response"
      >
        <ThumbsUp size={12} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={() => handleFeedback('down')}
        className={cn(
          'p-1.5 rounded-[4px] transition-colors duration-[80ms]',
          feedback === 'down'
            ? 'text-[var(--color-unusonic-error)] bg-[oklch(1_0_0_/_0.06)]'
            : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)]',
        )}
        aria-label="Bad response"
      >
        <ThumbsDown size={12} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-[4px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors duration-[80ms]"
        aria-label="Copy message"
      >
        {copied ? <Check size={12} strokeWidth={1.5} /> : <Copy size={12} strokeWidth={1.5} />}
      </button>
    </div>
  );
}

// =============================================================================
// Suggestion chips
// =============================================================================

function SuggestionChipsInline({ chips, workspaceId }: { chips: SuggestionChip[]; workspaceId?: string }) {
  const { sendChatMessage, sendMessage, messages } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const messageCountRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > messageCountRef.current) setDismissed(true);
    messageCountRef.current = messages.length;
  }, [messages.length]);

  if (dismissed || chips.length === 0) return null;

  const handleTap = (chip: SuggestionChip) => {
    setDismissed(true);
    if (workspaceId) sendChatMessage({ text: chip.value, workspaceId });
    else sendMessage({ text: chip.value });
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={STAGE_LIGHT} className="flex flex-wrap gap-2 pl-0"
        >
          {chips.map((chip, i) => (
            <button key={i} type="button" onClick={() => handleTap(chip)}
              className="stage-btn stage-btn-secondary shrink-0 px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors duration-[80ms]"
            >
              {chip.label}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// Model mode picker — segmented control above input
// =============================================================================

const MODEL_MODES: { value: AionModelMode; label: string; icon: React.ReactNode }[] = [
  { value: 'auto', label: 'Auto', icon: <Sparkles size={12} strokeWidth={1.5} /> },
  { value: 'fast', label: 'Fast', icon: <Zap size={12} strokeWidth={1.5} /> },
  { value: 'thinking', label: 'Thinking', icon: <Brain size={12} strokeWidth={1.5} /> },
];

function ModelModePicker({ mode, setMode }: { mode: AionModelMode; setMode: (m: AionModelMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 mb-2 ml-1">
      {MODEL_MODES.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setMode(value)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-field-label font-medium transition-colors duration-[80ms]',
            mode === value
              ? 'bg-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)]'
              : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.04)]',
          )}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  );
}
