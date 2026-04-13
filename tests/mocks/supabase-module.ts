/**
 * Module-level mock for `@/shared/api/supabase/server`.
 *
 * Usage in test files:
 *   import { mockClient } from '@/../tests/mocks/supabase-module';
 *   vi.mock('@/shared/api/supabase/server', () => import('../../../tests/mocks/supabase-module'));
 *
 * Then configure the mock client per-test:
 *   mockClient.from.mockReturnValue(...)
 */

import { createMockSupabaseClient } from './supabase';

export const mockClient = createMockSupabaseClient();

export async function createClient() {
  return mockClient;
}
