'use client';

/**
 * CaptureProvider — lobby-level context + single CaptureModal mount.
 *
 * Wraps the lobby's overview view. Owns:
 *   • `openCapture()` / `closeCapture()` — imperative triggers
 *   • the `Shift+C` global keyboard listener (works lobby-wide, not only when
 *     the brief card is visible)
 *   • the single dynamic-imported `CaptureModal` instance
 *
 * Consumers:
 *   • `<CaptureComposer>` inside `TodaysBriefWidget` calls `openCapture()`
 *     when the user taps the composer row.
 *   • Any future affordance that wants to trigger capture imperatively.
 *
 * Gated upstream by the `aion.lobby_capture` feature flag — if the flag is
 * off, callers should not mount the provider at all.
 *
 * See docs/reference/sales-brief-v2-design.md §10.1 + §10.3.
 */

import * as React from 'react';
import dynamic from 'next/dynamic';

const CaptureModal = dynamic(
  () => import('./CaptureModal').then((m) => m.CaptureModal),
  { ssr: false },
);

interface CaptureContextValue {
  open: boolean;
  openCapture: () => void;
  closeCapture: () => void;
  workspaceId: string;
}

const CaptureContext = React.createContext<CaptureContextValue | null>(null);

export function useCapture(): CaptureContextValue {
  const ctx = React.useContext(CaptureContext);
  if (!ctx) {
    throw new Error(
      'useCapture must be used within a <CaptureProvider>. Mount one at the lobby level when the aion.lobby_capture flag is enabled.',
    );
  }
  return ctx;
}

/**
 * Optional-context variant for surfaces that can appear inside OR outside the
 * provider (e.g. the brief widget, which also renders in layouts where the
 * capture flag is off). Returns null when no provider is present instead of
 * throwing, so consumers can conditionally render their composer.
 */
export function useOptionalCapture(): CaptureContextValue | null {
  return React.useContext(CaptureContext);
}

export interface CaptureProviderProps {
  workspaceId: string;
  children: React.ReactNode;
}

export function CaptureProvider({ workspaceId, children }: CaptureProviderProps) {
  const [open, setOpen] = React.useState(false);

  const openCapture = React.useCallback(() => setOpen(true), []);
  const closeCapture = React.useCallback(() => setOpen(false), []);

  // Global Shift+C — lifted from the retired CaptureButton so it fires
  // regardless of whether any capture affordance is visible. Skips when the
  // user is typing in an input/textarea/contenteditable surface.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'C' && e.key !== 'c') return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = React.useMemo<CaptureContextValue>(
    () => ({ open, openCapture, closeCapture, workspaceId }),
    [open, openCapture, closeCapture, workspaceId],
  );

  return (
    <CaptureContext.Provider value={value}>
      {children}
      {open && (
        <CaptureModal
          workspaceId={workspaceId}
          open={open}
          onOpenChange={(v) => (v ? openCapture() : closeCapture())}
        />
      )}
    </CaptureContext.Provider>
  );
}
