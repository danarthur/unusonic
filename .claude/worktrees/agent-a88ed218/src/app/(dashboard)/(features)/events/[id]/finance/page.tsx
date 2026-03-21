/**
 * Event Finance page – Bento grid: Row 1 = Revenue Ring, Profitability, Timeline; Row 2 = Invoice list (wide)
 * [id] = gigId.
 */

import Link from 'next/link';
import { ArrowLeft, FileText, LayoutDashboard } from 'lucide-react';
import { getFinancials } from '@/features/finance/api/get-gig-financials';
import {
  RevenueRing,
  InvoiceList,
  QuickActions,
  SetupBilling,
  ProfitabilityCard,
  RevenueStream,
  PaymentTimeline,
} from '@/features/finance/ui/widgets';

export default async function EventFinancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const data = await getFinancials(eventId);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6">
        <p className="text-ink-muted">Gig not found or you don’t have access.</p>
        <Link
          href="/crm"
          className="inline-flex items-center gap-2 text-ink hover:underline"
        >
          <ArrowLeft size={16} /> Back to CRM
        </Link>
      </div>
    );
  }

  const hasInvoices = data.invoices.length > 0;

  return (
    <div className="flex-1 min-h-0 p-6 overflow-y-auto min-h-[60vh]">
      <header className="mb-6 flex items-center gap-4 shrink-0 flex-wrap">
        <Link
          href={`/events/g/${data.eventId}`}
          className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          aria-label="Back to event"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-light text-ink tracking-tight">
            {data.eventTitle}
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">Finance</p>
        </div>
        <Link
          href={`/events/g/${data.eventId}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
          <LayoutDashboard size={18} />
          Event grid
        </Link>
        <Link
          href={`/events/${data.eventId}/deal`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
          <FileText size={18} />
          Deal room
        </Link>
      </header>

      {/* Bento Grid: Row 1 = Revenue Ring | Profitability | Timeline; Row 2 = Invoice list (wide) + drivers + actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(220px,auto)]">
        {/* Row 1 – Left: Revenue Ring */}
        <div className="md:row-span-1 min-w-0 min-h-[220px]">
          <RevenueRing summary={data.summary} />
        </div>
        {/* Row 1 – Middle: Profitability Card */}
        <div className="min-w-0 min-h-[220px]">
          <ProfitabilityCard
            profitability={data.profitability}
            summary={data.summary}
          />
        </div>
        {/* Row 1 – Right: Payment Timeline (Cash Horizon) */}
        <div className="min-w-0 min-h-[220px]">
          <PaymentTimeline timeline={data.paymentTimeline} />
        </div>

        {/* Row 2 – Wide: Invoice list or Setup Billing */}
        <div className="md:col-span-2 min-w-0">
          {hasInvoices ? (
            <InvoiceList invoices={data.invoices} />
          ) : (
            <SetupBilling
              eventId={data.eventId}
              eventTitle={data.eventTitle}
              proposalIds={data.proposalIds}
            />
          )}
        </div>
        {/* Row 2 – Right: Top Revenue Drivers + Quick Actions */}
        <div className="flex flex-col gap-6 min-w-0">
          <div className="min-h-[200px] shrink-0">
            <RevenueStream topItems={data.topRevenueItems} />
          </div>
          <QuickActions
            eventId={data.eventId}
            proposalIds={data.proposalIds}
          />
        </div>
      </div>
    </div>
  );
}
