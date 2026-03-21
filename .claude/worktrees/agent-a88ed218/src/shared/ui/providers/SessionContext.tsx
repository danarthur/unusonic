'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

// Define the shape of a message
export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachment?: string; // Optional: To display filename in UI if needed
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
  setIsLoading: (loading: boolean) => void;
  viewState: 'overview' | 'chat';
  setViewState: (state: 'overview' | 'chat') => void;
  // The main function to talk to the brain
  sendMessage: (input: { text?: string; file?: File; audioBlob?: Blob }) => Promise<void>;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  startNewChat: () => void;
  selectSession: (sessionId: string) => void;
  hydrateSessions: (initial: SessionMeta[]) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const storage = useMemo(
    () => ({
      currentSessionKey: 'signal.currentSessionId',
      sessionsKey: 'signal.sessions',
      messagesKey: (id: string) => `signal.messages.${id}`,
    }),
    []
  );

  // Start with empty messages (clean state)
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewState, setViewState] = useState<'overview' | 'chat'>('overview');
  const [sessionId, setSessionId] = useState('server');
  const [isHydrated, setIsHydrated] = useState(false);

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
      setSessionId(existing);
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

  useEffect(() => {
    if (!isHydrated) return;
    try {
      const raw = window.localStorage.getItem(storage.messagesKey(sessionId));
      setMessages(raw ? (JSON.parse(raw) as Message[]) : []);
    } catch {
      setMessages([]);
    }
    setSessions(prev => {
      const exists = prev.some(session => session.id === sessionId);
      if (exists) return prev;
      const now = Date.now();
      return [...prev, { id: sessionId, createdAt: now, updatedAt: now, preview: '' }];
    });
  }, [sessionId, storage]);

  // Helper to update local UI state
  const addMessage = (role: 'user' | 'assistant', content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
    }
  };

  const startNewChat = () => {
    if (!isHydrated) return;
    const newSessionId = `chat-${crypto.randomUUID()}`;
    window.localStorage.setItem(storage.currentSessionKey, newSessionId);
    setSessionId(newSessionId);
    setMessages([]);
    const now = Date.now();
    setSessions(prev => [...prev, { id: newSessionId, createdAt: now, updatedAt: now, preview: '' }]);
  };

  const selectSession = (targetSessionId: string) => {
    if (!isHydrated) return;
    window.localStorage.setItem(storage.currentSessionKey, targetSessionId);
    setSessionId(targetSessionId);
  };

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

  // --- THE BRAIN CONNECTOR ---
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
      const WEBHOOK_URL = process.env.NEXT_PUBLIC_ION_VOICE_WEBHOOK || '';
      if (!WEBHOOK_URL) {
        addMessage('assistant', 'Voice assistant is not configured. Set NEXT_PUBLIC_ION_VOICE_WEBHOOK.');
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

      if (isVoice) {
        addMessage('user', userTranscript || 'Voice message');
      }

      addMessage('assistant', aiResponse);

      if (audioBase64) {
        try {
          const binary = atob(audioBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
          }
          const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audio.onended = () => URL.revokeObjectURL(audioUrl);
          audio.play().catch((err) => {
            console.error('Audio playback failed:', err);
            URL.revokeObjectURL(audioUrl);
          });
        } catch (err) {
          console.error('Audio decode failed:', err);
        }
      }

    } catch (error) {
      console.error('Brain Error:', error);
      addMessage('assistant', "I'm having trouble connecting to the neural network. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SessionContext.Provider value={{ 
      messages, 
      sessions,
      currentSessionId: sessionId,
      isLoading, 
      setIsLoading, 
      viewState, 
      setViewState,
      addMessage,
      startNewChat,
      selectSession,
      hydrateSessions,
      sendMessage 
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