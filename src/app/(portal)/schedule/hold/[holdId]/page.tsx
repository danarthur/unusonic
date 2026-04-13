/**
 * Hold Detail Page — employee portal.
 * Shows crew-safe details about a pending deal hold so crew can decide.
 */

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { getDealHoldDetail } from '@/features/ops/actions/get-deal-hold-detail';
import { HoldDetailView } from './hold-detail-view';

export const dynamic = 'force-dynamic';

export default async function HoldDetailPage({
  params,
}: {
  params: Promise<{ holdId: string }>;
}) {
  const { holdId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Resolve person entity
  const { data: personEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!personEntity) notFound();

  const hold = await getDealHoldDetail(holdId, personEntity.id);
  if (!hold) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center py-16">
        <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          Show not found
        </h1>
        <p className="text-sm text-[var(--stage-text-secondary)] max-w-md">
          This booking may have been removed or you may not have access to it.
        </p>
      </div>
    );
  }

  return (
    <HoldDetailView hold={hold} personEntityId={personEntity.id} />
  );
}
