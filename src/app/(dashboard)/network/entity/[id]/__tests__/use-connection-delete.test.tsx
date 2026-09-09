/**
 * Removing a connection, and the undo that replaces the confirmation modal.
 *
 * The old flow was a bottom-of-page danger zone plus a modal. Primer, which
 * invented the danger zone, reserves it for settings-level blast radius, and
 * both Primer and Carbon say undo beats confirmation once the action is
 * reversible — which ours is, since the delete is soft and /network lists it
 * under "Recently deleted" for thirty days.
 *
 * So the two things worth locking down are that the undo actually restores,
 * and that a roster member is never offered the action at all: the soft delete
 * only matches VENDOR / VENUE_PARTNER / CLIENT / PARTNER edges.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const softDelete = vi.fn();
const restore = vi.fn();
vi.mock('@/features/network-data', () => ({
  softDeleteGhostRelationship: (...args: unknown[]) => softDelete(...args),
  restoreGhostRelationship: (...args: unknown[]) => restore(...args),
}));

const success = vi.fn();
const error = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => success(...a), error: (...a: unknown[]) => error(...a) } }));

import { useConnectionDelete } from '../use-connection-delete';

const OPTS = {
  relationshipId: 'rel-1',
  sourceOrgId: 'org-1',
  returnPath: '/network',
  name: 'Waterfront Hilton',
};

beforeEach(() => {
  vi.clearAllMocks();
  softDelete.mockResolvedValue({ ok: true });
  restore.mockResolvedValue({ ok: true });
});

describe('useConnectionDelete', () => {
  it('removes, returns to the list, and offers an undo', async () => {
    const { result } = renderHook(() => useConnectionDelete(OPTS));
    act(() => { result.current?.(); });

    await waitFor(() => expect(softDelete).toHaveBeenCalledWith('rel-1', 'org-1'));
    // Carbon's rule for a completed delete: go back to the list and say what
    // happened there, rather than leaving the user on a record that is gone.
    expect(push).toHaveBeenCalledWith('/network');
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][1].action.label).toBe('Undo');
  });

  it('restores the same edge when the undo is taken', async () => {
    const { result } = renderHook(() => useConnectionDelete(OPTS));
    act(() => { result.current?.(); });
    await waitFor(() => expect(success).toHaveBeenCalled());

    act(() => { success.mock.calls[0][1].action.onClick(); });

    await waitFor(() => expect(restore).toHaveBeenCalledWith('rel-1', 'org-1'));
  });

  it('never navigates away when the delete fails', async () => {
    softDelete.mockResolvedValue({ ok: false, error: 'Relationship not found.' });
    const { result } = renderHook(() => useConnectionDelete(OPTS));

    act(() => { result.current?.(); });

    await waitFor(() => expect(error).toHaveBeenCalledWith('Relationship not found.'));
    expect(push).not.toHaveBeenCalled();
  });

  it('points at Recently deleted if the undo itself fails', async () => {
    restore.mockResolvedValue({ ok: false });
    const { result } = renderHook(() => useConnectionDelete(OPTS));
    act(() => { result.current?.(); });
    await waitFor(() => expect(success).toHaveBeenCalled());

    act(() => { success.mock.calls[0][1].action.onClick(); });

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(String(error.mock.calls[0][0])).toContain('Recently deleted');
  });

  it('offers nothing when there is no edge to remove', () => {
    // What a roster member gets: the caller passes null, so the shell renders
    // no overflow entry rather than an action that would fail on the server.
    const { result } = renderHook(() =>
      useConnectionDelete({ ...OPTS, relationshipId: null }),
    );
    expect(result.current).toBeUndefined();
  });
});
