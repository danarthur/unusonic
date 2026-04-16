import 'server-only';

import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
} from '@/shared/lib/feature-flags';
import { listVisibleLayouts } from './actions/lobby-layouts';
import { LobbyClient } from './LobbyClient';
import { userCapabilities } from '@/shared/lib/metrics/capabilities';
import type { CapabilityKey } from '@/shared/lib/permission-registry';
import { getPinnedAnswers } from '@/widgets/pinned-answers/api/get-pinned-answers';
import type { LobbyPin } from '@/app/(dashboard)/(features)/aion/actions/pin-actions';
import type { LobbyLayout } from '@/shared/lib/lobby-layouts/types';

export const dynamic = 'force-dynamic';

/**
 * Lobby route entry — server wrapper.
 *
 * Resolves the viewer's visible layouts (presets they have capability for,
 * plus their customs) and passes them to the client. Exactly one layout is
 * flagged active in the returned list; if no row has ever been persisted,
 * backend seeds Default as active.
 *
 * The old modular-lobby feature flag is retired — layouts are the new
 * default. The `REPORTS_AION_PIN` flag remains independent.
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

/**
 * Fallback layout shown when the server can't resolve anything (no workspace,
 * transient error, etc.). Default preset, legacy renderer — byte-identical to
 * the pre-layouts experience for these degraded cases.
 */
function defaultFallbackLayout(): LobbyLayout {
  return {
    id: 'default',
    kind: 'preset',
    name: 'Default',
    cardIds: [],
    isActive: true,
    rendererMode: 'legacy',
  };
}

export default async function LobbyPage() {
  const workspaceId = await resolveWorkspaceId();

  // Pin flag is independent of the layouts system.
  let pinEnabled = false;
  let pins: LobbyPin[] = [];
  let captureEnabled = false;
  if (workspaceId) {
    try {
      pinEnabled = await isFeatureEnabled(
        workspaceId,
        FEATURE_FLAGS.REPORTS_AION_PIN,
      );
      if (pinEnabled) pins = await getPinnedAnswers();
    } catch {
      pinEnabled = false;
      pins = [];
    }
    try {
      captureEnabled = await isFeatureEnabled(
        workspaceId,
        FEATURE_FLAGS.AION_LOBBY_CAPTURE,
      );
    } catch {
      captureEnabled = false;
    }
  }

  // Resolve visible layouts + caps. Either failing degrades to a Default-only
  // render — the Lobby stays usable even when lobby_layouts is unreachable.
  let layouts: LobbyLayout[] = [defaultFallbackLayout()];
  let userCaps: CapabilityKey[] = [];
  if (workspaceId) {
    try {
      const resolved = await listVisibleLayouts();
      if (resolved.length > 0) layouts = resolved;
    } catch {
      layouts = [defaultFallbackLayout()];
    }
    try {
      const caps = await userCapabilities(workspaceId);
      userCaps = Array.from(caps);
    } catch {
      userCaps = [];
    }
  }

  const active =
    layouts.find((l) => l.isActive) ?? layouts[0] ?? defaultFallbackLayout();

  return (
    <LobbyClient
      layouts={layouts}
      activeLayoutId={active.id}
      userCaps={userCaps}
      pins={pins}
      pinEnabled={pinEnabled}
      captureEnabled={captureEnabled}
    />
  );
}
