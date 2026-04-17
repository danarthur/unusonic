/**
 * Has-ever-captured — drives the `CaptureComposer`'s first-run vs. compact state.
 *
 * Looks up whether the current user has any confirmed rows in
 * `cortex.capture_events` for this workspace. Single tiny query, one scalar
 * return — cheap enough to run on every lobby page load.
 *
 * Uses the system client because `cortex` is not PostgREST-exposed; scoping
 * to `(workspace_id, user_id)` in the WHERE clause enforces isolation.
 *
 * See docs/reference/sales-brief-v2-design.md §10.1.
 */

'use server';

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export async function getHasEverCaptured(): Promise<boolean> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return false;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // cortex schema is not exposed via PostgREST, so .schema('cortex') on the
  // typed client fails the type-check. Cast once to `unknown`-as-shape just
  // to reach the chain. The runtime call is fine — the schema exists.
  type AnySchemaClient = {
    schema(name: string): {
      from(table: string): {
        select(
          col: string,
          opts: { count: 'exact'; head: true },
        ): {
          eq(
            col: string,
            val: string,
          ): {
            eq(
              col: string,
              val: string,
            ): {
              eq(col: string, val: string): Promise<{ count: number | null; error: unknown }>;
            };
          };
        };
      };
    };
  };
  const system = getSystemClient() as unknown as AnySchemaClient;
  const { count, error } = await system
    .schema('cortex')
    .from('capture_events')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'confirmed');

  if (error) return false;
  return (count ?? 0) > 0;
}
