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

  return (
    <div className="flex-1 min-h-0 p-6 overflow-y-auto min-h-[60vh]">
      <header className="mb-6 flex items-center gap-4 shrink-0 flex-wrap">
        <Link
          href={`/events/g/${data.gig.id}`}
          className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          aria-label="Back to Command Center"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-light text-ink tracking-tight">
            {data.gig.title}
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">Deal room</p>
        </div>
        <Link
          href={`/events/g/${data.gig.id}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
          <LayoutDashboard size={18} />
          Command Center
        </Link>
        <Link
          href={`/events/${data.gig.id}/finance`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
          <Wallet size={18} />
          Finance
        </Link>
      </header>

      <DealDashboard data={data} />
    </div>
  );
}
