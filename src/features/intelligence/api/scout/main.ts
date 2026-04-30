/**
 * Aion Scout v3 — Sub-Agent Architecture (One-Way Mirror)
 * Entry-point server actions: scoutEntity (authenticated, has org) and
 * scoutEntityForOnboarding (no org yet). Both delegate to runScoutPipeline.
 *
 * IMAGE HANDLING (Legal / Best Practice):
 * - Extract and store URL strings only (avatarUrl, logoUrl). Never download or re-host images.
 * - Render via <img src={url} /> so the browser fetches from source (hotlinking).
 * - User clicks Apply to save roster — that consent moment is when we persist avatar_url.
 * - Blank state uses initials avatar. Avoids storing biometric data without consent.
 * @module features/intelligence/api/scout/main
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { runScoutPipeline } from './pipeline';
import type { ScoutOptions, ScoutPipelineResult } from './types';

export async function scoutEntity(
  url: string,
  options?: ScoutOptions
): Promise<ScoutPipelineResult> {
  const debug = options?.debug ?? process.env.SCOUT_DEBUG === '1';
  const currentOrgId = await getCurrentOrgId();
  if (!currentOrgId) return { error: 'Unauthorized' };
  let existingTags: string[] = [];
  try {
    const supabase = await createClient();
    const { data: srcEnt } = await supabase
      .schema('directory').from('entities')
      .select('id').eq('legacy_org_id', currentOrgId).maybeSingle();
    if (srcEnt?.id) {
      const { data } = await supabase
        .schema('cortex').from('relationships')
        .select('context_data')
        .eq('source_entity_id', srcEnt.id)
        .in('relationship_type', ['VENDOR', 'VENUE_PARTNER', 'CLIENT', 'PARTNER']);
      existingTags = [...new Set(
        (data ?? []).flatMap((r) => ((r.context_data as Record<string, unknown>)?.tags as string[]) ?? [])
      )];
    }
  } catch {
    /* ignore */
  }
  return runScoutPipeline(url, existingTags, debug);
}

/**
 * Scout for onboarding: no org required. Use when user is setting up (e.g. website step).
 * Resolves tags against empty list. Caller must be authenticated (session).
 */
export async function scoutEntityForOnboarding(
  url: string,
  options?: { debug?: boolean }
): Promise<ScoutPipelineResult> {
  const debug = options?.debug ?? process.env.SCOUT_DEBUG === '1';
  return runScoutPipeline(url, [], debug);
}
