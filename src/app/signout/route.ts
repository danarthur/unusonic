import { createClient } from '@/shared/api/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TRUSTED_DEVICE_COOKIE_NAME, ONBOARDING_COOKIE_NAME } from '@/shared/lib/constants';

/**
 * GET /signout — sign-out route. Supports ?next= param for post-signout redirect.
 * Defaults to /login. Also accessible as emergency route when sidebar UI is broken.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(TRUSTED_DEVICE_COOKIE_NAME);
  // Clear role slug + onboarding caches so next login resolves fresh
  cookieStore.delete('unusonic_role_slug');
  cookieStore.delete(ONBOARDING_COOKIE_NAME);

  const { searchParams } = new URL(request.url);
  const next = searchParams.get('next');
  // Only allow relative redirects (prevent open redirect)
  const destination = next && next.startsWith('/') ? next : '/login';
  redirect(destination);
}
