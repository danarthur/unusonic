/**
 * Feature consent registry + helpers.
 *
 * Term versions live here as code-level constants. Bumping a version string
 * invalidates every existing accepted row for that term — the next consent
 * check will return `requiresReconsent=true` and the modal re-appears.
 *
 * A term's `body` is the user-visible disclosure. Legal/privacy review before
 * any version bump. Bumping `version` without changing `body` is forbidden —
 * it would force re-consent for no reason and erode trust.
 *
 * See docs/reference/aion-deal-card-unified-design.md §21 (Shape C consent
 * system).
 */

export type ConsentTermKey =
  | 'aion_card_beta'
  | 'owner_cadence_learning';

export type ConsentTerm = {
  key: ConsentTermKey;
  version: string;           // bump any time `body` changes
  title: string;
  /** Markdown-light body. Rendered as paragraph breaks on \n\n. */
  body: string;
  /** Minimum role slug that can accept on the workspace's behalf. */
  acceptingRoles: readonly ('owner' | 'admin')[];
  /** Optional dependent-term the user must have accepted first. */
  requires?: ConsentTermKey;
};

// -----------------------------------------------------------------------------
// Term registry — versioned, review-gated
// -----------------------------------------------------------------------------

const AION_CARD_BETA: ConsentTerm = {
  key: 'aion_card_beta',
  version: '2026-04-18',
  title: 'Aion deal card — beta',
  body: [
    'Turning this on replaces your deal page’s stall, advance-suggestion, and next-actions surfaces with a single Aion card that merges them.',
    'The card reads the same signals you already see today — follow-ups, proposal engagement, stage dwell — and groups them under Outbound and Pipeline sections. Every action remains yours: no stage moves, no messages, no state changes happen without your click.',
    'Aion logs your accepts, dismisses, and snoozes in your workspace’s activity log so you can audit anything unusual. No data is sent outside your workspace.',
    'You can turn this off anytime. Doing so reverts your deal page to the previous layout and tells members it was disabled. Your data stays as-is.',
  ].join('\n\n'),
  acceptingRoles: ['owner', 'admin'],
};

const OWNER_CADENCE_LEARNING: ConsentTerm = {
  key: 'owner_cadence_learning',
  version: '2026-04-18',
  title: 'Personalize Aion with your follow-up history',
  body: [
    'When you turn this on, Aion analyzes your past follow-ups — how many days you usually wait to check in after sending a proposal, the rhythm of your nudges, the cadence of your outreach — and adapts its suggestions to match your pace.',
    'Learning happens from your own actions only. Acts triggered by Aion itself are excluded so the system never trains on its own output. Your workspace members do not see each other’s cadence. An admin can see that you opted in, but not your numbers.',
    'Turn off anytime. We’ll stop using this data immediately and remove what we’ve learned within 30 days. Backups and system logs may retain derived rollups longer, consistent with our standard retention.',
    'This is an automated profiling step under GDPR Article 22. Consent is recorded with a timestamp and the version of this notice, and can be withdrawn from your Aion settings at any time.',
  ].join('\n\n'),
  acceptingRoles: ['owner', 'admin'],
  requires: 'aion_card_beta',
};

export const CONSENT_TERMS: Record<ConsentTermKey, ConsentTerm> = {
  aion_card_beta: AION_CARD_BETA,
  owner_cadence_learning: OWNER_CADENCE_LEARNING,
};

export function getTerm(key: ConsentTermKey): ConsentTerm {
  return CONSENT_TERMS[key];
}

// -----------------------------------------------------------------------------
// Server-side helpers — import only from server actions / route handlers
// -----------------------------------------------------------------------------

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type ConsentStatus = {
  accepted: boolean;
  acceptedAt: string | null;
  acceptedVersion: string | null;
  requiresReconsent: boolean;     // accepted an older version; need to re-accept
  revokedAt: string | null;
};

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
