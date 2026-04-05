/**
 * Team access data — aggregated security posture for all workspace members.
 * Uses system client to bypass RLS (profiles + passkeys are own-row-only).
 * Gated to workspace owner/admin.
 * @module features/auth/passkey-management/api/team-access
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';

export type TeamAccessRisk = 'high' | 'medium' | null;

export interface TeamAccessMember {
  userId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  passkeyCount: number;
  hasRecoveryKit: boolean;
  lastSignInAt: string | null;
  joinedAt: string | null;
  risk: TeamAccessRisk;
}

function computeRisk(passkeyCount: number, hasRecoveryKit: boolean): TeamAccessRisk {
  if (passkeyCount === 0 && !hasRecoveryKit) return 'high';
  if (passkeyCount === 0 || !hasRecoveryKit) return 'medium';
  return null;
}

/**
 * Fetch security posture for all workspace members.
 * Returns null if caller is not owner/admin.
 */
export async function getTeamAccessData(
  workspaceId: string
): Promise<TeamAccessMember[] | null> {
  // 1. Verify caller is owner or admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: callerMember } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerMember || !['owner', 'admin'].includes(callerMember.role)) {
    return null;
  }

  // 2. Fetch all workspace members with profiles (system client bypasses RLS)
  const db = getSystemClient();

  const { data: members, error: membersError } = await db
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId);

  if (membersError || !members?.length) return [];

  const userIds = members.map((m) => m.user_id);

  // 3. Fetch profiles (has_recovery_kit, full_name, avatar_url, email)
  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name, avatar_url, email, has_recovery_kit')
    .in('id', userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  // 4. Fetch passkey counts per user
  const { data: passkeys } = await db
    .from('passkeys')
    .select('user_id')
    .in('user_id', userIds);

  const passkeyCountMap = new Map<string, number>();
  for (const pk of passkeys ?? []) {
    passkeyCountMap.set(pk.user_id, (passkeyCountMap.get(pk.user_id) ?? 0) + 1);
  }

  // 5. Fetch last_sign_in_at from auth.users via admin REST API
  const lastSignInMap = new Map<string, string | null>();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    // Batch fetch — Supabase admin API supports listing users with filters
    // For small teams (<50), fetching all and filtering is fine
    const res = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=100`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }
    );
    if (res.ok) {
      const data = await res.json();
      const userIdSet = new Set(userIds);
      for (const authUser of data?.users ?? []) {
        if (userIdSet.has(authUser.id)) {
          lastSignInMap.set(authUser.id, authUser.last_sign_in_at ?? null);
        }
      }
    }
  }

  // 6. Assemble results
  return members.map((m) => {
    const profile = profileMap.get(m.user_id);
    const passkeyCount = passkeyCountMap.get(m.user_id) ?? 0;
    const hasRecoveryKit = (profile as { has_recovery_kit?: boolean } | undefined)?.has_recovery_kit ?? false;

    return {
      userId: m.user_id,
      email: (profile as { email?: string } | undefined)?.email ?? '',
      fullName: (profile as { full_name?: string | null } | undefined)?.full_name ?? null,
      avatarUrl: (profile as { avatar_url?: string | null } | undefined)?.avatar_url ?? null,
      role: m.role ?? 'member',
      passkeyCount,
      hasRecoveryKit,
      lastSignInAt: lastSignInMap.get(m.user_id) ?? null,
      joinedAt: null, // workspace_members lacks created_at in current schema
      risk: computeRisk(passkeyCount, hasRecoveryKit),
    };
  });
}
