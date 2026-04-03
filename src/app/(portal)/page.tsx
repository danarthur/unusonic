import { redirect } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PortalHome() {
  // Ensure user is authenticated before redirecting
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  redirect('/portal/schedule');
}
