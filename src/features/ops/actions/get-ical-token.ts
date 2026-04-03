'use server';

import 'server-only';
import { randomBytes } from 'crypto';
import { createClient } from '@/shared/api/supabase/server';

/**
 * Get or create the user's iCal feed token.
 * Generated on first call and stored permanently.
 */
export async function getOrCreateIcalToken(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Check for existing token
  const { data: profile } = await supabase
    .from('profiles')
    .select('ical_token')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.ical_token) return profile.ical_token;

  // Generate and store new token
  const token = randomBytes(32).toString('hex');
  const { error } = await supabase
    .from('profiles')
    .update({ ical_token: token })
    .eq('id', user.id);

  if (error) {
    console.error('[getOrCreateIcalToken]', error.message);
    return null;
  }

  return token;
}
