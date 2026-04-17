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
import { getHasEverCaptured } from '@/widgets/todays-brief/api/get-has-ever-captured';

const CaptureModal = dynamic(
  () => import('./CaptureModal').then((m) => m.CaptureModal),
  { ssr: false },
);

interface CaptureContextValue {
  open: boolean;
  /**
   * Open the capture modal. Passing `initialText` skips mic recording and
   * routes directly to parse — used by the inline composer's typed-submit.
   * Empty or missing `initialText` opens to the idle/recording flow.
   */
  openCapture: (opts?: { initialText?: string }) => void;
  closeCapture: () => void;
  workspaceId: string;
  /**
   * True once the current user has confirmed at least one capture in this
   * workspace. Drives the CaptureComposer's first-run → compact transition.
   * Flips from false → true the moment `markCaptured()` is called after a
   * successful confirm, so the UI compacts without a page reload.
   */
  hasEverCaptured: boolean;
  /** Called by CaptureModal after a successful confirm. Idempotent. */
  markCaptured: () => void;
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
  const [hasEverCaptured, setHasEverCaptured] = React.useState(false);
  const [initialText, setInitialText] = React.useState<string | undefined>(undefined);

  const openCapture = React.useCallback((opts?: { initialText?: string }) => {
    setInitialText(opts?.initialText);
    setOpen(true);
  }, []);
  const closeCapture = React.useCallback(() => {
    setOpen(false);
    // Clear the seed so the next manual open doesn't accidentally re-use it.
    setInitialText(undefined);
  }, []);
  const markCaptured = React.useCallback(() => setHasEverCaptured(true), []);

  // Hydrate from the server on mount. Default-false means the composer
  // briefly shows the first-run state for existing users before the fetch
  // settles, which is acceptable — it's louder, errs on discoverability.
  React.useEffect(() => {
    let active = true;
    void getHasEverCaptured()
      .then((v) => { if (active && v) setHasEverCaptured(true); })
      .catch(() => { /* keep default false */ });
    return () => { active = false; };
  }, []);

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
      setInitialText(undefined);
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = React.useMemo<CaptureContextValue>(
    () => ({ open, openCapture, closeCapture, workspaceId, hasEverCaptured, markCaptured }),
    [open, openCapture, closeCapture, workspaceId, hasEverCaptured, markCaptured],
  );

  return (
    <CaptureContext.Provider value={value}>
      {children}
      {open && (
        <CaptureModal
          workspaceId={workspaceId}
          open={open}
          onOpenChange={(v) => (v ? openCapture() : closeCapture())}
          initialText={initialText}
        />
      )}
    </CaptureContext.Provider>
  );
}
