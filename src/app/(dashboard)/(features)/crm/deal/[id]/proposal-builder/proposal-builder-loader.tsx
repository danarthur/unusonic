'use client';

import dynamic from 'next/dynamic';
import type { DealDetail } from '../../../actions/get-deal';

/**
 * Client loader that dynamically imports whichever studio variant the
 * `ProposalBuilderStudioRouter` (server component) resolved from the
 * `crm.proposal_builder_drag` feature flag. Split per variant so the
 * legacy @hello-pangea/dnd bundle drops out of the new studio's chunk,
 * which is what makes the Phase 2 removal cheap.
 */
const ProposalBuilderStudioPalette = dynamic(
  () => import('../../../components/proposal-builder-studio').then((m) => m.ProposalBuilderStudio),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center p-8"><div className="h-8 w-8 stage-skeleton rounded-lg" /></div> },
);

const ProposalBuilderStudioLegacy = dynamic(
  () => import('../../../components/proposal-builder-studio-legacy').then((m) => m.ProposalBuilderStudioLegacy),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center p-8"><div className="h-8 w-8 stage-skeleton rounded-lg" /></div> },
);

export function ProposalBuilderLoader({
  variant,
  deal,
  contacts,
  clientAttached,
}: {
  variant: 'legacy' | 'palette';
  deal: DealDetail;
  contacts: { id: string; name: string; email: string }[];
  clientAttached: boolean;
}) {
  if (variant === 'legacy') {
    return <ProposalBuilderStudioLegacy deal={deal} contacts={contacts} clientAttached={clientAttached} />;
  }
  return <ProposalBuilderStudioPalette deal={deal} contacts={contacts} clientAttached={clientAttached} />;
}
