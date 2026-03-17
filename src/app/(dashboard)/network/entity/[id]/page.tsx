/**
 * Entity Studio — Full-page editor for ghost partner profiles.
 * Replaces the inline Dossier modal with a sovereign editing environment.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { getNetworkNodeDetails } from '@/features/network-data';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
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

  // Guard: couple entities are edited via the deal Stakeholders panel, not here.
  // Workspace-scoped to prevent cross-workspace type disclosure.
  const supabase = await createClient();
  const workspaceId = await getActiveWorkspaceId();
  const { data: entityRow } = await supabase
    .schema('directory')
    .from('entities')
    .select('type')
    .eq('id', id)
    .eq('owner_workspace_id', workspaceId ?? '')
    .maybeSingle();

  if (entityRow?.type === 'couple') {
    const backHref = returnPath ?? '/crm';
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-obsidian px-6 text-center">
        <p className="max-w-sm text-sm text-mercury/70 leading-relaxed">
          Couple profile editor — full editing is available from the deal&apos;s Stakeholders panel.
          Navigate to the deal to edit this couple&apos;s details.
        </p>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-mercury transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>
    );
  }

  const details = await getNetworkNodeDetails(id, 'external_partner', sourceOrgId);
  if (!details || details.kind !== 'external_partner' || !details.isGhost) {
    redirect('/network');
  }

  return (
    <EntityStudioClient
      details={details}
      sourceOrgId={sourceOrgId}
    />
  );
}
