'use server';
import { getSystemClient } from '@/shared/api/supabase/system';

export async function trackProposalView(token: string): Promise<void> {
  if (!token?.trim()) return;
  const supabase = getSystemClient();

  const { data } = await supabase
    .from('proposals')
    .select('id, status, first_viewed_at')
    .eq('public_token', token.trim())
    .in('status', ['sent', 'viewed', 'accepted'])
    .maybeSingle();

  if (!data) return;
  const now = new Date().toISOString();

  // Use an atomic SQL RPC so concurrent tab opens don't clobber each other.
  // Application-side read-then-write (view_count + 1) would lose increments
  // if two requests arrive before either write completes.
  await supabase.rpc('increment_proposal_view', {
    p_proposal_id: (data as { id: string }).id,
    p_now: now,
    p_set_first: !(data as { first_viewed_at?: string | null }).first_viewed_at,
    p_was_sent: (data as { status: string }).status === 'sent',
  });
}
