'use server';

import { createClient } from '@/shared/api/supabase/server';

export async function getRecoveryStatus(): Promise<{
  hasRecoveryKit: boolean;
  accountCreatedAt: string | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('has_recovery_kit')
    .eq('id', user.id)
    .maybeSingle();

  return {
    hasRecoveryKit: profile?.has_recovery_kit ?? false,
    accountCreatedAt: user.created_at ?? null,
  };
}
