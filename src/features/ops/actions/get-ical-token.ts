'use server';

import 'server-only';
import { randomBytes } from 'crypto';
import { createClient } from '@/shared/api/supabase/server';

/**
 * Get or create the user's iCal feed token.
 * Generated on first call and stored permanently until rotated.
 */
export async function getOrCreateIcalToken(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('ical_token')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.ical_token) return profile.ical_token;

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

/**
 * Rotate the user's iCal token — invalidates the old one immediately.
 * Returns the new token.
 */
export async function rotateIcalToken(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const token = randomBytes(32).toString('hex');
  const { error } = await supabase
    .from('profiles')
    .update({ ical_token: token })
    .eq('id', user.id);

  if (error) {
    console.error('[rotateIcalToken]', error.message);
    return null;
  }

  return token;
}

/**
 * Revoke the user's iCal token — removes access entirely.
 */
export async function revokeIcalToken(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('profiles')
    .update({ ical_token: null })
    .eq('id', user.id);

  return !error;
}
