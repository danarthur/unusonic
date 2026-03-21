'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type FocusedCardId = string | null;

interface LobbyFocusContextType {
  focusedCardId: FocusedCardId;
  setFocusedCardId: (id: FocusedCardId) => void;
  isFocused: (id: string) => boolean;
}

const LobbyFocusContext = createContext<LobbyFocusContextType | undefined>(undefined);

export function LobbyFocusProvider({ children }: { children: ReactNode }) {
  const [focusedCardId, setFocusedCardId] = useState<FocusedCardId>(null);

  const isFocused = useCallback(
    (id: string) => focusedCardId === id,
    [focusedCardId]
  );

  return (
    <LobbyFocusContext.Provider value={{ focusedCardId, setFocusedCardId, isFocused }}>
      {children}
    </LobbyFocusContext.Provider>
  );
}

export function useLobbyFocus() {
  const ctx = useContext(LobbyFocusContext);
  if (!ctx) throw new Error('useLobbyFocus must be used within LobbyFocusProvider');
  return ctx;
}
