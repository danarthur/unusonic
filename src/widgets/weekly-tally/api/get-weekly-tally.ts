'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type WeeklyTallyData = {
  proposalsSent: number;
  depositsReceived: number;
  followUpsLogged: number;
  dealsWon: number;
};

const SEVEN_DAYS_MS = 7 * 86_400_000;

export async function getWeeklyTally(): Promise<WeeklyTallyData> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { proposalsSent: 0, depositsReceived: 0, followUpsLogged: 0, dealsWon: 0 };

  const supabase = await createClient();
  const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  try {
    const [sentResult, depositResult, logResult, wonResult] = await Promise.all([
      supabase.from('proposals')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .in('status', ['sent', 'viewed', 'accepted'])
        .gte('created_at', since),
      supabase.from('proposals')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .not('deposit_paid_at', 'is', null)
        .gte('deposit_paid_at', since),
      supabase.schema('ops').from('follow_up_log')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .in('action_type', ['call_logged', 'sms_sent', 'email_sent', 'note_added'])
        .gte('created_at', since),
      supabase.from('deals')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'won')
        .gte('won_at', since),
    ]);

    return {
      proposalsSent: sentResult.count ?? 0,
      depositsReceived: depositResult.count ?? 0,
      followUpsLogged: logResult.count ?? 0,
      dealsWon: wonResult.count ?? 0,
    };
  } catch (err) {
    console.error('[WeeklyTally] fetch error:', err);
    Sentry.captureException(err, { tags: { module: 'weekly-tally' } });
    return { proposalsSent: 0, depositsReceived: 0, followUpsLogged: 0, dealsWon: 0 };
  }
}
