import { notFound } from 'next/navigation';
import { getDeal } from '../../../actions/get-deal';
import { getDealStakeholders } from '../../../actions/deal-stakeholders';
import { ProposalBuilderStudio } from '../../../components/proposal-builder-studio';
import { AionPageContextSetter } from '@/shared/ui/providers/AionPageContextSetter';

export default async function DealProposalBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { id: dealId } = await params;
  const { demo } = await searchParams;
  const [deal, stakeholders] = await Promise.all([getDeal(dealId), getDealStakeholders(dealId)]);

  if (!deal) notFound();

  const hasBillTo = stakeholders.some((s) => s.role === 'bill_to');

  /** Contacts with email for "Send to" picker (from deal stakeholders).
   *  Deduped by lowercased email so a single person attached as both bill_to
   *  AND venue_contact AND main_contact only appears once in the chip row.
   *  First occurrence wins — stakeholder order typically puts bill_to first. */
  const contacts = (() => {
    const seen = new Set<string>();
    const out: { id: string; name: string; email: string }[] = [];
    for (const s of stakeholders) {
      const email = (s.contact_email ?? s.email)?.trim();
      if (!email) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: s.id,
        name: (s.contact_name ?? s.name ?? 'Contact').trim(),
        email,
      });
    }
    return out;
  })();

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

  return (
    <div className="flex flex-col h-full min-h-[80vh] relative">
      <AionPageContextSetter type="proposal" entityId={dealId} label={deal.title ?? null} />
      <ProposalBuilderStudio
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
