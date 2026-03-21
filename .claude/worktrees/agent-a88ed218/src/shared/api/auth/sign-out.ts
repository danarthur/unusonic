'use server';

import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { TRUSTED_DEVICE_COOKIE_NAME } from '@/shared/lib/constants';

/**
 * Signs out the current user and redirects to login.
 * Clears the trusted-device cookie so inactivity logout applies on next sign-in.
 * Called from forms (receives FormData) or from client with options (e.g. { reason: 'inactivity' }).
 */
export async function signOutAction(
  payload?: FormData | { reason?: 'inactivity' }
): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(TRUSTED_DEVICE_COOKIE_NAME);
  const reason =
    payload &&
    typeof payload === 'object' &&
    !('get' in payload) &&
    'reason' in payload &&
    payload.reason === 'inactivity'
    ? 'inactivity'
    : undefined;
  redirect(reason ? '/login?reason=inactivity' : '/login');
}
