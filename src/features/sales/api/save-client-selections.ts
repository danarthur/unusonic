'use server';

import { getSystemClient } from '@/shared/api/supabase/system';
import { z } from 'zod';

const SelectionSchema = z.array(z.object({
  itemId: z.string().uuid(),
  selected: z.boolean(),
}));

export interface SaveClientSelectionsResult {
  success: boolean;
  newTotal: number;
  error?: string;
}

export async function saveClientSelections(
  token: string,
  selections: { itemId: string; selected: boolean }[]
): Promise<SaveClientSelectionsResult> {
  if (!token?.trim()) return { success: false, newTotal: 0, error: 'Invalid token' };

  const parsed = SelectionSchema.safeParse(selections);
  if (!parsed.success) return { success: false, newTotal: 0, error: 'Invalid selections' };

  const supabase = getSystemClient();

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, status, client_selections_locked_at')
    .eq('public_token', token.trim())
    .in('status', ['sent', 'viewed'])
    .maybeSingle();

  if (!proposal) return { success: false, newTotal: 0, error: 'Proposal not found or already signed' };

  if ((proposal as { client_selections_locked_at?: string | null }).client_selections_locked_at) {
    return { success: false, newTotal: 0, error: 'Selections are locked — proposal is being signed' };
  }

  const proposalId = proposal.id;

  // Verify every item_id belongs to THIS proposal before writing.
  // Without this check a malicious client could supply item UUIDs from another
  // workspace's proposal — the FK constraint allows the insert since it only
  // validates that the UUID exists in proposal_items, not that it belongs here.
  const incomingItemIds = parsed.data.map((s) => s.itemId);
  const { data: ownedItems } = await supabase
    .from('proposal_items')
    .select('id')
    .eq('proposal_id', proposalId)
    .in('id', incomingItemIds);

  const ownedSet = new Set((ownedItems ?? []).map((r) => r.id));
  if (incomingItemIds.some((id) => !ownedSet.has(id))) {
    return { success: false, newTotal: 0, error: 'One or more items do not belong to this proposal' };
  }

  const rows = parsed.data.map((s) => ({
    proposal_id: proposalId,
    item_id: s.itemId,
    selected: s.selected,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from('proposal_client_selections')
    .upsert(rows, { onConflict: 'proposal_id,item_id' });

  if (upsertError) return { success: false, newTotal: 0, error: upsertError.message };

  // Recompute total respecting new selections
  const { data: items } = await supabase
    .from('proposal_items')
    .select('id, unit_price, override_price, quantity, unit_multiplier, is_optional, is_client_visible')
    .eq('proposal_id', proposalId);

  const { data: newSelRows } = await supabase
    .from('proposal_client_selections')
    .select('item_id, selected')
    .eq('proposal_id', proposalId);

  const selMap = new Map((newSelRows ?? []).map((s) => [s.item_id, s.selected]));

  const newTotal = (items ?? []).reduce((sum, row) => {
    if ((row as { is_client_visible?: boolean }).is_client_visible === false) return sum;
    const isOptional = row.is_optional ?? false;
    const selected = isOptional ? (selMap.get(row.id) ?? true) : true;
    if (!selected) return sum;
    const price = Number((row as { override_price?: number | null }).override_price ?? row.unit_price ?? 0);
    const mult = Number((row as { unit_multiplier?: number | null }).unit_multiplier ?? 1) || 1;
    return sum + (row.quantity ?? 1) * mult * price;
  }, 0);

  return { success: true, newTotal };
}
