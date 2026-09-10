/**
 * Adding the second person.
 *
 * The behaviour that matters is the ordering: an existing person is offered
 * before the option to make a new one. Split those two jobs, or bury the search,
 * and you get Dubsado's outcome — the same human in the directory twice with
 * nothing joining the copies — and no vendor ships household detection to clean
 * it up afterwards.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const searchLinkablePeople = vi.fn();
const linkPartner = vi.fn();
vi.mock('@/features/network-data/api/link-partner', () => ({
  searchLinkablePeople: (...a: unknown[]) => searchLinkablePeople(...a),
  linkPartner: (...a: unknown[]) => linkPartner(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AddLinkedPerson } from '../AddLinkedPerson';

const onLinked = vi.fn();

function open() {
  render(<AddLinkedPerson entityId="ent-a" sourceOrgId="org-1" onLinked={onLinked} />);
  fireEvent.click(screen.getByRole('button', { name: 'Link another person' }));
  return screen.getByRole('textbox', { name: /Search people/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  searchLinkablePeople.mockResolvedValue([]);
  linkPartner.mockResolvedValue({ ok: true, entityId: 'ent-b' });
});

describe('<AddLinkedPerson />', () => {
  it('offers someone you already have before offering to make one', async () => {
    searchLinkablePeople.mockResolvedValue([
      { entityId: 'ent-b', name: 'Jane Okafor', avatarUrl: null, subtitle: 'Client' },
    ]);
    const input = open();

    fireEvent.change(input, { target: { value: 'Jane' } });
    vi.advanceTimersByTime(250);

    const existing = await screen.findByRole('button', { name: /Jane Okafor/ });
    const create = screen.getByRole('button', { name: /as a new person/ });
    // Existing first in the DOM, so it is first under the cursor.
    expect(existing.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('links the existing person rather than creating a second copy', async () => {
    searchLinkablePeople.mockResolvedValue([
      { entityId: 'ent-b', name: 'Jane Okafor', avatarUrl: null, subtitle: null },
    ]);
    const input = open();
    fireEvent.change(input, { target: { value: 'Jane' } });
    vi.advanceTimersByTime(250);

    fireEvent.click(await screen.findByRole('button', { name: /Jane Okafor/ }));

    await waitFor(() =>
      expect(linkPartner).toHaveBeenCalledWith('ent-a', { existingEntityId: 'ent-b' }, 'romantic', 'org-1'),
    );
    expect(onLinked).toHaveBeenCalled();
  });

  it('creates one only when you ask for it by name', async () => {
    const input = open();
    fireEvent.change(input, { target: { value: 'Marcus Bell' } });
    vi.advanceTimersByTime(250);

    fireEvent.click(await screen.findByRole('button', { name: /as a new person/ }));

    await waitFor(() =>
      expect(linkPartner).toHaveBeenCalledWith('ent-a', { name: 'Marcus Bell' }, 'romantic', 'org-1'),
    );
  });

  it('carries the pairing you picked', async () => {
    const input = open();
    fireEvent.click(screen.getByRole('button', { name: 'Co-host' }));
    fireEvent.change(input, { target: { value: 'Marcus Bell' } });
    vi.advanceTimersByTime(250);

    fireEvent.click(await screen.findByRole('button', { name: /as a new person/ }));

    await waitFor(() =>
      expect(linkPartner).toHaveBeenCalledWith('ent-a', { name: 'Marcus Bell' }, 'co_host', 'org-1'),
    );
  });

  it('does not search on a single letter', () => {
    const input = open();
    fireEvent.change(input, { target: { value: 'J' } });
    vi.advanceTimersByTime(250);

    expect(searchLinkablePeople).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /as a new person/ })).toBeNull();
  });
});
