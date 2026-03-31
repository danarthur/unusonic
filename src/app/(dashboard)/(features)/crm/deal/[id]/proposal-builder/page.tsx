import { notFound } from 'next/navigation';
import { getDeal } from '../../../actions/get-deal';
import { getDealStakeholders } from '../../../actions/deal-stakeholders';
import { ArrowLeft } from 'lucide-react';
import { ProposalBuilderLoader } from './proposal-builder-loader';

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
      <header data-surface="surface" className="relative z-20 shrink-0 flex items-center gap-4 px-4 py-3 sm:px-6 sm:py-4 border-b border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]">
        <a
          href={`/crm?selected=${dealId}`}
          className="p-2 -ml-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]"
          aria-label="Back to deal"
        >
          <ArrowLeft size={20} />
        </a>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
            Proposal builder
          </p>
          <h1 className="text-xl font-medium text-[var(--stage-text-primary)] tracking-tight truncate mt-0.5">
            {deal.title ?? 'Untitled production'}
          </h1>
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 overflow-auto">
        <ProposalBuilderLoader deal={deal} contacts={contacts} clientAttached={hasBillTo || !!(deal.organization_id || deal.main_contact_id)} />
      </main>
    </div>
  );
}
