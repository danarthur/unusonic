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
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getLinkedPeople = vi.fn();
vi.mock('@/features/network-data/api/get-linked-people', () => ({
  getLinkedPeople: (...a: unknown[]) => getLinkedPeople(...a),
}));

import { LinkedPeople } from '../LinkedPeople';

function renderChips() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LinkedPeople
        workspaceId="ws-1"
        entityId="ent-a"
        hrefFor={(id) => `/network/entity/${id}`}
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
};

beforeEach(() => {
  vi.clearAllMocks();
  getLinkedPeople.mockResolvedValue([]);
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
