import { notFound } from 'next/navigation';
import { getDeal } from '../../../actions/get-deal';
import { getDealStakeholders } from '../../../actions/deal-stakeholders';
import { ProposalBuilderLoader } from './proposal-builder-loader';
import { ProposalBuilderHeader } from './proposal-builder-header';
import { ProposalBuilderVisualMock } from '../../../components/proposal-builder-visual-mock';
import { AionPageContextSetter } from '@/shared/ui/providers/AionPageContextSetter';

export default async function DealProposalBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string; demo?: string }>;
}) {
  const { id: dealId } = await params;
  const { v, demo } = await searchParams;
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

  // Derive client + venue for the builder's WYSIWYG document render.
  const billToSt = stakeholders.find((s) => s.role === 'bill_to') ?? null;
  const venueSt = stakeholders.find((s) => s.role === 'venue_contact') ?? null;
  const clientName = billToSt
    ? (billToSt.organization_name ?? billToSt.contact_name ?? billToSt.name)
    : null;
  const venue = venueSt
    ? {
        name: venueSt.organization_name ?? venueSt.name,
        address: venueSt.address
          ? [venueSt.address.street, venueSt.address.city, venueSt.address.state]
              .filter(Boolean)
              .join(', ') || null
          : null,
      }
    : null;

  // Visual prototype — opt-in via ?v=visual. Renders standalone (owns its
  // own top bar) so the production builder is untouched. Remove the query
  // param or set it to any other value to return to the shipped builder.
  if (v === 'visual') {
    return (
      <div className="flex flex-col h-full min-h-[80vh] relative">
        <AionPageContextSetter type="proposal" entityId={dealId} label={deal.title ?? null} />
        <ProposalBuilderVisualMock
          deal={deal}
          contacts={contacts}
          clientAttached={hasBillTo || !!(deal.organization_id || deal.main_contact_id)}
          forceDemo={demo === '1'}
          clientName={clientName}
          venue={venue}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[80vh] relative">
      <AionPageContextSetter type="proposal" entityId={dealId} label={deal.title ?? null} />
      <ProposalBuilderHeader dealId={dealId} deal={deal} />

      <main className="relative z-10 flex-1 min-h-0 overflow-auto">
        <ProposalBuilderLoader deal={deal} contacts={contacts} clientAttached={hasBillTo || !!(deal.organization_id || deal.main_contact_id)} />
      </main>
    </div>
  );
}
