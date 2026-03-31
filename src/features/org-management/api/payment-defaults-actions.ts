'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';

const PaymentDefaultsSchema = z.object({
  default_deposit_percent: z.number().min(0).max(100).optional(),
  default_deposit_deadline_days: z.number().int().min(0).max(90).optional(),
  default_balance_due_days_before_event: z.number().int().min(0).max(180).optional(),
});

export type WorkspacePaymentDefaults = {
  default_deposit_percent: number;
  default_deposit_deadline_days: number;
  default_balance_due_days_before_event: number;
};

export async function getWorkspacePaymentDefaults(): Promise<WorkspacePaymentDefaults | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspaces')
    .select('default_deposit_percent, default_deposit_deadline_days, default_balance_due_days_before_event')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    default_deposit_percent: Number(data.default_deposit_percent) ?? 50,
    default_deposit_deadline_days: data.default_deposit_deadline_days ?? 7,
    default_balance_due_days_before_event: data.default_balance_due_days_before_event ?? 14,
  };
}

export async function updateWorkspacePaymentDefaults(
  patch: z.infer<typeof PaymentDefaultsSchema>,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = PaymentDefaultsSchema.safeParse(patch);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  const supabase = await createClient();

  // Verify caller is owner or admin
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .maybeSingle();

  const role = (membership as { role?: string } | null)?.role;
  if (role !== 'owner' && role !== 'admin') {
    return { success: false, error: 'Only owners and admins can change payment defaults' };
  }

  const { error } = await supabase
    .from('workspaces')
    .update(parsed.data)
    .eq('id', workspaceId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/settings');
  return { success: true };
}
