/**
 * Preview redirect — resolves client entity from deal and redirects.
 *
 * Route: /preview/deal/[dealId]
 *
 * Looks up the deal's event → client_entity_id, then redirects to
 * the client portal preview at /preview/client/[entityId].
 *
 * This indirection exists because the deal header strip (client component)
 * has the deal ID but not the event's client_entity_id.
 *
 * @module app/(dashboard)/(features)/preview/deal/[dealId]/page
 */
import 'server-only';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { ACTIVE_WORKSPACE_COOKIE_NAME } from '@/shared/lib/constants';

const ADMIN_ROLES = ['owner', 'admin'];

export default async function PreviewDealRedirect({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;

  // Authenticate + verify admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log('[Preview] No user session');
    redirect('/login');
  }

  const cookieStore = await cookies();
  const activeWsId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value;

  // Try the active workspace cookie first; fall back to first membership
  type Membership = { workspace_id: string; role: string };
  let membership: Membership | null = null;
  if (activeWsId) {
    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('workspace_id', activeWsId)
      .maybeSingle();
    membership = data as Membership | null;
  }
  if (!membership) {
    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    membership = data as Membership | null;
  }

  if (!membership || !ADMIN_ROLES.includes(membership.role)) {
    redirect('/lobby');
  }

  // Resolve: deal → event → client_entity_id
  const { data: deal } = await supabase
    .from('deals')
    .select('event_id')
    .eq('id', dealId)
    .eq('workspace_id', membership.workspace_id)
    .maybeSingle();

  if (!deal?.event_id) {
    console.log('[Preview] Deal has no event_id — dealId:', dealId, 'deal:', deal);
    redirect('/productions');
  }

  const system = getSystemClient();
  const { data: event, error: eventError } = await system
    .schema('ops')
    .from('events')
    .select('client_entity_id')
    .eq('id', deal.event_id)
    .eq('workspace_id', membership.workspace_id)
    .maybeSingle();

  if (!event?.client_entity_id) {
    console.log('[Preview] Event has no client_entity_id — eventId:', deal.event_id, 'event:', event, 'error:', eventError);
    redirect('/productions');
  }

  redirect(`/preview/client/${event.client_entity_id}?from=${dealId}`);
}
