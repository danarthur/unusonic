/**
 * The unsaved-changes guard, and everything it must stay quiet about.
 *
 * The negatives matter more than the positive here. A guard that fires on an
 * accordion toggle, or on a clean form, teaches people to dismiss it without
 * reading — and then it is worse than no guard at all.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUnsavedChanges } from '../use-unsaved-changes';

/**
 * Dispatch a click and report whether the hook stopped it.
 *
 * The probe is registered after the hook's own listener and in the same capture
 * phase, so it reads the hook's decision and then cancels the event regardless
 * -- otherwise the clicks the hook correctly lets through would send the test
 * DOM off trying to load the page.
 */
function clickIn(el: HTMLElement, init: MouseEventInit = {}) {
  let prevented = false;
  const probe = (e: Event) => {
    prevented = e.defaultPrevented;
    e.preventDefault();
  };
  document.addEventListener('click', probe, true);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  act(() => { el.dispatchEvent(event); });
  document.removeEventListener('click', probe, true);
  return { defaultPrevented: prevented };
}

function anchor(href: string, attrs: Record<string, string> = {}) {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.appendChild(a);
  return a;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('useUnsavedChanges', () => {
  it('intercepts an in-app link while the form is dirty', () => {
    const navigate = vi.fn();
    const { result } = renderHook(() => useUnsavedChanges(true, navigate));

    const event = clickIn(anchor('/network'));

    expect(event.defaultPrevented).toBe(true);
    expect(result.current.pendingHref).toBe('/network');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates once the user discards', () => {
    const navigate = vi.fn();
    const { result } = renderHook(() => useUnsavedChanges(true, navigate));
    clickIn(anchor('/network'));

    act(() => { result.current.confirm(); });

    expect(navigate).toHaveBeenCalledWith('/network');
    expect(result.current.pendingHref).toBeNull();
  });

  it('stays put when the user cancels, and does not navigate', () => {
    const navigate = vi.fn();
    const { result } = renderHook(() => useUnsavedChanges(true, navigate));
    clickIn(anchor('/network'));

    act(() => { result.current.cancel(); });

    expect(result.current.pendingHref).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says nothing when the form is clean', () => {
    const { result } = renderHook(() => useUnsavedChanges(false, vi.fn()));
    const event = clickIn(anchor('/network'));

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pendingHref).toBeNull();
  });

  it('ignores a button, so collapsing a section never prompts', () => {
    // Progressive disclosure is not navigation. The hook only ever looks at
    // anchors, which is what makes this true by construction.
    const { result } = renderHook(() => useUnsavedChanges(true, vi.fn()));
    const button = document.createElement('button');
    document.body.appendChild(button);

    const event = clickIn(button);

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pendingHref).toBeNull();
  });

  it('lets a new-tab link through', () => {
    const { result } = renderHook(() => useUnsavedChanges(true, vi.fn()));
    const event = clickIn(anchor('/network', { target: '_blank' }));

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pendingHref).toBeNull();
  });

  it('lets a download through', () => {
    const { result } = renderHook(() => useUnsavedChanges(true, vi.fn()));
    const event = clickIn(anchor('/files/report.pdf', { download: '' }));

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pendingHref).toBeNull();
  });

  it('lets a cmd-click through', () => {
    const { result } = renderHook(() => useUnsavedChanges(true, vi.fn()));
    const event = clickIn(anchor('/network'), { metaKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pendingHref).toBeNull();
  });

  it('ignores an in-page anchor', () => {
    const { result } = renderHook(() => useUnsavedChanges(true, vi.fn()));
    const event = clickIn(anchor('#compliance'));

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pendingHref).toBeNull();
  });

  it('ignores a link to where you already are', () => {
    const { result } = renderHook(() => useUnsavedChanges(true, vi.fn()));
    const event = clickIn(anchor(window.location.pathname));

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pendingHref).toBeNull();
  });

  it('leaves another origin to the browser dialog', () => {
    const { result } = renderHook(() => useUnsavedChanges(true, vi.fn()));
    const event = clickIn(anchor('https://example.com/docs'));

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pendingHref).toBeNull();
  });

  it('guards a navigation the hook cannot see, like the page Back button', () => {
    const { result } = renderHook(() => useUnsavedChanges(true, vi.fn()));

    let allowed = true;
    act(() => { allowed = result.current.guard('/network'); });

    expect(allowed).toBe(false);
    expect(result.current.pendingHref).toBe('/network');
  });

  it('waves that same navigation through when nothing is dirty', () => {
    const { result } = renderHook(() => useUnsavedChanges(false, vi.fn()));

    let allowed = false;
    act(() => { allowed = result.current.guard('/network'); });

    expect(allowed).toBe(true);
    expect(result.current.pendingHref).toBeNull();
  });

  it('drops a pending prompt if a save lands while it is open', () => {
    const { result, rerender } = renderHook(
      ({ dirty }) => useUnsavedChanges(dirty, vi.fn()),
      { initialProps: { dirty: true } },
    );
    clickIn(anchor('/network'));
    expect(result.current.pendingHref).toBe('/network');

    rerender({ dirty: false });

    expect(result.current.pendingHref).toBeNull();
  });
});

describe('useUnsavedChanges and the Back button', () => {
  it('gives a Back press somewhere to land while the form is dirty', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    renderHook(() => useUnsavedChanges(true, vi.fn(), '/network'));

    expect(pushState).toHaveBeenCalledWith(
      { unusonicUnsavedGuard: true },
      '',
      window.location.href,
    );
    pushState.mockRestore();
  });

  it('pushes nothing while the form is clean', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    renderHook(() => useUnsavedChanges(false, vi.fn(), '/network'));

    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it('asks, and offers the page’s own destination', () => {
    const { result } = renderHook(() => useUnsavedChanges(true, vi.fn(), '/network'));

    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

    expect(result.current.pendingHref).toBe('/network');
  });

  it('restores the landing place, so a second press is caught too', () => {
    renderHook(() => useUnsavedChanges(true, vi.fn(), '/network'));
    const pushState = vi.spyOn(window.history, 'pushState');

    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

    expect(pushState).toHaveBeenCalledTimes(1);
    pushState.mockRestore();
  });

  it('leaves a clean form’s Back press alone', () => {
    const { result } = renderHook(() => useUnsavedChanges(false, vi.fn(), '/network'));

    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

    expect(result.current.pendingHref).toBeNull();
  });

  it('goes where the page’s own Back goes, not back by a computed count', () => {
    // Unwinding the stack by a count is the part that breaks when the record
    // was the first page opened in the tab.
    const navigate = vi.fn();
    const { result } = renderHook(() => useUnsavedChanges(true, navigate, '/network'));
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

    act(() => { result.current.confirm(); });

    expect(navigate).toHaveBeenCalledWith('/network');
  });
});
