/**
 * Roles settings – Role Builder (workspace owners and admins only).
 * Dedicated route so "Roles" is easy to find and link to.
 */

import Link from 'next/link';
import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { RoleBuilderShell } from '@/features/role-builder';
import { ArrowLeft, Shield } from 'lucide-react';

export const metadata = {
  title: 'Roles | Signal',
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
      role_id,
      workspaces:workspace_id (id, name, subscription_tier),
      workspace_roles:role_id (slug)
    `)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const rawWs = membership?.workspaces;
  const workspace = (Array.isArray(rawWs) ? rawWs[0] : rawWs) as { id: string; name: string; subscription_tier?: string | null } | null;
  const rawRole = membership?.workspace_roles;
  const roleSlug = (Array.isArray(rawRole) ? rawRole[0] : rawRole) as { slug: string } | null;
  const resolvedRole = (roleSlug?.slug ?? membership?.role ?? 'member') as string;

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
        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            className="flex items-center gap-2 text-sm text-ink-muted hover:text-ceramic transition-colors leading-relaxed"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Settings</span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-ink-muted" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-tight text-ceramic">Roles</h1>
            <p className="text-sm text-ink-muted leading-relaxed mt-0.5">
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
