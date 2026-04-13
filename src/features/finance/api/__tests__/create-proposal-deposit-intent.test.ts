import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: vi.fn(),
}));

vi.mock('@/shared/api/stripe/server', () => ({
  getStripe: vi.fn(),
}));

vi.mock('@/features/finance/lib/calculate-deposit', () => ({
  calculateDepositTotal: vi.fn(),
  calculateDepositCents: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
const { getSystemClient } = await import('@/shared/api/supabase/system');
const { getStripe } = await import('@/shared/api/stripe/server');
const { calculateDepositTotal, calculateDepositCents } = await import(
  '@/features/finance/lib/calculate-deposit'
);
const { createProposalDepositIntent } = await import('../create-proposal-deposit-intent');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;
let proposalBuilder: ReturnType<typeof createQueryBuilder>;
let itemsBuilder: ReturnType<typeof createQueryBuilder>;
let selectionsBuilder: ReturnType<typeof createQueryBuilder>;
let updateBuilder: ReturnType<typeof createQueryBuilder>;
let mockStripe: {
  paymentIntents: {
    create: ReturnType<typeof vi.fn>;
    retrieve: ReturnType<typeof vi.fn>;
  };
};

const baseProposal = {
  id: 'prop-1',
  status: 'accepted',
  deposit_percent: 50,
  stripe_payment_intent_id: null,
  deposit_paid_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();

  mockClient = createMockSupabaseClient();

  // Track builders for each .from() call in order:
  // 1st: proposals query, 2nd: proposal_items, 3rd: selections, 4th: update
  proposalBuilder = createQueryBuilder();
  itemsBuilder = createQueryBuilder();
  selectionsBuilder = createQueryBuilder();
  updateBuilder = createQueryBuilder();

  let fromCallCount = 0;
  mockClient.from.mockImplementation((table: string) => {
    if (table === 'proposals') {
      fromCallCount++;
      // First proposals call = select, subsequent = update
      return fromCallCount <= 1 ? proposalBuilder : updateBuilder;
    }
    if (table === 'proposal_items') return itemsBuilder;
    if (table === 'proposal_client_selections') return selectionsBuilder;
    return createQueryBuilder();
  });

  vi.mocked(getSystemClient).mockReturnValue(mockClient as any);

  mockStripe = {
    paymentIntents: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  };
  vi.mocked(getStripe).mockReturnValue(mockStripe as any);

  vi.mocked(calculateDepositTotal).mockReturnValue(10000);
  vi.mocked(calculateDepositCents).mockReturnValue(500000); // $5000 in cents
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('createProposalDepositIntent', () => {
  it('returns error for empty token', async () => {
    const result = await createProposalDepositIntent('');
    expect(result).toEqual({ clientSecret: null, error: 'Invalid token' });
  });

  it('returns error for whitespace-only token', async () => {
    const result = await createProposalDepositIntent('   ');
    expect(result).toEqual({ clientSecret: null, error: 'Invalid token' });
  });

  it('returns error when proposal not found', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await createProposalDepositIntent('some-token');
    expect(result).toEqual({
      clientSecret: null,
      error: 'Proposal not found or not yet signed',
    });
  });

  it('returns alreadyPaid when deposit_paid_at is set', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: { ...baseProposal, deposit_paid_at: '2026-04-01T00:00:00Z' },
      error: null,
    });

    const result = await createProposalDepositIntent('some-token');
    expect(result).toEqual({ clientSecret: null, alreadyPaid: true });
  });

  it('returns error when deposit_percent is 0', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: { ...baseProposal, deposit_percent: 0 },
      error: null,
    });

    const result = await createProposalDepositIntent('some-token');
    expect(result).toEqual({
      clientSecret: null,
      error: 'No deposit required for this proposal',
    });
  });

  it('returns error when deposit_percent is null', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: { ...baseProposal, deposit_percent: null },
      error: null,
    });

    const result = await createProposalDepositIntent('some-token');
    expect(result).toEqual({
      clientSecret: null,
      error: 'No deposit required for this proposal',
    });
  });

  it('returns error when calculated deposit cents is 0', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: baseProposal,
      error: null,
    });
    vi.mocked(calculateDepositCents).mockReturnValue(0);

    const result = await createProposalDepositIntent('some-token');
    expect(result).toEqual({ clientSecret: null, error: 'Deposit amount is zero' });
  });

  it('returns error when Stripe is not configured', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: baseProposal,
      error: null,
    });
    vi.mocked(getStripe).mockReturnValue(null as any);

    const result = await createProposalDepositIntent('some-token');
    expect(result).toEqual({ clientSecret: null, error: 'Stripe not configured' });
  });

  it('creates new PaymentIntent and persists ID', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: baseProposal,
      error: null,
    });

    mockStripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_new',
      client_secret: 'cs_secret_new',
    });

    const result = await createProposalDepositIntent('some-token');

    expect(result).toEqual({ clientSecret: 'cs_secret_new' });
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
      amount: 500000,
      currency: 'usd',
      metadata: {
        proposal_id: 'prop-1',
        public_token: 'some-token',
        type: 'proposal_deposit',
      },
      automatic_payment_methods: { enabled: true },
    });
  });

  it('reuses existing intent when stripe_payment_intent_id is set', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: { ...baseProposal, stripe_payment_intent_id: 'pi_existing' },
      error: null,
    });
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      status: 'requires_payment_method',
      client_secret: 'cs_secret_existing',
    });

    const result = await createProposalDepositIntent('some-token');

    expect(result).toEqual({ clientSecret: 'cs_secret_existing' });
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('marks already paid when existing intent has succeeded', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: { ...baseProposal, stripe_payment_intent_id: 'pi_done' },
      error: null,
    });
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      status: 'succeeded',
      client_secret: 'cs_irrelevant',
    });

    const result = await createProposalDepositIntent('some-token');
    expect(result).toEqual({ clientSecret: null, alreadyPaid: true });
  });

  it('creates new intent when retrieve throws (stale ID)', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: { ...baseProposal, stripe_payment_intent_id: 'pi_stale' },
      error: null,
    });
    mockStripe.paymentIntents.retrieve.mockRejectedValue(new Error('not found'));
    mockStripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_replacement',
      client_secret: 'cs_secret_replacement',
    });

    const result = await createProposalDepositIntent('some-token');
    expect(result).toEqual({ clientSecret: 'cs_secret_replacement' });
  });

  it('trims token before querying', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

    await createProposalDepositIntent('  tok  ');
    expect(proposalBuilder.eq).toHaveBeenCalledWith('public_token', 'tok');
  });
});
