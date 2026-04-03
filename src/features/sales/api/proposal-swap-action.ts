'use server';

import { createClient } from '@/shared/api/supabase/server';

/**
 * Swap a proposal line item's catalog reference with a different package.
 * Updates name, price, cost, and re-snapshots the definition.
 */
export async function swapProposalLineItem(
  proposalItemId: string,
  newPackageId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Get the new package
  const { data: newPkg, error: pkgError } = await supabase
    .from('packages')
    .select('*')
    .eq('id', newPackageId)
    .single();

  if (pkgError || !newPkg) {
    return { success: false, error: 'Package not found' };
  }

  // Build the definition snapshot (same structure as addPackageToProposal)
  const definitionSnapshot = {
    margin_meta: {
      category: newPkg.category,
      target_cost: newPkg.target_cost,
    },
    price_meta: {
      floor_price: newPkg.floor_price,
    },
    tax_meta: {
      is_taxable: newPkg.is_taxable,
    },
    ...(newPkg.category === 'rental'
      ? {
          inventory_meta: {
            is_sub_rental: newPkg.is_sub_rental,
            stock_quantity: newPkg.stock_quantity,
            department:
              (newPkg.definition as Record<string, unknown> | null)?.ingredient_meta != null
                ? ((newPkg.definition as Record<string, Record<string, unknown>>).ingredient_meta?.department ?? null)
                : null,
          },
        }
      : {}),
  };

  // Update the proposal item
  const { error: updateError } = await supabase
    .from('proposal_items')
    .update({
      origin_package_id: newPackageId,
      name: newPkg.name,
      unit_price: newPkg.price,
      actual_cost: newPkg.target_cost,
      definition_snapshot: definitionSnapshot,
      is_taxable: newPkg.is_taxable,
    })
    .eq('id', proposalItemId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}
