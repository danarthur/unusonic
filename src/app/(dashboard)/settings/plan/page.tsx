import { redirect } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { PlanPageClient } from './components/PlanPageClient';
import { getWorkspaceUsage } from './actions';
import type { SubscriptionTier, UserPersona } from '@/features/onboarding/model/subscription-types';

export const metadata = { title: 'Plan | Unusonic' };
export const dynamic = 'force-dynamic';

async function getPlanData() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces:workspace_id (name, slug, subscription_tier)')
    .eq('user_id', user.id)
    .maybeSingle();

  const rawWs = membership?.workspaces;
  const workspace = (Array.isArray(rawWs) ? rawWs[0] : rawWs) as { name: string; slug: string | null; subscription_tier: string | null } | null;

  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('persona')
    .eq('workspace_id', membership?.workspace_id ?? '')
    .maybeSingle();

  // Fetch usage data (seats, shows, billing status)
  const usage = membership?.workspace_id
    ? await getWorkspaceUsage(membership.workspace_id)
    : null;

  return {
    currentTier: (workspace?.subscription_tier ?? 'foundation') as SubscriptionTier,
    persona: (agentConfig?.persona ?? null) as UserPersona | null,
    workspaceName: workspace?.name ?? '',
    workspaceSlug: workspace?.slug ?? '',
    isOwner: membership?.role === 'owner' || membership?.role === 'admin',
    usage,
  };
}

export default async function PlanPage() {
  const data = await getPlanData();
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <PlanPageClient {...data} />
      </div>
    </div>
  );
}
