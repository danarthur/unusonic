'use client';

import dynamic from 'next/dynamic';
import type { DealDetail } from '../../../actions/get-deal';

/**
 * Client loader for the palette-first proposal builder studio. The legacy
 * drag studio was removed in Phase 2 of the proposal-builder rebuild
 * (design doc §3 Phase 2); there is now only one variant.
 */
const ProposalBuilderStudio = dynamic(
  () => import('../../../components/proposal-builder-studio').then((m) => m.ProposalBuilderStudio),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center p-8"><div className="h-8 w-8 stage-skeleton rounded-lg" /></div> },
);

export function ProposalBuilderLoader({
  deal,
  contacts,
  clientAttached,
}: {
  deal: DealDetail;
  contacts: { id: string; name: string; email: string }[];
  clientAttached: boolean;
}) {
  return <ProposalBuilderStudio deal={deal} contacts={contacts} clientAttached={clientAttached} />;
}
