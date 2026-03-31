/**
 * Entity Studio — Full-page editor for ghost partner profiles.
 * Replaces the inline Dossier modal with a sovereign editing environment.
 * Supports company, person (individual), and couple entity types.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { getNetworkNodeDetails } from '@/features/network-data';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import type { IndividualAttrs, CoupleAttrs, PersonAttrs } from '@/shared/lib/entity-attrs';
import { EntityStudioClient } from './EntityStudioClient';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnPath?: string; kind?: string }>;
};

function EntitySkeleton() {
  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 space-y-4">
      <div className="h-6 w-32 rounded stage-skeleton" />
      <div className="h-48 w-full rounded-xl stage-skeleton" />
      <div className="h-32 w-full rounded-xl stage-skeleton" />
    </div>
  );
}

export default async function EntityStudioPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { returnPath, kind: kindParam } = await searchParams;

  return (
    <Suspense fallback={<EntitySkeleton />}>
      <EntityContent id={id} returnPath={returnPath} kindParam={kindParam} />
    </Suspense>
  );
}

async function EntityContent({ id, returnPath, kindParam }: { id: string; returnPath?: string; kindParam?: string }) {
  const sourceOrgId = await getCurrentOrgId();
  if (!sourceOrgId) redirect('/network');

  const kind = kindParam === 'internal_employee' ? 'internal_employee'
    : kindParam === 'extended_team' ? 'extended_team'
    : 'external_partner';
  const details = await getNetworkNodeDetails(id, kind, sourceOrgId);

  if (!details) redirect('/network');

  if (kind === 'external_partner' && (!details.isGhost || details.kind !== 'external_partner')) {
    redirect('/network');
  }
  if ((kind === 'internal_employee' || kind === 'extended_team') && details.kind !== kind) {
    redirect('/network');
  }

  const dirType = details.entityDirectoryType;
  let initialPersonAttrs: IndividualAttrs | null = null;
  let initialCoupleAttrs: CoupleAttrs | null = null;
  let initialEmployeeAttrs: PersonAttrs | null = null;

  if (details.subjectEntityId) {
    const supabase = await createClient();
    const { data: entRow } = await supabase
      .schema('directory')
      .from('entities')
      .select('attributes')
      .eq('id', details.subjectEntityId)
      .maybeSingle();

    if (entRow) {
      if (kind === 'internal_employee' || kind === 'extended_team') {
        initialEmployeeAttrs = readEntityAttrs(entRow.attributes, 'person');
      } else if (kind === 'external_partner' && dirType === 'person') {
        initialEmployeeAttrs = readEntityAttrs(entRow.attributes, 'person');
      } else if (dirType === 'person') {
        initialPersonAttrs = readEntityAttrs(entRow.attributes, 'individual');
      } else if (dirType === 'couple') {
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
      initialEmployeeAttrs={initialEmployeeAttrs}
    />
  );
}
