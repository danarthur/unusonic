/**
 * Security settings – passkeys and Safety Net guardians.
 */

import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { SecuritySection } from './SecuritySection';

export const metadata = {
  title: 'Security | Signal',
  description: 'Passkeys and Safety Net recovery',
};

export const dynamic = 'force-dynamic';

export default async function SecuritySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [profileRes, recoveryRes] = await Promise.all([
    supabase.from('profiles').select('has_recovery_kit').eq('id', user.id).maybeSingle(),
    supabase.from('recovery_requests').select('id, timelock_until').eq('owner_id', user.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const hasRecoveryKit = profileRes.data?.has_recovery_kit ?? false;
  const pendingRecovery = recoveryRes.data ?? null;

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6 max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight text-ceramic mb-6">
        Security
      </h1>
      <SecuritySection
        hasRecoveryKit={hasRecoveryKit}
        pendingRecoveryRequest={pendingRecovery}
      />
    </div>
  );
}
