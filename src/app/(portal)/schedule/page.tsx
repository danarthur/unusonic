/**
 * Unified Schedule — employee portal.
 * Three views: list (default), week, month.
 * Merges the old schedule + calendar pages into one.
 */

import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { getEntityCrewSchedule, getEntityCrewHistory } from '@/features/ops/actions/get-entity-crew-schedule';
import { getOpenPositions } from '@/features/ops/actions/get-open-positions';
import { getEntityDealHolds } from '@/features/ops/actions/get-entity-deal-holds';
import { getEntityConfirmedDeals } from '@/features/ops/actions/get-entity-confirmed-deals';
import { getOrCreateIcalToken } from '@/features/ops/actions/get-ical-token';
import { ScheduleShell } from './schedule-shell';
import { PushPrompt } from '../components/push-prompt';
import type { ProgramMoment, SongEntry } from '@/features/ops/lib/dj-prep-schema';
import { normalizeSongPool } from '@/features/ops/lib/dj-prep-schema';

export type PrepReadiness = {
  status: 'complete' | 'needs_attention' | 'not_started';
  hint: string | null;
};

function computePrepReadiness(rosData: Record<string, unknown> | null): PrepReadiness {
  if (!rosData) return { status: 'not_started', hint: 'No show prep yet' };

  const hasV2 = rosData.dj_program_version === 2;
  const moments = hasV2
    ? (rosData.dj_program_moments as ProgramMoment[] | undefined) ?? []
    : (rosData.dj_timeline as unknown[] | undefined) ?? [];
  const songs = hasV2
    ? normalizeSongPool(rosData.dj_song_pool)
    : (rosData.dj_must_play as string[] | undefined) ?? [];
  const clientInfo = (rosData.dj_client_info as Record<string, unknown> | undefined);
  const hasClientName = !!clientInfo?.couple_names;

  if (moments.length === 0 && songs.length === 0) {
    return { status: 'not_started', hint: 'No show prep yet' };
  }

  const issues: string[] = [];
  if (!hasClientName) issues.push('no client info');
  if (hasV2 && Array.isArray(songs)) {
    const unassigned = (songs as SongEntry[]).filter(
      s => s.tier === 'must_play' && !s.assigned_moment_id
    );
    if (unassigned.length > 0) issues.push(`${unassigned.length} unassigned`);
  }

  if (issues.length > 0) {
    return { status: 'needs_attention', hint: issues.join(', ') };
  }
  return { status: 'complete', hint: null };
}

export const dynamic = 'force-dynamic';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve the user's person entity (with attributes for blackouts)
  const { data: personEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, attributes')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!personEntity) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
        <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          No profile linked
        </h1>
        <p className="text-sm text-[var(--stage-text-secondary)] max-w-md">
          Your account isn’t linked to a team member profile yet. Contact your team admin to link
          your profile.
        </p>
      </div>
    );
  }

  // Get workspace ID for open positions query
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  // Parse blackouts from entity attributes
  const attrs = readEntityAttrs(personEntity.attributes, 'person');
  const blackouts = attrs.availability_blackouts ?? [];

  const [upcoming, past, openPositions, dealHolds, confirmedDeals, icalToken] = await Promise.all([
    getEntityCrewSchedule(personEntity.id),
    getEntityCrewHistory(personEntity.id),
    membership?.workspace_id ? getOpenPositions(membership.workspace_id) : Promise.resolve([]),
    getEntityDealHolds(personEntity.id),
    getEntityConfirmedDeals(personEntity.id),
    getOrCreateIcalToken(),
  ]);

  // Compute prep readiness for DJ-assigned upcoming gigs
  const djRolePattern = /\b(dj|mc|emcee|entertainer|host)\b/i;
  const djEventIds = upcoming
    .filter(e => djRolePattern.test(e.role))
    .map(e => e.event_id);

  const prepReadinessMap = new Map<string, PrepReadiness>();
  if (djEventIds.length > 0) {
    const { data: events } = await supabase
      .schema('ops')
      .from('events')
      .select('id, run_of_show_data')
      .in('id', djEventIds);

    for (const ev of events ?? []) {
      prepReadinessMap.set(
        ev.id,
        computePrepReadiness(ev.run_of_show_data as Record<string, unknown> | null),
      );
    }
  }

  // Serialize for client
  const prepReadiness: Record<string, PrepReadiness> = Object.fromEntries(prepReadinessMap);

  return (
    <>
      <PushPrompt />
      <ScheduleShell
        upcoming={upcoming}
        past={past}
        openPositions={openPositions}
        dealHolds={dealHolds}
        confirmedDeals={confirmedDeals}
        personEntityId={personEntity.id}
        blackouts={blackouts}
        icalToken={icalToken}
        initialView={(params.view as 'list' | 'week' | 'month') ?? 'list'}
        prepReadiness={prepReadiness}
      />
    </>
  );
}
