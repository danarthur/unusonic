/**
 * Roster settings — Job titles and skill preset configuration (owner/admin only).
 */

import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { createClient } from '@/shared/api/supabase/server';
import { getWorkspaceSkillPresets } from '@/entities/talent/api/get-workspace-skill-presets';
import { getWorkspaceJobTitles } from '@/entities/talent/api/get-workspace-job-titles';
import { SkillPresetManager } from '@/features/talent-management/ui/SkillPresetManager';
import { JobTitleManager } from '@/features/talent-management/ui/JobTitleManager';

export const metadata = {
  title: 'Roster | Settings | Unusonic',
  description: 'Configure job titles and skill presets for your roster.',
};

export const dynamic = 'force-dynamic';

export default async function RosterSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces:workspace_id (id, name)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const rawWs = membership?.workspaces;
  const workspace = (Array.isArray(rawWs) ? rawWs[0] : rawWs) as { id: string; name: string } | null;
  const resolvedRole = membership?.role ?? 'member';

  if (!membership?.workspace_id || !workspace) redirect('/settings');
  if (resolvedRole !== 'owner' && resolvedRole !== 'admin') redirect('/settings');

  const [jobTitles, skillPresets] = await Promise.all([
    getWorkspaceJobTitles(workspace.id),
    getWorkspaceSkillPresets(workspace.id),
  ]);

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--stage-surface-nested)] flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-[var(--stage-text-secondary)]" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-tight text-[var(--stage-text-primary)]">Roster</h1>
            <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mt-0.5">
              Job titles and skill presets for crew assignment
            </p>
          </div>
        </div>

        <div className="stage-panel rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-medium tracking-tight text-[var(--stage-text-primary)]">Job titles</h2>
            <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
              Primary filter for crew assignment. "Show me all DJs."
            </p>
          </div>
          <JobTitleManager workspaceId={workspace.id} initialTitles={jobTitles} />
        </div>

        <div className="stage-panel rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-medium tracking-tight text-[var(--stage-text-primary)]">Skill presets</h2>
            <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
              Secondary filter for crew assignment. "DJs who also know GrandMA3."
            </p>
          </div>
          <SkillPresetManager workspaceId={workspace.id} initialPresets={skillPresets} />
        </div>
      </div>
    </div>
  );
}
