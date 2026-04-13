/**
 * Roles settings – Role Builder (workspace owners and admins only).
 * Dedicated route so "Roles" is easy to find and link to.
 */

import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { RoleBuilderShell } from '@/features/role-builder';
import { Shield } from 'lucide-react';

export const metadata = {
  title: 'Roles | Unusonic',
  description: 'Manage workspace roles and permissions',
};

export const dynamic = 'force-dynamic';

export default async function RolesSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('workspace_members')
    .select(`
      workspace_id,
      role,
      workspaces:workspace_id (id, name, subscription_tier)
    `)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const rawWs = membership?.workspaces;
  const workspace = (Array.isArray(rawWs) ? rawWs[0] : rawWs) as { id: string; name: string; subscription_tier?: string | null } | null;
  const resolvedRole = (membership?.role ?? 'member') as string;

  if (!membership?.workspace_id || !workspace) {
    redirect('/settings');
  }

  if (resolvedRole !== 'owner' && resolvedRole !== 'admin') {
    redirect('/settings');
  }

  const subscriptionTier = (workspace?.subscription_tier ?? 'foundation') as 'foundation' | 'growth' | 'venue_os' | 'autonomous';

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-[var(--stage-text-secondary)]" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-tight text-[var(--stage-text-primary)]">Roles</h1>
            <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mt-0.5">
              Custom roles and permission bundles
            </p>
          </div>
        </div>
        <RoleBuilderShell
          workspaceId={workspace.id}
          subscriptionTier={subscriptionTier}
        />
      </div>
    </div>
  );
}
