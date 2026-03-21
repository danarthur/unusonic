'use client';

import React, { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';

export type SystemHeartStatus = 'idle' | 'loading' | 'error' | 'success';

interface SystemHeartContextType {
  status: SystemHeartStatus;
  setStatus: (status: SystemHeartStatus) => void;
}

const SystemHeartContext = createContext<SystemHeartContextType | undefined>(undefined);

const ERROR_RESET_MS = 3000;

export function SystemHeartProvider({ children }: { children: ReactNode }) {
  const [status, setStatusState] = useState<SystemHeartStatus>('idle');

  const setStatus = useCallback((next: SystemHeartStatus) => {
    setStatusState(next);
  }, []);

  // Auto-reset error after a short time so the heart doesn't stay red forever
  useEffect(() => {
    if (status !== 'error') return;
    const t = setTimeout(() => setStatusState('idle'), ERROR_RESET_MS);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <SystemHeartContext.Provider value={{ status, setStatus }}>
      {children}
    </SystemHeartContext.Provider>
  );
}

/**
 * System Heart status for the Living Logo (sidebar + global loader).
 * Call setStatus('loading') before navigation, setStatus('error') when a server action fails.
 */
export function useSystemHeart() {
  const ctx = useContext(SystemHeartContext);
  if (ctx === undefined) {
    // Outside provider: no-op setter so LivingLogo can still render with default idle
    return {
      status: 'idle' as SystemHeartStatus,
      setStatus: () => {},
    };
  }
  return ctx;
}
