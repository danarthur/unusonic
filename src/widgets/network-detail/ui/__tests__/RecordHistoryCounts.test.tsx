/**
 * The panel's history row.
 *
 * Three full lists — productions, referrals, invoices — became one line of
 * counts that link into the record page. What has to hold: the counts match
 * what the page would show, an empty bucket says nothing rather than "0", and
 * the two money directions never merge into one number.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getProductions = vi.fn();
const getReferrals = vi.fn();
const getMoney = vi.fn();

vi.mock('../../api/get-entity-productions', () => ({
  getEntityProductions: (...a: unknown[]) => getProductions(...a),
}));
vi.mock('../../api/get-referrals', () => ({
  getReferralsForEntity: (...a: unknown[]) => getReferrals(...a),
}));
vi.mock('@/features/network-data/api/get-entity-money', () => ({
  getEntityMoney: (...a: unknown[]) => getMoney(...a),
}));

import { RecordHistoryCounts } from '../RecordHistoryCounts';

function renderRow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RecordHistoryCounts workspaceId="ws-1" entityId="ent-1" recordHref="/network/entity/rel-1" />
    </QueryClientProvider>,
  );
}

const NO_MONEY = { theyOweUs: 0, weOweThem: 0, lifetimeBilled: 0, lifetimeCost: 0, invoices: [], openInvoices: [] };

beforeEach(() => {
  vi.clearAllMocks();
  getProductions.mockResolvedValue({ ok: true, productions: [], bands: { in_play: 0, booked: 0, past: 0 } });
  getReferrals.mockResolvedValue({ ok: true, referrals: { received: [], sent: [], receivedCount: 0, sentCount: 0 } });
  getMoney.mockResolvedValue(NO_MONEY);
});

describe('<RecordHistoryCounts />', () => {
  it('counts every production, and links into the page', async () => {
    getProductions.mockResolvedValue({
      ok: true,
      productions: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      bands: { in_play: 1, booked: 1, past: 1 },
    });
    renderRow();

    const link = await screen.findByRole('link', { name: '3 shows' });
    expect(link.getAttribute('href')).toBe('/network/entity/rel-1#productions');
  });

  it('sums referrals in both directions', async () => {
    getReferrals.mockResolvedValue({
      ok: true,
      referrals: { received: [], sent: [], receivedCount: 2, sentCount: 1 },
    });
    renderRow();

    expect(await screen.findByRole('link', { name: '3 referrals' })).toBeTruthy();
  });

  it('keeps the two money directions apart', async () => {
    // Never netted. One number for both would hide whichever is smaller, and
    // "they owe us" and "we owe them" are answers to different questions.
    getMoney.mockResolvedValue({ ...NO_MONEY, theyOweUs: 2400, weOweThem: 900 });
    renderRow();

    expect(await screen.findByRole('link', { name: '$2,400 outstanding' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '$900 to pay' })).toBeTruthy();
  });

  it('says nothing about a bucket that is empty', async () => {
    getProductions.mockResolvedValue({
      ok: true,
      productions: [{ id: 'a' }],
      bands: { in_play: 0, booked: 0, past: 1 },
    });
    renderRow();

    await screen.findByRole('link', { name: '1 show' });
    expect(screen.queryByText(/referral/)).toBeNull();
    expect(screen.queryByText(/outstanding/)).toBeNull();
  });

  it('renders nothing at all when there is no history', async () => {
    const { container } = renderRow();
    // Give the three queries a chance to settle before asserting emptiness.
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('a')).toBeNull();
  });
});
