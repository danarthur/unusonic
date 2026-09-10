'use client';

/**
 * Warn before leaving a page with unsaved changes.
 *
 * Two classes of exit, and only one of them is ours to catch:
 *
 *   • In-app navigation -- a link, a back button, a breadcrumb. The app has to
 *     intercept these itself and render its own confirmation, because
 *     client-side routing never fires `beforeunload`. This is the trap on the
 *     App Router specifically: a form that only registers `beforeunload` looks
 *     guarded and silently discards on every internal link.
 *   • Browser-level exits -- closing the tab, reloading, editing the URL. Only
 *     the native dialog can catch these, and its wording is not ours to set.
 *
 * Two things it deliberately does NOT warn on, both of which are easy to get
 * wrong and both of which train people to click through the dialog:
 *
 *   • Progressive disclosure. Expanding or collapsing a section is not a
 *     navigation. This hook only ever looks at anchors with an href, so a
 *     <button> that toggles an accordion cannot reach it.
 *   • Anything with nothing at stake -- a clean form, a link that opens a new
 *     tab, a download, a modified click the user meant to open elsewhere, or a
 *     link to where they already are.
 *
 * The browser's own Back button needs a third mechanism again. Inside a
 * single-page session it fires neither `beforeunload` nor a click, so the only
 * way to catch it is to have somewhere to land: while the form is dirty the
 * hook pushes one duplicate history entry, and a Back press pops onto it rather
 * than off the page. The entry is re-pushed each time so the guard survives
 * repeated presses, and leaving goes to `fallbackHref` -- where the page's own
 * Back button goes -- rather than unwinding the stack by a computed count,
 * which is the part that goes wrong when the record was the first page opened.
 *
 * The cost, stated plainly: after saving, one Back press can land on that
 * duplicate and appear to do nothing before the second leaves. A silent no-op
 * is a smaller price than silently discarding what someone typed.
 *
 * @module shared/lib/use-unsaved-changes
 */

import * as React from 'react';

/** Clicks the browser should keep: middle click, modified click, already handled. */
function isPlainLeftClick(e: MouseEvent): boolean {
  return (
    !e.defaultPrevented &&
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey
  );
}

/**
 * The in-app destination this click would navigate to, or null when there is
 * nothing to guard: not an anchor at all (a button toggling a section), a new
 * tab, a download, an in-page anchor, another origin, or where we already are.
 */
function inAppDestination(e: MouseEvent): string | null {
  const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as
    | HTMLAnchorElement
    | null;
  if (!anchor) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download')) return null;

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return null;

  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }
  // Leaving the origin entirely is a browser-level exit; beforeunload has it.
  if (url.origin !== window.location.origin) return null;
  // Already there. Nothing is lost by a no-op.
  const here = window.location.pathname + window.location.search;
  if (url.pathname + url.search === here) return null;

  return url.pathname + url.search + url.hash;
}

export interface UnsavedChangesGuard {
  /** The destination waiting on the user's answer, or null when nothing is pending. */
  pendingHref: string | null;
  /** Stay put. */
  cancel: () => void;
  /** Leave, losing the changes. */
  confirm: () => void;
  /**
   * Ask before navigating somewhere the hook cannot see -- the page's own Back
   * button, say. Returns false if the navigation was intercepted.
   */
  guard: (href: string) => boolean;
}

export function useUnsavedChanges(
  dirty: boolean,
  navigate: (href: string) => void,
  /** Where a caught Back press goes once the user accepts losing the changes. */
  fallbackHref?: string,
): UnsavedChangesGuard {
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  // A ref, because the click listener below is registered once and would
  // otherwise close over the value `dirty` had when it was attached. Synced in
  // an effect rather than during render; a click is a user event, so it always
  // reads a value the last commit has already flushed.
  const dirtyRef = React.useRef(dirty);
  React.useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Clear a pending prompt if the form stops being dirty underneath it --
  // a save that lands while the dialog is open leaves nothing to warn about.
  React.useEffect(() => {
    if (!dirty) setPendingHref(null);
  }, [dirty]);

  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Assigning returnValue is what still triggers the prompt in Safari and
      // older Chrome; the string itself has been ignored for years.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || !isPlainLeftClick(e)) return;
      const href = inAppDestination(e);
      if (!href) return;
      e.preventDefault();
      setPendingHref(href);
    };

    // Capture phase, so the interception happens before the router's own
    // handler turns the click into a navigation.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // ── The Back button ────────────────────────────────────────────────────────
  const fallbackRef = React.useRef(fallbackHref);
  React.useEffect(() => {
    fallbackRef.current = fallbackHref;
  }, [fallbackHref]);

  React.useEffect(() => {
    if (!dirty || typeof window === 'undefined') return;

    // Somewhere to land. Without this the first Back press has already left the
    // page by the time anything could ask about it.
    window.history.pushState({ unusonicUnsavedGuard: true }, '', window.location.href);

    const onPopState = () => {
      if (!dirtyRef.current) return;
      // Put the landing place back, so a second press is caught too.
      window.history.pushState({ unusonicUnsavedGuard: true }, '', window.location.href);
      setPendingHref(fallbackRef.current ?? window.location.pathname);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [dirty]);

  const guard = React.useCallback(
    (href: string) => {
      if (!dirtyRef.current) return true;
      setPendingHref(href);
      return false;
    },
    [],
  );

  const cancel = React.useCallback(() => setPendingHref(null), []);

  const confirm = React.useCallback(() => {
    const href = pendingHref;
    setPendingHref(null);
    if (href) navigate(href);
  }, [pendingHref, navigate]);

  return { pendingHref, cancel, confirm, guard };
}
