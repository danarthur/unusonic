/**
 * Network Tags settings — Managed taxonomy for partner/vendor/venue categorization.
 * Readable by all workspace members; add/delete guarded by RLS (owner/admin only).
 */

import { redirect } from 'next/navigation';
import { Network } from 'lucide-react';
import { createClient } from '@/shared/api/supabase/server';
import { getWorkspaceIndustryTags } from '@/entities/talent/api/get-workspace-industry-tags';
import { IndustryTagManager } from '@/features/network-data/ui/IndustryTagManager';

export const metadata = {
  title: 'Network Tags | Settings | Unusonic',
  description: 'Manage the industry tag dictionary for your Network.',
};

export const dynamic = 'force-dynamic';

export default async function NetworkTagsSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces:workspace_id (id, name)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const rawWs = membership?.workspaces;
  const workspace = (Array.isArray(rawWs) ? rawWs[0] : rawWs) as { id: string; name: string } | null;

  if (!membership?.workspace_id || !workspace) redirect('/settings');

  const tags = await getWorkspaceIndustryTags(workspace.id);

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center shrink-0">
            <Network className="w-5 h-5 text-[var(--stage-text-secondary)]" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-tight text-[var(--stage-text-primary)]">Network tags</h1>
            <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mt-0.5">
              Industry categories for vendors, partners, and venues
            </p>
          </div>
        </div>

        <div className="stage-panel rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-medium tracking-tight text-[var(--stage-text-primary)]">Tag dictionary</h2>
            <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
              The curated list your team selects from when categorizing a Network contact. No free-text — every tag comes from here.
            </p>
          </div>
          <IndustryTagManager workspaceId={workspace.id} initialTags={tags} />
        </div>
      </div>
    </div>
  );
}
