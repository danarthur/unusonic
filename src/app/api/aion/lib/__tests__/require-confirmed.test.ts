/**
 * requireConfirmed gate tests (Phase 3 §3.5 C3 rail).
 *
 * The gate must throw a ConfirmationError with the right code for each
 * broken-state path. These tests stub the getSystemClient via module mock
 * so the unit stays isolated from supabase.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type StubRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  tool_name: 'send_reply' | 'schedule_followup' | 'update_narrative';
  deal_id: string | null;
  artifact_ref: Record<string, unknown>;
  input_params: Record<string, unknown>;
  confirmed_at: string | null;
  executed_at: string | null;
};

let mockRow: StubRow | null = null;
let mockError: { message: string } | null = null;

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: mockRow, error: mockError }),
          }),
        }),
      }),
    }),
  }),
}));

import { requireConfirmed, ConfirmationError } from '../require-confirmed';

function makeRow(overrides: Partial<StubRow> = {}): StubRow {
  return {
    id: 'draft-1',
    workspace_id: 'ws-1',
    user_id: 'user-1',
    tool_name: 'send_reply',
    deal_id: 'deal-1',
    artifact_ref: { message_id: 'msg-1' },
    input_params: {},
    confirmed_at: '2026-04-23T10:00:00Z',
    executed_at: null,
    ...overrides,
  };
}

describe('requireConfirmed', () => {
  beforeEach(() => {
    mockRow = null;
    mockError = null;
  });

  it('returns the row when draft is confirmed, unexecuted, and owned by caller', async () => {
    mockRow = makeRow();
    const result = await requireConfirmed('draft-1', 'user-1');
    expect(result.id).toBe('draft-1');
    expect(result.confirmed_at).toBe('2026-04-23T10:00:00Z');
  });

  it('throws draft_not_found when supabase returns null + no error', async () => {
    mockRow = null;
    mockError = null;
    try {
      await requireConfirmed('missing-id', 'user-1');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfirmationError);
      expect((err as ConfirmationError).code).toBe('draft_not_found');
    }
  });

  it('throws draft_not_found when supabase returns an error', async () => {
    mockError = { message: 'network' };
    try {
      await requireConfirmed('draft-1', 'user-1');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ConfirmationError).code).toBe('draft_not_found');
    }
  });

  it('throws draft_user_mismatch when row belongs to a different user', async () => {
    mockRow = makeRow({ user_id: 'other-user' });
    try {
      await requireConfirmed('draft-1', 'user-1');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ConfirmationError).code).toBe('draft_user_mismatch');
    }
  });

  it('throws draft_not_confirmed when confirmed_at is null', async () => {
    mockRow = makeRow({ confirmed_at: null });
    try {
      await requireConfirmed('draft-1', 'user-1');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ConfirmationError).code).toBe('draft_not_confirmed');
    }
  });

  it('throws draft_already_executed when executed_at is set (replay guard)', async () => {
    mockRow = makeRow({ executed_at: '2026-04-23T10:05:00Z' });
    try {
      await requireConfirmed('draft-1', 'user-1');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ConfirmationError).code).toBe('draft_already_executed');
    }
  });

  it('user-mismatch check runs BEFORE confirmed-at check (enumeration oracle discipline)', async () => {
    // Row belongs to user-B, never confirmed. We expect user_mismatch, not
    // not_confirmed — knowing WHICH state a draft is in is information a
    // cross-user caller shouldn't learn.
    mockRow = makeRow({ user_id: 'other-user', confirmed_at: null });
    try {
      await requireConfirmed('draft-1', 'user-1');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ConfirmationError).code).toBe('draft_user_mismatch');
    }
  });

  it('executed-at check runs BEFORE not-confirmed check', async () => {
    // Edge: an executed draft that somehow has confirmed_at NULL shouldn't be
    // re-runnable. Executed beats everything downstream.
    mockRow = makeRow({ confirmed_at: null, executed_at: '2026-04-23T10:05:00Z' });
    try {
      await requireConfirmed('draft-1', 'user-1');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as ConfirmationError).code).toBe('draft_already_executed');
    }
  });
});

describe('ConfirmationError', () => {
  it('carries its code and message', () => {
    const err = new ConfirmationError('oops', 'draft_not_found');
    expect(err.name).toBe('ConfirmationError');
    expect(err.message).toBe('oops');
    expect(err.code).toBe('draft_not_found');
  });
});
