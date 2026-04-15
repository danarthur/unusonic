'use server';

/**
 * Pin view-tracking server action — Phase 5.3.
 *
 * Writes metadata.last_viewed_at onto a Lobby pin via
 * cortex.record_lobby_pin_view. Fire-and-forget from the widget's
 * IntersectionObserver: errors are swallowed and logged at debug-level only,
 * because view tracking is best-effort instrumentation, not a product
 * guarantee.
 *
 * Ownership is enforced inside the RPC (auth.uid() must match the pin's
 * user_id) — this action just resolves the authenticated Supabase client
 * and dispatches.
 *
 * @module app/(dashboard)/(features)/aion/actions/pin-view-actions
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
} from '@/shared/lib/feature-flags';
import { cookies } from 'next/headers';

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

async function resolveWorkspaceId(
  supabase: SupabaseLike,
  userId: string,
): Promise<string | null> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get('workspace_id')?.value ?? null;
  if (fromCookie) return fromCookie;
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return membership?.workspace_id ?? null;
}

/**
 * Records a view on a Lobby pin. No-op on any error — view tracking is
 * best-effort; never surface a failure to the client.
 */
export async function recordPinView(pinId: string): Promise<void> {
  if (typeof pinId !== 'string' || pinId.length === 0) return;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const workspaceId = await resolveWorkspaceId(supabase, user.id);
    if (!workspaceId) return;

    const flagOn = await isFeatureEnabled(
      workspaceId,
      FEATURE_FLAGS.REPORTS_AION_PIN,
    );
    if (!flagOn) return;

    const { error } = await (supabase as unknown as {
      schema: (s: string) => {
        rpc: (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    })
      .schema('cortex')
      .rpc('record_lobby_pin_view', { p_pin_id: pinId });

    if (error && process.env.NODE_ENV !== 'production') {
      console.debug(
        `[recordPinView] RPC error for pin ${pinId}:`,
        error.message,
      );
    }
  } catch (err) {
    // Swallow — best-effort. Debug-only log to help local work.
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[recordPinView] threw for pin ${pinId}:`, err);
    }
  }
}
