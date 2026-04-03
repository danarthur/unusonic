import { notFound } from 'next/navigation';
import { getDeal } from '../../../actions/get-deal';
import { getDealStakeholders } from '../../../actions/deal-stakeholders';
import { ArrowLeft } from 'lucide-react';
import { ProposalBuilderLoader } from './proposal-builder-loader';
import { ProposalBuilderHeader } from './proposal-builder-header';

export default async function DealProposalBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: dealId } = await params;
  const [deal, stakeholders] = await Promise.all([getDeal(dealId), getDealStakeholders(dealId)]);

  if (!deal) notFound();

  const hasBillTo = stakeholders.some((s) => s.role === 'bill_to');

  /** Contacts with email for "Send to" picker (from deal stakeholders). */
  const contacts = stakeholders
    .filter((s) => (s.contact_email ?? s.email)?.trim())
    .map((s) => ({
      id: s.id,
      name: (s.contact_name ?? s.name ?? 'Contact').trim(),
      email: (s.contact_email ?? s.email)!.trim(),
    }));

  return (
    <div className="flex flex-col h-full min-h-[80vh] relative">
      <ProposalBuilderHeader dealId={dealId} deal={deal} />

      <main className="relative z-10 flex-1 min-h-0 overflow-auto">
        <ProposalBuilderLoader deal={deal} contacts={contacts} clientAttached={hasBillTo || !!(deal.organization_id || deal.main_contact_id)} />
      </main>
    </div>
  );
}
