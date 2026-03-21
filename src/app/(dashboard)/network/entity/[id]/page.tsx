/**
 * Entity Studio — Full-page editor for ghost partner profiles.
 * Replaces the inline Dossier modal with a sovereign editing environment.
 * Supports company, person (individual), and couple entity types.
 */

import { redirect } from 'next/navigation';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { getNetworkNodeDetails } from '@/features/network-data';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import type { IndividualAttrs, CoupleAttrs } from '@/shared/lib/entity-attrs';
import { EntityStudioClient } from './EntityStudioClient';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnPath?: string }>;
};

export default async function EntityStudioPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { returnPath } = await searchParams;

  const sourceOrgId = await getCurrentOrgId();
  if (!sourceOrgId) redirect('/network');

  const details = await getNetworkNodeDetails(id, 'external_partner', sourceOrgId);
  if (!details || details.kind !== 'external_partner' || !details.isGhost) {
    redirect('/network');
  }

  // For person/couple entities, fetch initial attribute values for the typed form.
  const dirType = details.entityDirectoryType;
  let initialPersonAttrs: IndividualAttrs | null = null;
  let initialCoupleAttrs: CoupleAttrs | null = null;

  if ((dirType === 'person' || dirType === 'couple') && details.subjectEntityId) {
    const supabase = await createClient();
    const { data: entRow } = await supabase
      .schema('directory')
      .from('entities')
      .select('attributes')
      .eq('id', details.subjectEntityId)
      .maybeSingle();

    if (entRow) {
      if (dirType === 'person') {
        initialPersonAttrs = readEntityAttrs(entRow.attributes, 'individual');
      } else {
        initialCoupleAttrs = readEntityAttrs(entRow.attributes, 'couple');
      }
    }
  }

  return (
    <EntityStudioClient
      details={details}
      sourceOrgId={sourceOrgId}
      returnPath={returnPath}
      initialPersonAttrs={initialPersonAttrs}
      initialCoupleAttrs={initialCoupleAttrs}
    />
  );
}
