'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import {
  ACTIVE_WORKSPACE_COOKIE_NAME,
  ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS,
} from '@/shared/lib/constants';

const DASHBOARD_ROLES = ['owner', 'admin', 'member'];
const CLIENT_ROLES = ['client'];

/**
 * Switch the active workspace. Sets a cookie and redirects to the
 * correct route group based on the user's role in the target workspace.
 */
export async function switchWorkspaceAction(workspaceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Verify membership — prevents cookie tampering
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!membership) {
    redirect('/');
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE_NAME, workspaceId, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS,
  });

  const destination = DASHBOARD_ROLES.includes(membership.role)
    ? '/lobby'
    : CLIENT_ROLES.includes(membership.role)
      ? '/client/home'
      : '/schedule';

  redirect(destination);
}
