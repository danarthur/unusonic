/**
 * Resolves the full capability set the current user holds in a workspace.
 *
 * Used by the Phase 2.3 library picker to filter the metric/widget registry
 * to cards the viewer is actually allowed to see, and by the role-default
 * resolver to realize a persona's default lobby layout.
 *
 * Implementation: issues one member_has_capability RPC per known key and
 * collects the positives. The result is wrapped in React.cache so a single
 * request issues the fanout at most once per (workspaceId, userId) pair.
 * The RPC itself is cheap — it reads role_permissions which is in-memory-hot
 * on any live request — so N ~= 25 calls is acceptable. If that ever becomes
 * a hot spot, the next move is to add a bulk get_member_capabilities RPC that
 * returns the full set as text[] in one round trip.
 *
 * @module shared/lib/metrics/capabilities
 */

import 'server-only';

import { cache } from 'react';
import { createClient } from '@/shared/api/supabase/server';
import {
  CAPABILITY_KEYS,
  type CapabilityKey,
} from '@/shared/lib/permission-registry';

/**
 * Returns the set of capability keys the current auth user holds in the
 * given workspace. Empty set when unauthenticated, not a member, or on error.
 *
 * React.cache memoizes per-request so the N-wide RPC fanout happens at most
 * once per `(workspaceId, auth.uid)` during a single server render.
 */
export const userCapabilities = cache(
  async (workspaceId: string): Promise<Set<CapabilityKey>> => {
    const held = new Set<CapabilityKey>();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return held;

    // Fan out once per known capability. The RPC is SECURITY DEFINER and
    // returns bool, so batching in parallel is safe.
    const results = await Promise.all(
      CAPABILITY_KEYS.map(async (key) => {
        const { data, error } = await supabase.rpc('member_has_capability', {
          p_workspace_id: workspaceId,
          p_permission_key: key,
        });
        return { key, allowed: !error && data === true };
      }),
    );

    for (const { key, allowed } of results) {
      if (allowed) held.add(key);
    }

    return held;
  },
);
