/**
 * Server-side consent helpers. Kept separate from `./consent.ts` so that
 * the client-safe term registry can be imported by React Client Components
 * (e.g. FeatureConsentModal) without pulling `server-only` through webpack.
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import {
  CONSENT_TERMS,
  type ConsentStatus,
  type ConsentTermKey,
} from './consent';

/**
 * Check a single term's consent status for the current caller in a workspace.
 * Returns `accepted=false` when never accepted, never had a workspace member
 * row, or revoked. When a previous version was accepted but the current
 * version string differs, returns `requiresReconsent=true`.
 */
export async function getConsentStatus(
  workspaceId: string,
  termKey: ConsentTermKey,
): Promise<ConsentStatus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      accepted: false,
      acceptedAt: null,
      acceptedVersion: null,
      requiresReconsent: false,
      revokedAt: null,
    };
  }

  const { data, error } = await supabase
    .schema('cortex')
    .from('consent_log')
    .select('term_version, accepted_at, revoked_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('term_key', termKey)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      accepted: false,
      acceptedAt: null,
      acceptedVersion: null,
      requiresReconsent: false,
      revokedAt: null,
    };
  }

  const row = data as { term_version: string; accepted_at: string; revoked_at: string | null };
  const current = CONSENT_TERMS[termKey].version;

  if (row.revoked_at) {
    return {
      accepted: false,
      acceptedAt: row.accepted_at,
      acceptedVersion: row.term_version,
      requiresReconsent: false,
      revokedAt: row.revoked_at,
    };
  }

  const requiresReconsent = row.term_version !== current;
  return {
    accepted: !requiresReconsent,
    acceptedAt: row.accepted_at,
    acceptedVersion: row.term_version,
    requiresReconsent,
    revokedAt: null,
  };
}
