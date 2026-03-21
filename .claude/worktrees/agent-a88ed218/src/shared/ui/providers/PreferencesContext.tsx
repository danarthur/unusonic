'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'danielos_prefs';

interface PreferencesState {
  /** Use 24-hour time site-wide (default: false = 12h). */
  militaryTime: boolean;
}

const defaultState: PreferencesState = {
  militaryTime: false,
};

function loadFromStorage(): PreferencesState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<PreferencesState>;
    return {
      militaryTime: parsed.militaryTime ?? defaultState.militaryTime,
    };
  } catch {
    return defaultState;
  }
}

function saveToStorage(state: PreferencesState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

interface PreferencesContextValue extends PreferencesState {
  setMilitaryTime: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PreferencesState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(state);
  }, [hydrated, state]);

  const setMilitaryTime = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, militaryTime: value }));
  }, []);

  const value: PreferencesContextValue = {
    ...state,
    setMilitaryTime,
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    return {
      ...defaultState,
      setMilitaryTime: () => {},
    };
  }
  return ctx;
}
