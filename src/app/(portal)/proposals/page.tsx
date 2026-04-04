/**
 * Proposals — salesperson portal.
 * Shows proposals for deals owned by the salesperson.
 */

import { notFound } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { resolvePortalProfile } from '@/shared/lib/portal-profiles';
import { ProposalsView } from './proposals-view';

export const dynamic = 'force-dynamic';

export default async function ProposalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: personEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!personEntity) notFound();

  // Verify salesperson profile
  const { data: caps } = await supabase
    .schema('ops')
    .from('entity_capabilities')
    .select('capability')
    .eq('entity_id', personEntity.id);

  const resolved = resolvePortalProfile({
    capabilities: (caps ?? []).map(c => c.capability),
    skillTags: [],
  });

  if (resolved.primary.key !== 'salesperson' && !resolved.all.some(p => p.key === 'salesperson')) {
    notFound();
  }

  // Fetch deals owned by this entity, then their proposals
  const { data: deals } = await supabase
    .from('deals')
    .select('id, title')
    .eq('owner_entity_id', personEntity.id)
    .is('archived_at', null);

  const dealIds = (deals ?? []).map(d => d.id);
  const dealTitleMap = new Map((deals ?? []).map(d => [d.id, d.title]));

  if (dealIds.length === 0) {
    return (
      <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
        <ProposalsView proposals={[]} />
      </div>
    );
  }

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id, status, public_token, created_at, accepted_at, signed_at, first_viewed_at, last_viewed_at, view_count, deposit_paid_at, expires_at')
    .in('deal_id', dealIds)
    .order('created_at', { ascending: false })
    .limit(50);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const enriched = (proposals ?? []).map(p => ({
    id: p.id as string,
    dealId: p.deal_id as string,
    dealTitle: dealTitleMap.get(p.deal_id as string) ?? 'Untitled deal',
    status: p.status as string,
    publicUrl: `${baseUrl}/p/${p.public_token}`,
    createdAt: p.created_at as string,
    acceptedAt: p.accepted_at as string | null,
    signedAt: p.signed_at as string | null,
    firstViewedAt: p.first_viewed_at as string | null,
    lastViewedAt: p.last_viewed_at as string | null,
    viewCount: (p.view_count as number) ?? 0,
    depositPaidAt: p.deposit_paid_at as string | null,
    expiresAt: p.expires_at as string | null,
  }));

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <ProposalsView proposals={enriched} />
    </div>
  );
}
