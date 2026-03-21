/**
 * Call time rules — workspace automation for crew call times.
 * Accessible to owners and admins only.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { createClient } from '@/shared/api/supabase/server';
import { CallTimeRulesManager } from '@/features/call-time-rules';
import { getCallTimeRules } from '@/features/call-time-rules';

export const metadata = {
  title: 'Call time rules | Unusonic',
};

export const dynamic = 'force-dynamic';

export default async function CallTimeRulesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.workspace_id) redirect('/settings');

  const resolvedRole = membership.role ?? 'member';

  if (resolvedRole !== 'owner' && resolvedRole !== 'admin') redirect('/settings');

  const rulesResult = await getCallTimeRules();
  const initialRules = rulesResult.success ? rulesResult.rules : [];

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <Link
          href="/settings"
          className="flex items-center gap-2 text-sm text-ink-muted hover:text-ceramic transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Settings
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-ink-muted" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-tight text-ceramic">Call time rules</h1>
            <p className="text-sm text-ink-muted leading-relaxed mt-0.5">
              Define when each role gets called. Rules apply automatically when crew is assigned.
            </p>
          </div>
        </div>

        <CallTimeRulesManager initialRules={initialRules} />
      </div>
    </div>
  );
}
