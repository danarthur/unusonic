import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/shared/lib/workspace', () => ({
  getActiveWorkspaceId: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
const { createClient } = await import('@/shared/api/supabase/server');
const { getActiveWorkspaceId } = await import('@/shared/lib/workspace');
const { upsertExpense, deleteExpense } = await import('../expense-actions');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;
let opsBuilder: ReturnType<typeof createQueryBuilder>;

const validPayload = {
  event_id: 'evt-1',
  label: '  Speaker rental  ',
  category: 'equipment' as const,
  amount: 250,
};

const mockExpenseRow = {
  id: 'exp-1',
  event_id: 'evt-1',
  label: 'Speaker rental',
  category: 'equipment',
  amount: 250,
  vendor_entity_id: null,
  paid_at: null,
  payment_type: 'other',
  note: null,
  qbo_purchase_id: null,
  qbo_account_id: null,
  qbo_synced_at: null,
  created_at: '2026-04-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
  vi.mocked(createClient).mockResolvedValue(mockClient as any);
  vi.mocked(getActiveWorkspaceId).mockResolvedValue('ws-1');

  opsBuilder = createQueryBuilder();
  mockClient.schema.mockReturnValue({
    from: vi.fn().mockReturnValue(opsBuilder),
  } as any);
});

// ---------------------------------------------------------------------------
// upsertExpense
// ---------------------------------------------------------------------------
describe('upsertExpense', () => {
  it('returns error when no active workspace', async () => {
    vi.mocked(getActiveWorkspaceId).mockResolvedValue(null);

    const result = await upsertExpense(validPayload);
    expect(result).toEqual({ success: false, error: 'No active workspace.' });
  });

  it('inserts new expense when no id provided', async () => {
    opsBuilder.single.mockResolvedValue({ data: mockExpenseRow, error: null });

    const result = await upsertExpense(validPayload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.expense.label).toBe('Speaker rental');
      expect(result.expense.amount).toBe(250);
    }
    expect(opsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        label: 'Speaker rental', // trimmed
        payment_type: 'other',   // default
      }),
    );
  });

  it('updates existing expense when id provided', async () => {
    opsBuilder.single.mockResolvedValue({ data: mockExpenseRow, error: null });

    await upsertExpense({ ...validPayload, id: 'exp-1' });

    expect(opsBuilder.update).toHaveBeenCalled();
    expect(opsBuilder.eq).toHaveBeenCalledWith('id', 'exp-1');
    expect(opsBuilder.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
  });

  it('returns error when insert fails', async () => {
    opsBuilder.single.mockResolvedValue({
      data: null,
      error: { message: 'constraint violation' },
    });

    const result = await upsertExpense(validPayload);
    expect(result).toEqual({ success: false, error: 'constraint violation' });
  });

  it('trims label and note', async () => {
    opsBuilder.single.mockResolvedValue({ data: mockExpenseRow, error: null });

    await upsertExpense({
      ...validPayload,
      label: '  Tape  ',
      note: '  for stage  ',
    });

    expect(opsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Tape',
        note: 'for stage',
      }),
    );
  });

  it('defaults optional fields', async () => {
    opsBuilder.single.mockResolvedValue({ data: mockExpenseRow, error: null });

    await upsertExpense(validPayload);

    expect(opsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_entity_id: null,
        paid_at: null,
        payment_type: 'other',
        note: null,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// deleteExpense
// ---------------------------------------------------------------------------
describe('deleteExpense', () => {
  it('returns error when no active workspace', async () => {
    vi.mocked(getActiveWorkspaceId).mockResolvedValue(null);

    const result = await deleteExpense('exp-1');
    expect(result).toEqual({ success: false, error: 'No active workspace.' });
  });

  it('deletes expense scoped to workspace', async () => {
    const result = await deleteExpense('exp-1');

    expect(result).toEqual({ success: true });
    expect(opsBuilder.delete).toHaveBeenCalled();
    expect(opsBuilder.eq).toHaveBeenCalledWith('id', 'exp-1');
    expect(opsBuilder.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
  });

  it('returns error when delete fails', async () => {
    opsBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: null, error: { message: 'not found' } }),
    );

    const result = await deleteExpense('exp-1');
    expect(result).toEqual({ success: false, error: 'not found' });
  });
});
