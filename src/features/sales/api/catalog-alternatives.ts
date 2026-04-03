'use server';

import { createClient } from '@/shared/api/supabase/server';
import { checkBatchAvailability, type ItemAvailability } from './catalog-availability';

export interface AlternativeWithAvailability {
  id: string;
  name: string;
  price: number;
  priceDelta: number; // positive = more expensive, negative = cheaper
  availability: ItemAvailability | null;
}

/**
 * Get alternatives for a catalog item with their availability on a given date.
 */
export async function getAlternativesWithAvailability(
  workspaceId: string,
  packageId: string,
  proposedDate: string
): Promise<AlternativeWithAvailability[]> {
  const supabase = await createClient();

  // Get the source package to read alternatives and its price
  const { data: sourcePkg } = await supabase
    .from('packages')
    .select('id, price, definition')
    .eq('id', packageId)
    .single();

  if (!sourcePkg) return [];

  const altIds = (sourcePkg.definition as Record<string, unknown> | null)?.alternatives as string[] | undefined;
  if (!altIds || altIds.length === 0) return [];

  // Get alternative packages
  const { data: altPkgs } = await supabase
    .from('packages')
    .select('id, name, price, category')
    .in('id', altIds)
    .eq('is_active', true);

  if (!altPkgs || altPkgs.length === 0) return [];

  // Batch check availability
  const availabilityMap = await checkBatchAvailability(
    workspaceId,
    altPkgs.map((p) => p.id),
    proposedDate
  );

  const sourcePrice = Number(sourcePkg.price);

  return altPkgs.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    price: Number(pkg.price),
    priceDelta: Number(pkg.price) - sourcePrice,
    availability: availabilityMap[pkg.id] ?? null,
  }));
}
