'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

/**
 * Context for the global Command Palette (Cmd+K).
 * Pages (e.g. Network) can set currentOrgId so the palette can show context-specific sections
 * (e.g. "Add partner to Inner Circle" when on /network).
 */
type CommandPaletteContextValue = {
  currentOrgId: string | null;
  setCurrentOrgId: (id: string | null) => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(null);
  const setCurrentOrgId = useCallback((id: string | null) => setCurrentOrgIdState(id), []);
  return (
    <CommandPaletteContext.Provider value={{ currentOrgId, setCurrentOrgId }}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPaletteOrg() {
  const ctx = useContext(CommandPaletteContext);
  return ctx?.currentOrgId ?? null;
}

export function useSetCommandPaletteOrg() {
  const ctx = useContext(CommandPaletteContext);
  return ctx?.setCurrentOrgId ?? (() => {});
}
