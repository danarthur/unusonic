import { createClient } from '@/shared/api/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TRUSTED_DEVICE_COOKIE_NAME } from '@/shared/lib/constants';

/**
 * GET /signout — emergency sign-out route accessible even when sidebar UI is broken.
 * Useful when session expires and the profile popover can't be clicked.
 */
export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(TRUSTED_DEVICE_COOKIE_NAME);
  redirect('/login');
}
