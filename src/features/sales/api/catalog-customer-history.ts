'use server';

import { createClient } from '@/shared/api/supabase/server';

export interface ItemClientHistory {
  bookingCount: number;
  avgPrice: number;
  lastBookedDate: string | null;
}

/**
 * Get how many times a specific client has booked a catalog item,
 * at what average price, and when the last booking was.
 *
 * Joins proposal_items -> proposals -> deals to find bookings
 * where origin_package_id matches and the deal's client matches.
 */
export async function getItemHistoryForClient(
  packageId: string,
  clientEntityId: string
): Promise<ItemClientHistory> {
  const supabase = await createClient();

  // Query proposal items that reference this package, joining through to deals
  const { data, error } = await supabase
    .from('proposal_items')
    .select(`
      unit_price,
      quantity,
      proposals!inner (
        deal_id,
        deals!inner (
          id,
          organization_id,
          main_contact_id,
          created_at
        )
      )
    `)
    .eq('origin_package_id', packageId);

  if (error || !data) {
    return { bookingCount: 0, avgPrice: 0, lastBookedDate: null };
  }

  // Filter client-side for the specific client entity
  // (Supabase nested filters can be tricky with OR conditions, so filter after fetch)
  const clientBookings = data.filter((row: any) => {
    const proposals = row.proposals;
    if (!proposals) return false;
    const deals = (proposals as any).deals;
    if (!deals) return false;
    const deal = Array.isArray(deals) ? deals[0] : deals;
    return (
      deal?.organization_id === clientEntityId ||
      deal?.main_contact_id === clientEntityId
    );
  });

  if (clientBookings.length === 0) {
    return { bookingCount: 0, avgPrice: 0, lastBookedDate: null };
  }

  const prices = clientBookings.map(
    (r: any) => Number(r.unit_price) * Number(r.quantity || 1)
  );
  const avgPrice = Math.round(
    prices.reduce((sum: number, p: number) => sum + p, 0) / prices.length
  );

  // Get latest date
  const dates = clientBookings
    .map((r: any) => {
      const proposals = r.proposals;
      const deals = (proposals as any)?.deals;
      const deal = Array.isArray(deals) ? deals[0] : deals;
      return deal?.created_at;
    })
    .filter(Boolean)
    .sort()
    .reverse();

  return {
    bookingCount: clientBookings.length,
    avgPrice,
    lastBookedDate: (dates[0] as string) ?? null,
  };
}
