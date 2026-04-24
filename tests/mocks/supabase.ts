/**
 * Reusable Supabase client mock factory.
 *
 * Usage in tests:
 *   import { createMockSupabaseClient } from '@/../tests/mocks/supabase';
 *   const client = createMockSupabaseClient();
 *   // Configure return values per-test:
 *   vi.mocked(client.from('deals').select).mockReturnValue(...)
 */

import { vi } from 'vitest';

type MockResponse = { data: unknown; error: null | { message: string } };

function createQueryBuilder() {
  const defaultResponse: MockResponse = { data: null, error: null };

  const builder: Record<string, ReturnType<typeof vi.fn>> = {};

  // Terminal methods — return a mock response
  const terminalMethods = [
    'single',
    'maybeSingle',
    'csv',
  ] as const;

  // Chainable methods — return the builder itself
  const chainableMethods = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'like',
    'ilike',
    'is',
    'in',
    'contains',
    'containedBy',
    'filter',
    'not',
    'or',
    'match',
    'order',
    'limit',
    'range',
    'textSearch',
    'returns',
    'throwOnError',
    'abortSignal',
  ] as const;

  for (const method of chainableMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  for (const method of terminalMethods) {
    builder[method] = vi.fn().mockResolvedValue(defaultResponse);
  }

  // Make the builder itself thenable so `await supabase.from('x').select()`
  // resolves without calling `.single()`.
  builder.then = vi.fn().mockImplementation((resolve: (...args: unknown[]) => unknown) =>
    resolve(defaultResponse),
  );

  return builder;
}

export { createQueryBuilder };

export function createMockSupabaseClient() {
  const client = {
    // ── from() ─────────────────────────────────────────────────────────────
    // Fresh builder per call so multi-table actions don't share state.
    from: vi.fn().mockImplementation(() => createQueryBuilder()),

    // ── schema().from() ────────────────────────────────────────────────────
    // Fresh builder per schema().from() call for the same reason.
    schema: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => createQueryBuilder()),
    })),

    // ── rpc() ──────────────────────────────────────────────────────────────
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),

    // ── auth ───────────────────────────────────────────────────────────────
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'mock-user-id',
            email: 'test@unusonic.com',
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          },
        },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      }),
    },

    // ── storage ────────────────────────────────────────────────────────────
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: '' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: '' } }),
        download: vi.fn().mockResolvedValue({ data: null, error: null }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
  };

  return client;
}

export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>;
