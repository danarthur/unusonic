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
import type { IndividualAttrs, CoupleAttrs, PersonAttrs, VenueAttrs } from '@/shared/lib/entity-attrs';
import { EntityStudioClient } from './EntityStudioClient';
import { EntityDirectClient } from './EntityDirectClient';
import { AionPageContextSetter } from '@/shared/ui/providers/AionPageContextSetter';
import { resolveBackHref } from '@/shared/lib/smart-back';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnPath?: string; kind?: string; from?: string }>;
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
  const { returnPath, kind: kindParam, from } = await searchParams;

  // Prefer the smart-back `from` param over the legacy `returnPath`.
  // Both resolve to an absolute local path; external URLs are rejected.
  const resolvedReturnPath = resolveBackHref(from, returnPath ?? '/network');

  return (
    <Suspense fallback={<EntitySkeleton />}>
      <EntityContent id={id} returnPath={resolvedReturnPath} kindParam={kindParam} />
    </Suspense>
  );
}

async function EntityContent({ id, returnPath, kindParam }: { id: string; returnPath?: string; kindParam?: string }) {
  const sourceOrgId = await getCurrentOrgId();
  if (!sourceOrgId) redirect('/network');

  // Explicit kindParam = the caller knows the entity's category and we validate
  // strictly. Missing kindParam = the caller gave us just an entity id (e.g.
  // the Crew tab or an `about X` capture chip) and we default-try partner,
  // then gracefully accept whatever kind the server returns.
  const hasExplicitKind = Boolean(kindParam);
  const kind: 'internal_employee' | 'extended_team' | 'external_partner' =
    kindParam === 'internal_employee' ? 'internal_employee'
    : kindParam === 'extended_team' ? 'extended_team'
    : 'external_partner';
  const details = await getNetworkNodeDetails(id, kind, sourceOrgId);

  // ── Direct-entity fallback ────────────────────────────────────────────────
  // `getNetworkNodeDetails` is built around workspace-to-org relationship ids.
  // Callers that only have an ENTITY id (crew-tab clicks, `about X` capture
  // chips, etc.) won't resolve — fall back to a minimal read-first view
  // fetched from directory.entities directly.
  if (!details) {
    return await renderDirectEntity(id, returnPath ?? '/network');
  }

  if (hasExplicitKind) {
    if (kind === 'external_partner' && (!details.isGhost || details.kind !== 'external_partner')) {
      redirect('/network');
    }
    if ((kind === 'internal_employee' || kind === 'extended_team') && details.kind !== kind) {
      redirect('/network');
    }
  }

  const dirType = details.entityDirectoryType;
  let initialPersonAttrs: IndividualAttrs | null = null;
  let initialCoupleAttrs: CoupleAttrs | null = null;
  let initialEmployeeAttrs: PersonAttrs | null = null;
  let initialVenueAttrs: VenueAttrs | null = null;

  // Resolve workspace_id from the source org entity for document operations
  let workspaceId: string | null = null;

  if (details.subjectEntityId) {
    const supabase = await createClient();
    const { data: entRow } = await supabase
      .schema('directory')
      .from('entities')
      .select('attributes, owner_workspace_id')
      .eq('id', details.subjectEntityId)
      .maybeSingle();

    if (entRow) {
      workspaceId = entRow.owner_workspace_id ?? null;

      if (kind === 'internal_employee' || kind === 'extended_team') {
        initialEmployeeAttrs = readEntityAttrs(entRow.attributes, 'person');
      } else if (kind === 'external_partner' && dirType === 'person') {
        initialEmployeeAttrs = readEntityAttrs(entRow.attributes, 'person');
      } else if (dirType === 'person') {
        initialPersonAttrs = readEntityAttrs(entRow.attributes, 'individual');
      } else if (dirType === 'couple') {
        initialCoupleAttrs = readEntityAttrs(entRow.attributes, 'couple');
      }

      if (dirType === 'venue') {
        initialVenueAttrs = readEntityAttrs(entRow.attributes, 'venue');
      }
    }
  }

  // Fallback: resolve workspace_id from source org if not found on subject entity
  if (!workspaceId) {
    const supabase = await createClient();
    const { data: srcEntity } = await supabase
      .schema('directory')
      .from('entities')
      .select('owner_workspace_id')
      .eq('legacy_org_id', sourceOrgId)
      .maybeSingle();
    workspaceId = srcEntity?.owner_workspace_id ?? null;
  }

  return (
    <>
      <AionPageContextSetter type="entity" entityId={details.subjectEntityId ?? id} label={details.identity.name ?? null} />
      <EntityStudioClient
        details={details}
        sourceOrgId={sourceOrgId}
        returnPath={returnPath}
        initialPersonAttrs={initialPersonAttrs}
        initialCoupleAttrs={initialCoupleAttrs}
        initialEmployeeAttrs={initialEmployeeAttrs}
        initialVenueAttrs={initialVenueAttrs}
        workspaceId={workspaceId}
      />
    </>
  );
}

/**
 * Direct-entity fallback: when the relationship-based `getNetworkNodeDetails`
 * lookup misses, verify the entity exists and is workspace-owned, then render
 * the read-first EntityDirectClient (Brief + Working notes + captures +
 * productions). Redirects to /network if the entity is unknown or foreign.
 */
async function renderDirectEntity(entityId: string, returnPath: string) {
  const supabase = await createClient();
  const { data: entRow } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, type, avatar_url, owner_workspace_id, claimed_by_user_id')
    .eq('id', entityId)
    .maybeSingle();

  if (!entRow) redirect('/network');

  const workspaceId = (entRow as { owner_workspace_id: string | null }).owner_workspace_id;
  if (!workspaceId) redirect('/network');

  // Belt-and-suspenders: verify caller is a member of that workspace.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/network');
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!membership) redirect('/network');

  const rawType = (entRow as { type: string | null }).type;
  const entityType: 'person' | 'company' | 'venue' | 'couple' =
    rawType === 'person' || rawType === 'company' || rawType === 'venue' || rawType === 'couple'
      ? rawType
      : 'person';

  const displayName = (entRow as { display_name: string | null }).display_name;
  const avatarUrl = (entRow as { avatar_url: string | null }).avatar_url;

  return (
    <>
      <AionPageContextSetter type="entity" entityId={entityId} label={displayName} />
      <EntityDirectClient
        entityId={entityId}
        workspaceId={workspaceId}
        entityType={entityType}
        displayName={displayName}
        avatarUrl={avatarUrl}
        returnPath={returnPath}
      />
    </>
  );
}
