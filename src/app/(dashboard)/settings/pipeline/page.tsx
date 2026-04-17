/**
 * Pipeline settings — edit stages, reorder, configure flags.
 * Gated on the pipelines:manage capability (owner + admin by default, plus
 * any custom role granted the capability via the Role Builder).
 */

import { redirect } from 'next/navigation';
import { Workflow } from 'lucide-react';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { PipelineEditor } from './pipeline-editor';
import type { TriggerEntry } from '@/features/pipeline-settings/api/actions';
import { normalizeTriggers } from '@/shared/lib/triggers/normalize';

export const metadata = {
  title: 'Deal flow | Unusonic',
};

export const dynamic = 'force-dynamic';

type EditorStage = {
  id: string;
  slug: string;
  label: string;
  kind: 'working' | 'won' | 'lost';
  sort_order: number;
  requires_confirmation: boolean;
  opens_handoff_wizard: boolean;
  hide_from_portal: boolean;
  tags: string[];
  color_token: string | null;
  rotting_days: number | null;
  triggers: TriggerEntry[];
};

type PipelineWithStages = {
  id: string;
  name: string;
  stages: EditorStage[];
};

export default async function PipelineSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) redirect('/settings');

  const { data: hasCap } = await supabase.rpc('member_has_capability', {
    p_workspace_id: workspaceId,
    p_permission_key: 'pipelines:manage',
  });
  if (!hasCap) redirect('/settings');

  const { data: pipelineRow } = await (supabase as any)
    .schema('ops')
    .from('pipelines')
    .select(
      'id, name, pipeline_stages(id, slug, label, kind, sort_order, requires_confirmation, opens_handoff_wizard, hide_from_portal, tags, color_token, rotting_days, triggers, is_archived)',
    )
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .eq('is_archived', false)
    .maybeSingle();

  if (!pipelineRow) {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--stage-text-secondary)]">
          This workspace has no default pipeline. Contact support.
        </p>
      </div>
    );
  }

  type StageRow = {
    id: string;
    slug: string;
    label: string;
    kind: string;
    sort_order: number;
    requires_confirmation: boolean;
    opens_handoff_wizard: boolean;
    hide_from_portal: boolean;
    tags: string[] | null;
    color_token: string | null;
    rotting_days: number | null;
    triggers: unknown;
    is_archived: boolean;
  };

  const raw = pipelineRow as { id: string; name: string; pipeline_stages?: StageRow[] };
  const stages: EditorStage[] = (raw.pipeline_stages ?? [])
    .filter((s) => !s.is_archived)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      label: s.label,
      kind: s.kind as 'working' | 'won' | 'lost',
      sort_order: s.sort_order,
      requires_confirmation: s.requires_confirmation,
      opens_handoff_wizard: s.opens_handoff_wizard,
      hide_from_portal: s.hide_from_portal,
      tags: s.tags ?? [],
      color_token: s.color_token,
      rotting_days: s.rotting_days,
      triggers: normalizeTriggers(s.triggers),
    }));

  const pipeline: PipelineWithStages = {
    id: raw.id,
    name: raw.name,
    stages,
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Workflow className="w-5 h-5 text-[var(--stage-text-secondary)]" aria-hidden />
          <h1 className="text-lg font-medium tracking-tight text-[var(--stage-text-primary)]">
            Deal flow
          </h1>
        </div>
        <p className="text-sm text-[var(--stage-text-secondary)] mb-6">
          Customize the stages your deals move through. Drag to reorder, rename inline, or add a new stage.
        </p>

        <PipelineEditor pipeline={pipeline} />
      </div>
    </div>
  );
}
