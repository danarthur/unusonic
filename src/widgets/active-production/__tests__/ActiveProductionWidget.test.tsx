/**
 * Empty-state coverage for ActiveProductionWidget — Phase 2.5.
 *
 * This widget does its own supabase fetch and does NOT use WidgetShell, so we
 * mock the supabase client + workspace provider and assert the registry empty
 * copy renders when the events query returns no rows.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { METRICS } from '@/shared/lib/metrics/registry';

const EMPTY_COPY = METRICS['lobby.active_production'].emptyState.body;

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/shared/ui/providers/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    workspaceId: 'ws-test',
    workspaceName: 'Test',
    role: 'owner',
    hasWorkspace: true,
  }),
}));

function makeSupabaseStub(rows: unknown[]) {
  // Supabase's builder is both chainable AND thenable (PostgrestFilterBuilder).
  // We mirror that: each call returns the same chain object, and awaiting it
  // resolves to the supabase-shaped { data, error } payload.
  const chain: Record<string, unknown> = {
    select: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    eq: () => chain,
    then: (onFulfilled: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(onFulfilled),
  };
  return {
    schema: () => ({ from: () => chain }),
  };
}

let supabaseStub = makeSupabaseStub([]);

vi.mock('@/shared/api/supabase/client', () => ({
  createClient: () => supabaseStub,
}));

// ── Tests ───────────────────────────────────────────────────────────────────

describe('<ActiveProductionWidget />', () => {
  it('renders registry empty copy when no events return', async () => {
    supabaseStub = makeSupabaseStub([]);
    const { ActiveProductionWidget } = await import('../ui/active-production-widget');
    render(<ActiveProductionWidget />);
    await waitFor(() => {
      expect(screen.getByText(EMPTY_COPY)).toBeTruthy();
    });
  });
});
