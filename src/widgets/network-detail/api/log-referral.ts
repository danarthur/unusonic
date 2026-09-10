/**
 * logReferral / deleteReferral — write paths for the reciprocity ledger.
 *
 * Workspace-scoped. Any member can log or delete. No audit retention —
 * referrals are a lightweight working ledger, not a compliance surface.
 *
 * ATTRIBUTION: a referral credits the PERSON and freezes the org they were at.
 * That split follows from this being a recognition ledger rather than a
 * payables one — an organization cannot exercise the judgement a referral
 * represents, so the human is named, while the org is recorded for roll-up.
 *
 * If a commission or payout is ever attached to a referral, the PAYEE must be
 * the ORG, not the person: every domain where money actually moves resolves to
 * the entity. And never sum person-credit with org-credit — see the
 * throughTeam note in get-referrals.ts.
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
  /**
   * The org to credit alongside the person. Optional: when omitted, the RPC
   * resolves the counterparty's CURRENT employer from the live affiliation
   * edge and freezes it onto the row. Pass it explicitly only when logging a
   * referral that happened in the past and the person has since moved --
   * otherwise the referral would be stamped with the wrong employer.
   *
   * Ignored when the counterparty is itself a company.
   */
  counterpartyOrgEntityId?: string | null;
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
      p_client_name: input.clientName ?? undefined,
      p_client_entity_id: input.clientEntityId ?? undefined,
      p_related_deal_id: input.relatedDealId ?? undefined,
      p_note: input.note ?? undefined,
      p_counterparty_org_entity_id: input.counterpartyOrgEntityId ?? undefined,
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
