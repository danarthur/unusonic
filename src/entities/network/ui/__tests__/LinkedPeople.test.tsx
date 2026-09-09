/**
 * The linked-partner chip.
 *
 * The graph has carried CO_HOST edges since the show-creation flow was built,
 * bidirectionally, with the pairing in context_data — and nothing read them.
 * What matters here is that the relationship type rides on the link (a name on
 * its own does not say why it is there) and that a record with no links says
 * nothing rather than showing an empty rail.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getLinkedPeople = vi.fn();
vi.mock('@/features/network-data/api/get-linked-people', () => ({
  getLinkedPeople: (...a: unknown[]) => getLinkedPeople(...a),
}));

const setLinkedStatus = vi.fn();
vi.mock('@/features/network-data/api/set-linked-status', () => ({
  setLinkedStatus: (...a: unknown[]) => setLinkedStatus(...a),
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() },
}));

import { LinkedPeople } from '../LinkedPeople';

function renderChips(editable = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LinkedPeople
        workspaceId="ws-1"
        entityId="ent-a"
        hrefFor={(id) => `/network/entity/${id}`}
        editable={editable}
      />
    </QueryClientProvider>,
  );
}

const JANE = {
  entityId: 'ent-b',
  name: 'Jane Okafor',
  avatarUrl: null,
  pairing: 'romantic' as const,
  anniversary: null,
  status: 'current' as const,
  endedOn: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getLinkedPeople.mockResolvedValue([]);
  setLinkedStatus.mockResolvedValue({ ok: true });
});

describe('<LinkedPeople />', () => {
  it('names the person and links to their record', async () => {
    getLinkedPeople.mockResolvedValue([JANE]);
    renderChips();

    const link = await screen.findByRole('link', { name: /Jane Okafor/ });
    expect(link.getAttribute('href')).toBe('/network/entity/ent-b');
  });

  it('says how they are connected, not just who they are', async () => {
    // "Partner", not "Spouse": the stored pairing is `romantic`, which is not a
    // claim about marriage, and guessing wrong on someone's own record is worse
    // than being general.
    getLinkedPeople.mockResolvedValue([JANE]);
    renderChips();

    expect(await screen.findByText('Partner')).toBeTruthy();
  });

  it('labels a co-host and a family member differently', async () => {
    getLinkedPeople.mockResolvedValue([
      { ...JANE, pairing: 'co_host' as const },
      { ...JANE, entityId: 'ent-c', name: 'Marcus Bell', pairing: 'family' as const },
    ]);
    renderChips();

    expect(await screen.findByText('Co-host')).toBeTruthy();
    expect(screen.getByText('Family')).toBeTruthy();
  });

  it('keeps showing a pair that has ended, and says it has', async () => {
    // The show still happened and the invoice still names both. Hiding a former
    // partner takes the second name off a record that really did have two --
    // which is why Blackbaud's rule is to end-date rather than delete, and why
    // NPSP renders the result as "(Former)" instead of dropping it.
    getLinkedPeople.mockResolvedValue([
      { ...JANE, status: 'former' as const, endedOn: '2026-02-14' },
    ]);
    renderChips();

    expect(await screen.findByText('Former partner')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Jane Okafor/ })).toBeTruthy();
  });

  it('carries the end date without spending a line on it', async () => {
    getLinkedPeople.mockResolvedValue([
      { ...JANE, status: 'former' as const, endedOn: '2026-02-14' },
    ]);
    renderChips();

    const link = await screen.findByRole('link', { name: /Jane Okafor/ });
    expect(link.getAttribute('title')).toBe('Ended 2026-02-14');
  });

  it('renders nothing when nobody is linked', async () => {
    const { container } = renderChips();
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('a')).toBeNull();
  });

  it('shows every link, not just the first', async () => {
    getLinkedPeople.mockResolvedValue([
      JANE,
      { ...JANE, entityId: 'ent-c', name: 'Marcus Bell', pairing: 'co_host' as const },
    ]);
    renderChips();

    await screen.findByRole('link', { name: /Jane Okafor/ });
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});

describe('<LinkedPeople /> ending a link', () => {
  it('offers no control in the panel, which is a peek', async () => {
    getLinkedPeople.mockResolvedValue([JANE]);
    renderChips(false);

    await screen.findByRole('link', { name: /Jane Okafor/ });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('asks when it ended rather than assuming today', async () => {
    // September is when you were told; February is when it happened. Stamping
    // the day you heard puts a wrong fact in the record and calls it history.
    getLinkedPeople.mockResolvedValue([JANE]);
    renderChips(true);
    fireEvent.click(await screen.findByRole('button', { name: /Mark Jane Okafor as former partner/ }));

    const date = await screen.findByLabelText(/Date Jane Okafor stopped being linked/);
    // Nothing is written until the date is confirmed.
    expect(setLinkedStatus).not.toHaveBeenCalled();

    fireEvent.change(date, { target: { value: '2026-02-14' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Jane Okafor is a former link/ }));

    await waitFor(() =>
      expect(setLinkedStatus).toHaveBeenCalledWith('ent-a', 'ent-b', 'former', '2026-02-14'),
    );
  });

  it('defaults the date to today, because that is usually right', async () => {
    getLinkedPeople.mockResolvedValue([JANE]);
    renderChips(true);
    fireEvent.click(await screen.findByRole('button', { name: /Mark Jane Okafor as former/ }));

    const date = await screen.findByLabelText(/Date Jane Okafor stopped being linked/);
    expect((date as HTMLInputElement).value).toBe(new Date().toISOString().slice(0, 10));
  });

  it('writes nothing if the prompt is dismissed', async () => {
    getLinkedPeople.mockResolvedValue([JANE]);
    renderChips(true);
    fireEvent.click(await screen.findByRole('button', { name: /Mark Jane Okafor as former/ }));
    await screen.findByLabelText(/Date Jane Okafor stopped being linked/);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(setLinkedStatus).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/stopped being linked/)).toBeNull();
  });

  it('offers an undo rather than asking first', async () => {
    // Nothing is destroyed either way -- the edge survives both directions --
    // so a confirmation would be friction on a one-click-reversible change.
    getLinkedPeople.mockResolvedValue([JANE]);
    renderChips(true);
    fireEvent.click(await screen.findByRole('button', { name: /Mark Jane Okafor as former/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Confirm Jane Okafor is a former link/ }),
    );

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastSuccess.mock.calls[0][1].action.label).toBe('Undo');

    setLinkedStatus.mockClear();
    toastSuccess.mock.calls[0][1].action.onClick();
    await waitFor(() => expect(setLinkedStatus).toHaveBeenCalledWith('ent-a', 'ent-b', 'current', null));
  });

  it('restores a former pair', async () => {
    getLinkedPeople.mockResolvedValue([{ ...JANE, status: 'former' as const, endedOn: '2026-02-14' }]);
    renderChips(true);

    fireEvent.click(await screen.findByRole('button', { name: /Restore Jane Okafor as partner/ }));

    await waitFor(() =>
      expect(setLinkedStatus).toHaveBeenCalledWith('ent-a', 'ent-b', 'current', null),
    );
  });
});
