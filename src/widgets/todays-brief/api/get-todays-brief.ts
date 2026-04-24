'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type TodaysBriefData = {
  body: string;
  factsJson: Record<string, unknown>;
  generatedAt: string;
} | null;

export async function getTodaysBrief(): Promise<TodaysBriefData> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('ops')
    .from('daily_briefings')
    .select('body, facts_json, generated_at')
    .eq('workspace_id', workspaceId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as { body: string; facts_json: Record<string, unknown>; generated_at: string };
  return { body: row.body, factsJson: row.facts_json, generatedAt: row.generated_at };
}
