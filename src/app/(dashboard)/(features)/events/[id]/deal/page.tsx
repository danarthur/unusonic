/**
 * Deal Room page – Sales pipeline and deal info for a gig.
 * [id] = eventId. Fetches DealRoomDTO via getGigDealRoom.
 */

import Link from 'next/link';
import { ArrowLeft, Wallet, LayoutDashboard } from 'lucide-react';
import { getGigDealRoom } from '@/features/sales/api/get-deal-room';
import { DealDashboard } from '@/features/sales/ui/deal-dashboard';

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gigId } = await params;

  const data = await getGigDealRoom(gigId);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-6">
        <p className="text-[var(--stage-text-secondary)]">Gig not found or you don’t have access.</p>
        <Link
          href="/crm"
          className="inline-flex items-center gap-2 text-[var(--stage-text-primary)] hover:underline"
        >
          <ArrowLeft size={16} /> Back to CRM
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 p-6 overflow-y-auto min-h-[60vh]">
      <header className="mb-6 flex items-center gap-4 shrink-0 flex-wrap">
        <Link
          href={`/events/g/${data.gig.id}`}
          className="stage-hover overflow-hidden p-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          aria-label="Back to Studio"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-light text-[var(--stage-text-primary)] tracking-tight">
            {data.gig.title}
          </h1>
          <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5">Deal room</p>
        </div>
        <Link
          href={`/events/g/${data.gig.id}`}
          className="stage-hover overflow-hidden inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
        >
          <LayoutDashboard size={18} />
          Studio
        </Link>
        <Link
          href={`/events/${data.gig.id}/finance`}
          className="stage-hover overflow-hidden inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
        >
          <Wallet size={18} />
          Finance
        </Link>
      </header>

      <DealDashboard data={data} />
    </div>
  );
}
