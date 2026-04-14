'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, ReactNode } from 'react';
import type { AionMessageContent, AionChatResponse, AionPageContext, AionModelMode } from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import { usePageContextStore } from '@/shared/lib/page-context-store';
import {
  getSessionList,
  getSessionMessages,
  createSession,
  saveMessage,
  type DbSessionMeta,
} from '@/app/(dashboard)/(features)/aion/actions/aion-session-actions';

// Define the shape of a message
export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachment?: string;
  structured?: AionMessageContent[];
  isError?: boolean;
  modelTier?: 'fast' | 'standard' | 'heavy';
};

export type SessionMeta = {
  id: string;
  createdAt: number;
  updatedAt: number;
  preview: string;
};

interface SessionContextType {
  messages: Message[];
  sessions: SessionMeta[];
  currentSessionId: string;
  isLoading: boolean;
  /** ID of the message currently being streamed (null when not streaming) */
  streamingMessageId: string | null;
  /** Label of the tool currently being executed (null when idle) */
  activeToolLabel: string | null;
  setIsLoading: (loading: boolean) => void;
  viewState: 'overview' | 'chat';
  setViewState: (state: 'overview' | 'chat') => void;
  sendMessage: (input: { text?: string; file?: File; audioBlob?: Blob }) => Promise<void>;
  /** Send a text message through the Aion chat route (streaming SSE). */
  sendChatMessage: (input: { text: string; workspaceId: string }) => Promise<void>;
  /** Set the workspace ID for voice → chat routing. */
  setWorkspaceId: (id: string) => void;
  addMessage: (role: 'user' | 'assistant', content: string, structured?: AionMessageContent[]) => void;
  startNewChat: () => void;
  selectSession: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;
  /** Edit a past user message and resend from that point */
  editAndResend: (msgId: string, newContent: string, workspaceId: string) => void;
  /** Retry the last failed assistant message */
  retryLastMessage: (errorMsgId: string, workspaceId: string) => void;
  /** Abort the current streaming request */
  cancelStreaming: () => void;
  hydrateSessions: (initial: SessionMeta[]) => void;
  /** Model mode: auto (intent-based), fast (Haiku), thinking (Sonnet+ with extended thinking) */
  modelMode: AionModelMode;
  setModelMode: (mode: AionModelMode) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

const MAX_CACHED_SESSIONS = 5;

function dbSessionToMeta(db: DbSessionMeta): SessionMeta {
  return {
    id: db.id,
    createdAt: new Date(db.created_at).getTime(),
    updatedAt: new Date(db.updated_at).getTime(),
    preview: db.preview ?? '',
  };
}

/** Prune localStorage to keep only the N most recent sessions' messages */
function pruneLocalStorage(sessions: SessionMeta[], storageMessagesKey: (id: string) => string) {
  if (sessions.length <= MAX_CACHED_SESSIONS) return;
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const toRemove = sorted.slice(MAX_CACHED_SESSIONS);
  for (const s of toRemove) {
    try { window.localStorage.removeItem(storageMessagesKey(s.id)); } catch { /* ignore */ }
  }
}

function playAudioBase64(base64: string) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch((err) => {
      console.error('Audio playback failed:', err);
      URL.revokeObjectURL(url);
    });
  } catch (err) {
    console.error('Audio decode failed:', err);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const storage = useMemo(
    () => ({
      currentSessionKey: 'unusonic.currentSessionId',
      sessionsKey: 'unusonic.sessions',
      messagesKey: (id: string) => `unusonic.messages.${id}`,
    }),
    []
  );

  // Start with empty messages (clean state)
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [activeToolLabel, setActiveToolLabel] = useState<string | null>(null);
  const [modelMode, setModelMode] = useState<AionModelMode>('auto');
  const [viewState, setViewState] = useState<'overview' | 'chat'>('overview');
  const [sessionId, setSessionId] = useState('server');
  const [isHydrated, setIsHydrated] = useState(false);
  const [providerWorkspaceId, setProviderWorkspaceId] = useState<string | undefined>();
  const dbHydratedRef = useRef(false);

  // ── LocalStorage hydration (immediate, fast) ────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storage.sessionsKey);
      const parsed = raw ? (JSON.parse(raw) as SessionMeta[]) : [];
      setSessions(parsed);
    } catch {
      setSessions([]);
    }

    const existing = window.localStorage.getItem(storage.currentSessionKey);
    if (existing) {
      // Check if the current session is stale (> 4 hours old)
      const STALE_MS = 4 * 60 * 60 * 1000;
      const raw = window.localStorage.getItem(storage.sessionsKey);
      const allSessions = raw ? (JSON.parse(raw) as SessionMeta[]) : [];
      const current = allSessions.find((s) => s.id === existing);
      if (current && Date.now() - current.updatedAt > STALE_MS) {
        // Session is stale — start fresh
        const fresh = `chat-${crypto.randomUUID()}`;
        window.localStorage.setItem(storage.currentSessionKey, fresh);
        setSessionId(fresh);
      } else {
        setSessionId(existing);
      }
    } else {
      const generated = `chat-${crypto.randomUUID()}`;
      window.localStorage.setItem(storage.currentSessionKey, generated);
      setSessionId(generated);
    }

    setIsHydrated(true);
  }, [storage]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(storage.sessionsKey, JSON.stringify(sessions));
    } catch {
      // Ignore localStorage failures
    }
  }, [sessions, storage.sessionsKey]);

  // ── DB hydration (async, once workspace is known) ───────────────────────

  useEffect(() => {
    if (!providerWorkspaceId || dbHydratedRef.current) return;
    dbHydratedRef.current = true;

    getSessionList(providerWorkspaceId).then((result) => {
      if (!result.success) return;
      const dbSessions = result.sessions.map(dbSessionToMeta);
      setSessions((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]));
        for (const db of dbSessions) {
          const existing = byId.get(db.id);
          if (!existing || db.updatedAt > existing.updatedAt) {
            byId.set(db.id, db);
          }
        }
        return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      });
    }).catch(() => { /* DB unavailable — localStorage is fine */ });
  }, [providerWorkspaceId]);

  // ── Load messages when session changes ──────────────────────────────────

  useEffect(() => {
    if (!isHydrated) return;

    // Try localStorage first (fast)
    try {
      const raw = window.localStorage.getItem(storage.messagesKey(sessionId));
      if (raw) {
        setMessages(JSON.parse(raw) as Message[]);
        setSessions(prev => {
          if (prev.some(s => s.id === sessionId)) return prev;
          const now = Date.now();
          return [...prev, { id: sessionId, createdAt: now, updatedAt: now, preview: '' }];
        });
        return;
      }
    } catch { /* fall through to DB */ }

    // Not in localStorage — try loading from DB
    setMessages([]);
    getSessionMessages(sessionId).then((result) => {
      if (!result.success || result.messages.length === 0) return;
      const loaded: Message[] = result.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ...(m.structured_content ? { structured: m.structured_content } : {}),
      }));
      setMessages(loaded);
      try { window.localStorage.setItem(storage.messagesKey(sessionId), JSON.stringify(loaded)); } catch { /* ignore */ }
    }).catch(() => { /* DB unavailable */ });

    setSessions(prev => {
      if (prev.some(s => s.id === sessionId)) return prev;
      const now = Date.now();
      return [...prev, { id: sessionId, createdAt: now, updatedAt: now, preview: '' }];
    });
  }, [sessionId, storage, isHydrated]);

  // Helper to update local UI state
  const addMessage = (role: 'user' | 'assistant', content: string, structured?: AionMessageContent[]) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...(structured ? { structured } : {}),
    };
    setMessages(prev => {
      const next = [...prev, newMessage];
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(storage.messagesKey(sessionId), JSON.stringify(next));
        } catch {
          // Ignore localStorage failures
        }
      }
      return next;
    });

    if (typeof window !== 'undefined') {
      const preview = content.replace(/\s+/g, ' ').trim().slice(0, 60);
      setSessions(prevSessions => {
        const now = Date.now();
        const existing = prevSessions.find(session => session.id === sessionId);
        if (!existing) {
          return [...prevSessions, { id: sessionId, createdAt: now, updatedAt: now, preview: role === 'user' ? preview : '' }];
        }
        return prevSessions.map(session => {
          if (session.id !== sessionId) return session;
          const nextPreview = session.preview || (role === 'user' ? preview : '');
          return { ...session, updatedAt: now, preview: nextPreview };
        });
      });

      // Prune old localStorage caches
      pruneLocalStorage(sessions, storage.messagesKey);
    }

    // Fire-and-forget: persist to DB
    saveMessage(sessionId, role, content, structured).catch((err) => {
      console.error('[SessionContext] DB save failed:', err);
    });
  };

  // --- Streaming helpers ---
  const updateMessageContent = useCallback((msgId: string, content: string) => {
    setMessages(prev => {
      const next = prev.map(m => m.id === msgId ? { ...m, content } : m);
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(storage.messagesKey(sessionId), JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }, [sessionId, storage]);

  const finalizeMessage = useCallback((msgId: string, content: string, structured?: AionMessageContent[], isError?: boolean) => {
    setMessages(prev => {
      const next = prev.map(m => m.id === msgId ? { ...m, content, ...(structured ? { structured } : {}), ...(isError ? { isError } : {}) } : m);
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(storage.messagesKey(sessionId), JSON.stringify(next)); } catch {}
      }
      return next;
    });
    setStreamingMessageId(null);
    setActiveToolLabel(null);
  }, [sessionId, storage]);

  const startNewChat = useCallback(() => {
    if (!isHydrated) return;
    const newSessionId = crypto.randomUUID();
    window.localStorage.setItem(storage.currentSessionKey, newSessionId);
    setSessionId(newSessionId);
    setMessages([]);
    const now = Date.now();
    setSessions(prev => [...prev, { id: newSessionId, createdAt: now, updatedAt: now, preview: '' }]);

    // Fire-and-forget: create in DB
    if (providerWorkspaceId) {
      createSession(providerWorkspaceId, newSessionId).catch((err) => {
        console.error('[SessionContext] DB session create failed:', err);
      });
    }
  }, [isHydrated, storage, providerWorkspaceId]);

  const selectSession = (targetSessionId: string) => {
    if (!isHydrated) return;
    window.localStorage.setItem(storage.currentSessionKey, targetSessionId);
    setSessionId(targetSessionId);
  };

  const removeSession = useCallback((targetSessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== targetSessionId));
    // Clean up localStorage messages for this session
    try { window.localStorage.removeItem(storage.messagesKey(targetSessionId)); } catch {}
    // If deleting the current session, start a new one
    if (targetSessionId === sessionId) {
      const newId = `chat-${crypto.randomUUID()}`;
      window.localStorage.setItem(storage.currentSessionKey, newId);
      setSessionId(newId);
      setMessages([]);
      const now = Date.now();
      setSessions(prev => [...prev, { id: newId, createdAt: now, updatedAt: now, preview: '' }]);
    }
    // Fire-and-forget DB deletion
    import('@/app/(dashboard)/(features)/aion/actions/aion-session-actions')
      .then(mod => mod.deleteSession(targetSessionId))
      .catch(() => {});
  }, [sessionId, storage]);

  // Abort controller for streaming cancellation
  const abortRef = useRef<AbortController | null>(null);

  const cancelStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setStreamingMessageId(null);
    setActiveToolLabel(null);
  }, []);

  const hydrateSessions = (initial: SessionMeta[]) => {
    if (initial.length === 0) return;
    setSessions(prev => {
      if (prev.length === 0) return [...initial];
      const seen = new Set(prev.map(session => session.id));
      const merged = [...prev];
      for (const session of initial) {
        if (!seen.has(session.id)) {
          merged.push(session);
        }
      }
      return merged;
    });
  };

  // --- AION CHAT CONNECTOR (streaming SSE) ---
  const sendChatMessage = useCallback(async ({ text, workspaceId }: { text: string; workspaceId: string }) => {
    if (!text.trim()) return;

    addMessage('user', text);
    setIsLoading(true);

    // Create an empty assistant message to stream into
    // Use a distinct suffix to avoid colliding with the user message ID (also Date.now-based)
    const msgId = `${Date.now()}-a`;
    const streamMsg: Message = {
      id: msgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => {
      const next = [...prev, streamMsg];
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(storage.messagesKey(sessionId), JSON.stringify(next)); } catch {}
      }
      return next;
    });
    setStreamingMessageId(msgId);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const history = [
        ...messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: text },
      ];

      // Snapshot current page context from the store
      const { type, entityId, label, secondaryId, secondaryType } = usePageContextStore.getState();
      const pageContext: AionPageContext | undefined =
        type ? { type, entityId, label, secondaryId, secondaryType } : undefined;

      abortRef.current = new AbortController();
      timeoutId = setTimeout(() => {
        abortRef.current?.abort('timeout');
      }, 15_000);
      const response = await fetch('/api/aion/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, workspaceId, sessionId, pageContext, modelMode }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errorMsg = response.status === 429
          ? 'Too many requests. Wait a moment and try again.'
          : 'Connection error. Try again.';
        finalizeMessage(msgId, errorMsg, undefined, true);
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';

      // Handle streaming SSE response
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // keep incomplete last line in buffer

          for (const line of lines) {
            if (line.startsWith('text:')) {
              accumulated += line.slice(5);
              setActiveToolLabel(null);
              updateMessageContent(msgId, accumulated);
            } else if (line.startsWith('thinking:')) {
              // Extended thinking deltas — show as thinking indicator
              setActiveToolLabel('reasoning');
            } else if (line.startsWith('model:')) {
              // Store model tier on the streaming message
              const tier = line.slice(6) as Message['modelTier'];
              setMessages(prev => prev.map(m => m.id === msgId ? { ...m, modelTier: tier } : m));
            } else if (line.startsWith('tool:')) {
              setActiveToolLabel(line.slice(5));
            } else if (line.startsWith('structured:')) {
              try {
                const payload = JSON.parse(line.slice(11));
                const blocks: AionMessageContent[] = payload.blocks ?? [];
                finalizeMessage(msgId, accumulated || 'I processed that.', blocks.length > 0 ? blocks : undefined);
              } catch {
                finalizeMessage(msgId, accumulated || 'I processed that.');
              }
            } else if (line.startsWith('error:')) {
              finalizeMessage(msgId, line.slice(6) || 'Request failed. Try again.', undefined, true);
            }
          }
        }

        clearTimeout(timeoutId);
        // If no structured event was sent, finalize with accumulated text
        if (streamingMessageId === msgId) {
          finalizeMessage(msgId, accumulated || 'I processed that.');
        }
      } else {
        // Fallback: JSON response (init greeting, legacy)
        const data: AionChatResponse = await response.json();
        const textContent = data.messages
          .filter((m) => m.type === 'text')
          .map((m) => m.text)
          .join('\n');
        finalizeMessage(msgId, textContent || 'I processed that.', data.messages);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Aion Chat Error:', error);
      const isTimeout = error instanceof DOMException && error.name === 'AbortError' && abortRef.current === null;
      const msg = isTimeout
        ? 'Response timed out. Try again.'
        : 'I had trouble connecting. Check your connection and try again.';
      finalizeMessage(msgId, msg, undefined, true);
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, [messages, sessionId, storage, updateMessageContent, finalizeMessage, streamingMessageId]);

  // --- Edit & resend from a past message ---
  const editAndResend = useCallback((msgId: string, newContent: string, wsId: string) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msgId);
      if (idx === -1) return prev;
      const truncated = prev.slice(0, idx);
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(storage.messagesKey(sessionId), JSON.stringify(truncated)); } catch {}
      }
      return truncated;
    });
    setTimeout(() => sendChatMessage({ text: newContent, workspaceId: wsId }), 50);
  }, [sessionId, storage, sendChatMessage]);

  // --- Retry last failed message ---
  const retryLastMessage = useCallback((errorMsgId: string, wsId: string) => {
    setMessages(prev => {
      const errorIdx = prev.findIndex(m => m.id === errorMsgId);
      if (errorIdx === -1) return prev;
      // Find the user message immediately before the error
      let userMsg: Message | undefined;
      for (let i = errorIdx - 1; i >= 0; i--) {
        if (prev[i].role === 'user') { userMsg = prev[i]; break; }
      }
      if (!userMsg) return prev;
      // Remove the error message
      const next = prev.filter(m => m.id !== errorMsgId);
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(storage.messagesKey(sessionId), JSON.stringify(next)); } catch {}
      }
      // Schedule resend after state update
      setTimeout(() => sendChatMessage({ text: userMsg!.content, workspaceId: wsId }), 50);
      return next;
    });
  }, [sessionId, storage, sendChatMessage]);

  // --- THE AION CONNECTOR (legacy webhook) ---
  const sendMessage = async ({ text = '', file, audioBlob }: { text?: string; file?: File; audioBlob?: Blob }) => {
    // Prevent empty sends
    if (!text.trim() && !file && !audioBlob) return;

    const isVoice = Boolean(audioBlob);
    const hasFile = Boolean(file);

    // 1. Update UI Immediately (Optimistic Update for text/file)
    if (!isVoice) {
      let displayContent = text;
      if (file) {
        displayContent = text ? `${text} \n[Attached: ${file.name}]` : `[Attached: ${file.name}]`;
      }
      addMessage('user', displayContent);
    }
    
    setIsLoading(true);

    try {
      const WEBHOOK_URL = process.env.NEXT_PUBLIC_AION_VOICE_WEBHOOK || '';
      if (!WEBHOOK_URL) {
        addMessage('assistant', 'Voice assistant is not configured. Set NEXT_PUBLIC_AION_VOICE_WEBHOOK.');
        setIsLoading(false);
        return;
      }

      let response: Response;
      if (isVoice || hasFile) {
        // Voice or file upload -> multipart/form-data
        const formData = new FormData();
        if (text) formData.append('text', text);
        formData.append('sessionId', sessionId);
        if (audioBlob) {
          formData.append('file', audioBlob, 'recording.webm');
        } else if (file) {
          formData.append('file', file);
        }
        response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          body: formData,
        });
      } else {
        // Text only -> JSON
        response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, sessionId }),
        });
      }

      if (!response.ok) {
        const offline = response.status >= 500;
        addMessage('assistant', offline ? 'System Offline' : 'Connection Error');
        return;
      }

      // 4. Handle Response
      const contentType = response.headers.get('content-type') || '';
      const rawBody = await response.text();
      if (!rawBody) {
        addMessage('assistant', 'Connection Error');
        return;
      }

      let data: { user_transcript?: string; ai_response?: string; audio?: string | null };
      try {
        data = contentType.includes('application/json') ? JSON.parse(rawBody) : JSON.parse(rawBody);
      } catch (parseError) {
        console.error('Response parse failed:', parseError);
        addMessage('assistant', 'Connection Error');
        return;
      }

      const userTranscript = data.user_transcript;
      const aiResponse = data.ai_response || "Data processed successfully.";
      const audioBase64 = data.audio;

      if (isVoice && userTranscript && providerWorkspaceId) {
        // Route voice transcript through Aion chat for structured response
        addMessage('user', userTranscript);
        setIsLoading(false);
        await sendChatMessage({ text: userTranscript, workspaceId: providerWorkspaceId });
        // Play audio from webhook response if present, then return
        if (audioBase64) playAudioBase64(audioBase64);
        return;
      }

      if (isVoice) {
        addMessage('user', userTranscript || 'Voice message');
      }

      addMessage('assistant', aiResponse);

      if (audioBase64) playAudioBase64(audioBase64);

    } catch (error) {
      console.error('Aion Error:', error);
      addMessage('assistant', "I'm having trouble connecting to the neural network. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Ensure current session exists in DB when workspace becomes available ─

  useEffect(() => {
    if (!providerWorkspaceId || !isHydrated || sessionId === 'server') return;
    createSession(providerWorkspaceId, sessionId).catch(() => { /* may already exist */ });
  }, [providerWorkspaceId, isHydrated, sessionId]);

  return (
    <SessionContext.Provider value={{
      messages,
      sessions,
      currentSessionId: sessionId,
      isLoading,
      streamingMessageId,
      activeToolLabel,
      setIsLoading,
      viewState,
      setViewState,
      addMessage,
      startNewChat,
      selectSession,
      removeSession,
      editAndResend,
      retryLastMessage,
      cancelStreaming,
      hydrateSessions,
      sendMessage,
      sendChatMessage,
      setWorkspaceId: setProviderWorkspaceId,
      modelMode,
      setModelMode,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}