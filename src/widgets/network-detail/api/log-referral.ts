/**
 * logReferral / deleteReferral — write paths for the reciprocity ledger.
 *
 * Workspace-scoped. Any member can log or delete. No audit retention —
 * referrals are a lightweight working ledger, not a compliance surface.
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import type { ReferralDirection } from './get-referrals';

export type LogReferralInput = {
  workspaceId: string;
  direction: ReferralDirection;
  counterpartyEntityId: string;
  clientName?: string | null;
  clientEntityId?: string | null;
  relatedDealId?: string | null;
  note?: string | null;
};

export type LogReferralResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function logReferral(
  input: LogReferralInput,
): Promise<LogReferralResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .schema('finance')
    .rpc('log_referral', {
      p_workspace_id: input.workspaceId,
      p_direction: input.direction,
      p_counterparty_entity_id: input.counterpartyEntityId,
      p_client_name: input.clientName ?? null,
      p_client_entity_id: input.clientEntityId ?? null,
      p_related_deal_id: input.relatedDealId ?? null,
      p_note: input.note ?? null,
    });

  if (error) return { ok: false, error: (error as { message: string }).message };
  if (!data) return { ok: false, error: 'Write refused — check workspace membership.' };

  revalidatePath(`/network/entity/${input.counterpartyEntityId}`);
  return { ok: true, id: data as string };
}

export async function deleteReferral(
  referralId: string,
  counterpartyEntityId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .schema('finance')
    .rpc('delete_referral', { p_referral_id: referralId });

  if (error) return { ok: false, error: (error as { message: string }).message };
  if (data !== true) return { ok: false, error: 'Delete refused.' };

  revalidatePath(`/network/entity/${counterpartyEntityId}`);
  return { ok: true };
}
