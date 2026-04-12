import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
const { createClient } = await import('@/shared/api/supabase/server');
const { getSystemClient } = await import('@/shared/api/supabase/system');
const { spawnInvoicesFromProposal, recordManualPayment } = await import(
  '../invoice-actions'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockSessionClient: ReturnType<typeof createMockSupabaseClient>;
let mockSystemClient: ReturnType<typeof createMockSupabaseClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionClient = createMockSupabaseClient();
  mockSystemClient = createMockSupabaseClient();
  vi.mocked(createClient).mockResolvedValue(mockSessionClient as any);
  vi.mocked(getSystemClient).mockReturnValue(mockSystemClient as any);
});

// ---------------------------------------------------------------------------
// spawnInvoicesFromProposal
// ---------------------------------------------------------------------------
describe('spawnInvoicesFromProposal', () => {
  it('verifies workspace access then calls RPC', async () => {
    // Session client: proposal access check passes
    const proposalBuilder = createQueryBuilder();
    mockSessionClient.from.mockReturnValue(proposalBuilder as any);
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: { id: 'prop-1', workspace_id: 'ws-1' },
      error: null,
    });

    // System client: schema().rpc() succeeds
    const schemaRpc = vi.fn().mockResolvedValue({
      data: [{ invoice_id: 'inv-1', invoice_kind: 'standalone' }],
      error: null,
    });
    mockSystemClient.schema = vi.fn().mockReturnValue({ rpc: schemaRpc }) as any;

    const result = await spawnInvoicesFromProposal('prop-1');

    expect(mockSessionClient.from).toHaveBeenCalledWith('proposals');
    expect(mockSystemClient.schema).toHaveBeenCalledWith('finance');
    expect(schemaRpc).toHaveBeenCalledWith('spawn_invoices_from_proposal', {
      p_proposal_id: 'prop-1',
    });
    expect(result.invoices).toHaveLength(1);
    expect(result.error).toBeNull();
  });

  it('returns error when proposal not found (auth fails)', async () => {
    const proposalBuilder = createQueryBuilder();
    mockSessionClient.from.mockReturnValue(proposalBuilder as any);
    proposalBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await spawnInvoicesFromProposal('prop-bad');
    expect(result.invoices).toEqual([]);
    expect(result.error).toBe('Proposal not found or access denied');
  });

  it('returns error when RPC fails', async () => {
    const proposalBuilder = createQueryBuilder();
    mockSessionClient.from.mockReturnValue(proposalBuilder as any);
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: { id: 'prop-1', workspace_id: 'ws-1' },
      error: null,
    });

    const schemaRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Proposal prop-1 not found' },
    });
    mockSystemClient.schema = vi.fn().mockReturnValue({ rpc: schemaRpc }) as any;

    const result = await spawnInvoicesFromProposal('prop-1');
    expect(result.error).toBe('Proposal prop-1 not found');
  });
});

// ---------------------------------------------------------------------------
// recordManualPayment
// ---------------------------------------------------------------------------
describe('recordManualPayment', () => {
  function setupAuthAndSystem() {
    // Session client: invoice access check passes via schema().from() chain
    const invoiceBuilder = createQueryBuilder();
    invoiceBuilder.maybeSingle.mockResolvedValue({ data: { id: 'inv-1' }, error: null });
    const invoiceSchemaFrom = vi.fn().mockReturnValue(invoiceBuilder);
    mockSessionClient.schema = vi.fn().mockReturnValue({ from: invoiceSchemaFrom }) as any;
    mockSessionClient.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    } as any;

    // System client: schema().rpc() returns payment ID
    const schemaRpc = vi.fn().mockResolvedValue({ data: 'pay-1', error: null });
    mockSystemClient.schema = vi.fn().mockReturnValue({ rpc: schemaRpc }) as any;

    return { invoiceSchemaFrom, schemaRpc };
  }

  it('records a check payment through the canonical RPC path', async () => {
    const { schemaRpc } = setupAuthAndSystem();

    const result = await recordManualPayment({
      invoiceId: 'inv-1',
      amount: 500,
      method: 'check',
      reference: 'CHK-1284',
    });

    expect(schemaRpc).toHaveBeenCalledWith('record_payment', expect.objectContaining({
      p_invoice_id: 'inv-1',
      p_amount: 500,
      p_method: 'check',
      p_reference: 'CHK-1284',
      p_status: 'succeeded',
      p_recorded_by_user_id: 'user-1',
    }));
    expect(result).toEqual({ paymentId: 'pay-1', error: null });
  });

  it('returns error when invoice not found', async () => {
    const invoiceBuilder = createQueryBuilder();
    invoiceBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    const invoiceSchemaFrom = vi.fn().mockReturnValue(invoiceBuilder);
    mockSessionClient.schema = vi.fn().mockReturnValue({ from: invoiceSchemaFrom }) as any;

    const result = await recordManualPayment({
      invoiceId: 'inv-bad',
      amount: 100,
      method: 'cash',
    });

    expect(result).toEqual({ paymentId: null, error: 'Invoice not found or access denied' });
  });

  it('returns error when RPC fails', async () => {
    // Auth passes
    const invoiceBuilder = createQueryBuilder();
    invoiceBuilder.maybeSingle.mockResolvedValue({ data: { id: 'inv-1' }, error: null });
    const invoiceSchemaFrom = vi.fn().mockReturnValue(invoiceBuilder);
    mockSessionClient.schema = vi.fn().mockReturnValue({ from: invoiceSchemaFrom }) as any;
    mockSessionClient.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    } as any;

    // RPC fails
    const schemaRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Cannot record payment on invoice with status "draft"' },
    });
    mockSystemClient.schema = vi.fn().mockReturnValue({ rpc: schemaRpc }) as any;

    const result = await recordManualPayment({
      invoiceId: 'inv-1',
      amount: 100,
      method: 'wire',
    });

    expect(result.error).toContain('Cannot record payment');
  });
});
