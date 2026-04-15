import 'server-only';

import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
} from '@/shared/lib/feature-flags';
import { getLobbyLayout } from './actions/lobby-layout';
import { LobbyClient } from './LobbyClient';
import { userCapabilities } from '@/shared/lib/metrics/capabilities';
import type { CapabilityKey } from '@/shared/lib/permission-registry';

export const dynamic = 'force-dynamic';

/**
 * Lobby route entry — server wrapper.
 *
 * Resolves the current workspace + modular-Lobby feature flag at request
 * time. When the flag is ON for the workspace, we pass the caller's
 * resolved card ordering into `LobbyClient` (persisted layout, or seeded
 * defaults if no row exists). When the flag is OFF, `cardIds` is undefined
 * and `LobbyBentoGrid` renders the legacy hard-coded layout — no behavior
 * change for any workspace until a flag flip.
 */
async function resolveWorkspaceId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get('workspace_id')?.value;
    if (fromCookie) return fromCookie;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    return membership?.workspace_id ?? null;
  } catch {
    return null;
  }
}

export default async function LobbyPage() {
  const workspaceId = await resolveWorkspaceId();

  // Flag-off path: hand control to the client shell with no cardIds. The
  // existing LobbyBentoGrid layout renders unchanged.
  if (!workspaceId) {
    return <LobbyClient />;
  }

  const modularEnabled = await isFeatureEnabled(
    workspaceId,
    FEATURE_FLAGS.REPORTS_MODULAR_LOBBY,
  );
  if (!modularEnabled) {
    return <LobbyClient />;
  }

  // Flag-on path: resolve persisted layout or seeded defaults, pass to client.
  // getLobbyLayout is self-contained (reads cookies + caller's role), so a
  // try/catch keeps the Lobby renderable even if layout resolution fails.
  // Resolve outside the JSX expression to satisfy the no-JSX-in-try rule.
  let cardIds: string[] | undefined;
  try {
    const layout = await getLobbyLayout();
    cardIds = layout.cardIds;
  } catch {
    cardIds = undefined;
  }

  // Phase 2.3: resolve capability set so the library drawer can filter the
  // registry without leaking RPC fanout to the client. Failure → empty set
  // (drawer shows nothing actionable, but the rest of the Lobby is fine).
  let userCaps: CapabilityKey[] = [];
  try {
    const caps = await userCapabilities(workspaceId);
    userCaps = Array.from(caps);
  } catch {
    userCaps = [];
  }

  return <LobbyClient cardIds={cardIds} modularEnabled userCaps={userCaps} />;
}
