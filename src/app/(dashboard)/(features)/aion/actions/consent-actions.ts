'use server';

/**
 * Server actions that orchestrate feature consent + flag flipping for
 * the Aion beta system (Shape C).
 *
 * See:
 *   - docs/reference/aion-deal-card-unified-design.md §21 (design)
 *   - src/shared/lib/consent.ts (term registry + versioning)
 *   - supabase/migrations/20260425020000_feature_consent_system.sql
 *     (tables + RPCs)
 *
 * All of these are workspace-scoped. `acceptAionCardBeta` and
 * `disableAionCardBeta` are admin/owner gated on the server side.
 * Regular members can only call `requestAionCardAccess` + read their
 * own consent status.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import {
  CONSENT_TERMS,
  type ConsentStatus,
  type ConsentTermKey,
} from '@/shared/lib/consent';
import { getConsentStatus } from '@/shared/lib/consent-server';
import { FEATURE_FLAGS } from '@/shared/lib/feature-flags';

// =============================================================================
// Types
// =============================================================================

type BaseResult =
  | { success: true }
  | { success: false; error: string };

export type AcceptResult =
  | { success: true; consentId: string }
  | { success: false; error: string };

export type RequestAccessResult =
  | { success: true; requestId: string; alreadyPending: boolean }
  | { success: false; error: string };

export type ReviewRequestResult = BaseResult;

export type WorkspaceFeatureState = {
  workspaceId: string;
  roleSlug: string | null;
  isAdmin: boolean;          // owner or admin
  cardFlagEnabled: boolean;
  cadenceOptIn: boolean;
  cardConsent: ConsentStatus;
  cadenceConsent: ConsentStatus;
  pendingRequestCount: number;  // admin-only; 0 for members
  ownPendingRequest: { id: string; feature_key: string; requested_at: string } | null;
};

// =============================================================================
// State reader — single round-trip for the settings page + consent modal
// =============================================================================

/**
 * Reads every piece of state the settings page + modal need in one shot.
 * Returns workspace_id + role + flags + consent status + pending requests.
 */
export async function getWorkspaceFeatureState(): Promise<WorkspaceFeatureState | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Role slug via existing public RPC.
  const { data: roleData } = await supabase.rpc('get_member_role_slug', {
    p_workspace_id: workspaceId,
  });
  const roleSlug = (roleData as string | null) ?? null;
  const isAdmin = roleSlug === 'owner' || roleSlug === 'admin';

  // Workspace flags live on public.workspaces.feature_flags + aion_config.
  const { data: ws } = await supabase
    .from('workspaces')
    .select('feature_flags, aion_config')
    .eq('id', workspaceId)
    .maybeSingle();

  const flags = (ws?.feature_flags ?? {}) as Record<string, unknown>;
  const aionConfig = (ws?.aion_config ?? {}) as Record<string, unknown>;
  const cardFlagEnabled = flags[FEATURE_FLAGS.CRM_UNIFIED_AION_CARD] === true;
  const cadenceOptIn = aionConfig.learn_owner_cadence === true;

  const [cardConsent, cadenceConsent] = await Promise.all([
    getConsentStatus(workspaceId, 'aion_card_beta'),
    getConsentStatus(workspaceId, 'owner_cadence_learning'),
  ]);

  // Admin view gets pending requests count across the workspace.
  // Member view gets their own most-recent pending request only.
  let pendingRequestCount = 0;
  let ownPendingRequest: WorkspaceFeatureState['ownPendingRequest'] = null;

  if (isAdmin) {
    const { data: pending } = await supabase
      .schema('cortex')
      .from('feature_access_requests')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending');
    pendingRequestCount = (pending as { id: string }[] | null)?.length ?? 0;
  } else {
    const { data: own } = await supabase
      .schema('cortex')
      .from('feature_access_requests')
      .select('id, feature_key, requested_at')
      .eq('workspace_id', workspaceId)
      .eq('requested_by', user.id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    ownPendingRequest = (own as WorkspaceFeatureState['ownPendingRequest']) ?? null;
  }

  return {
    workspaceId,
    roleSlug,
    isAdmin,
    cardFlagEnabled,
    cadenceOptIn,
    cardConsent,
    cadenceConsent,
    pendingRequestCount,
    ownPendingRequest,
  };
}

// =============================================================================
// Accept consent + flip the flag (admin/owner only)
// =============================================================================

export type AcceptCardBetaInput = {
  /** Also accept + enable cadence learning atomically. Requires a separate consent. */
  enableCadenceLearning?: boolean;
};

/**
 * Admin/owner accepts the card beta terms. Records consent, flips
 * `crm.unified_aion_card` = true, optionally accepts + enables cadence too.
 */
export async function acceptAionCardBeta(
  input: AcceptCardBetaInput = {},
): Promise<AcceptResult> {
  const state = await getWorkspaceFeatureState();
  if (!state) return { success: false, error: 'No active workspace.' };
  if (!state.isAdmin) {
    return { success: false, error: 'Only owners and admins can accept the beta terms.' };
  }

  const supabase = await createClient();

  // 1. Record main consent
  const cardTerm = CONSENT_TERMS.aion_card_beta;
  const { data: consentId, error: consentErr } = await supabase
    .schema('cortex')
    .rpc('record_consent', {
      p_workspace_id: state.workspaceId,
      p_term_key: cardTerm.key,
      p_term_version: cardTerm.version,
      p_metadata: { source: 'settings_page' },
    });
  if (consentErr) return { success: false, error: consentErr.message };

  // 2. Flip card flag. RLS on public.workspaces has no UPDATE policy, so we
  //    route through the service-role client. Admin/owner role already
  //    validated above — this is a safe escalation.
  const system = getSystemClient();
  const { data: current } = await system
    .from('workspaces')
    .select('feature_flags')
    .eq('id', state.workspaceId)
    .maybeSingle();
  const flags = ((current?.feature_flags ?? {}) as Record<string, unknown>);
  flags[FEATURE_FLAGS.CRM_UNIFIED_AION_CARD] = true;

  const { error: flagErr } = await system
    .from('workspaces')
    .update({ feature_flags: flags as never })
    .eq('id', state.workspaceId);
  if (flagErr) return { success: false, error: flagErr.message };

  // 3. Optional: accept + enable cadence learning atomically
  if (input.enableCadenceLearning) {
    const cadenceTerm = CONSENT_TERMS.owner_cadence_learning;
    const { error: cadenceConsentErr } = await supabase
      .schema('cortex')
      .rpc('record_consent', {
        p_workspace_id: state.workspaceId,
        p_term_key: cadenceTerm.key,
        p_term_version: cadenceTerm.version,
        p_metadata: { source: 'settings_page_bundled' },
      });
    if (cadenceConsentErr) {
      return { success: false, error: cadenceConsentErr.message };
    }

    const { data: wsCfg } = await system
      .from('workspaces')
      .select('aion_config')
      .eq('id', state.workspaceId)
      .maybeSingle();
    const cfg = ((wsCfg?.aion_config ?? {}) as Record<string, unknown>);
    cfg.learn_owner_cadence = true;
    await system
      .from('workspaces')
      .update({ aion_config: cfg as never })
      .eq('id', state.workspaceId);
  }

  revalidatePath('/events');
  revalidatePath('/settings/aion');

  return { success: true, consentId: consentId as string };
}

// =============================================================================
// Disable (admin/owner) — flips flag off + fans out UI notice
// =============================================================================

export async function disableAionCardBeta(): Promise<BaseResult> {
  const state = await getWorkspaceFeatureState();
  if (!state) return { success: false, error: 'No active workspace.' };
  if (!state.isAdmin) {
    return { success: false, error: 'Only owners and admins can disable the beta.' };
  }

  const supabase = await createClient();
  const system = getSystemClient();

  // Flip flag off via service role (public.workspaces has no UPDATE RLS policy).
  const { data: current } = await system
    .from('workspaces')
    .select('feature_flags')
    .eq('id', state.workspaceId)
    .maybeSingle();
  const flags = ((current?.feature_flags ?? {}) as Record<string, unknown>);
  flags[FEATURE_FLAGS.CRM_UNIFIED_AION_CARD] = false;
  const { error: flagErr } = await system
    .from('workspaces')
    .update({ feature_flags: flags as never })
    .eq('id', state.workspaceId);
  if (flagErr) return { success: false, error: flagErr.message };

  // Also flip cadence off since the card is the only consumer today
  const { data: wsCfg } = await system
    .from('workspaces')
    .select('aion_config')
    .eq('id', state.workspaceId)
    .maybeSingle();
  const cfg = ((wsCfg?.aion_config ?? {}) as Record<string, unknown>);
  if (cfg.learn_owner_cadence === true) {
    cfg.learn_owner_cadence = false;
    await system
      .from('workspaces')
      .update({ aion_config: cfg as never })
      .eq('id', state.workspaceId);
  }

  // Fan out notice to every member — RPC runs SECURITY DEFINER so the
  // authenticated session's admin role is checked inside the function.
  await supabase.schema('cortex').rpc('fanout_ui_notice', {
    p_workspace_id: state.workspaceId,
    p_notice_type: 'aion_card_beta_disabled',
    p_payload: {
      title: 'Aion card beta turned off',
      body: 'Your workspace admin turned off the Aion deal card beta. The deal page has reverted to the previous layout.',
    },
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });

  revalidatePath('/events');
  revalidatePath('/settings/aion');

  return { success: true };
}

// =============================================================================
// Revoke a single consent (self or admin-for-user)
// =============================================================================

export async function revokeOwnConsent(
  termKey: ConsentTermKey,
): Promise<BaseResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();
  const { error } = await supabase
    .schema('cortex')
    .rpc('revoke_consent', {
      p_workspace_id: workspaceId,
      p_term_key: termKey,
      p_target_user: undefined,    // self
    });
  if (error) return { success: false, error: error.message };

  revalidatePath('/settings/aion');
  return { success: true };
}

// =============================================================================
// Member-side: request access to a feature
// =============================================================================

export async function requestAionCardAccess(): Promise<RequestAccessResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  // Check if caller already has a pending request (RPC dedups, but the
  // client wants to know whether it was a new insert or a reuse).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not signed in.' };

  const { data: existing } = await supabase
    .schema('cortex')
    .from('feature_access_requests')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('requested_by', user.id)
    .eq('feature_key', FEATURE_FLAGS.CRM_UNIFIED_AION_CARD)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();

  const { data: requestId, error } = await supabase
    .schema('cortex')
    .rpc('request_feature_access', {
      p_workspace_id: workspaceId,
      p_feature_key: FEATURE_FLAGS.CRM_UNIFIED_AION_CARD,
      p_metadata: { requested_from: 'crm_gate' },
    });
  if (error) return { success: false, error: error.message };

  revalidatePath('/settings/aion');
  return {
    success: true,
    requestId: requestId as string,
    alreadyPending: existing !== null,
  };
}

// =============================================================================
// Admin-side: approve / deny requests
// =============================================================================

export async function reviewFeatureRequest(
  requestId: string,
  decision: 'approved' | 'denied',
  note?: string,
): Promise<ReviewRequestResult> {
  const state = await getWorkspaceFeatureState();
  if (!state) return { success: false, error: 'No active workspace.' };
  if (!state.isAdmin) {
    return { success: false, error: 'Only owners and admins can review requests.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema('cortex')
    .rpc('review_feature_request', {
      p_request_id: requestId,
      p_decision: decision,
      p_note: note ?? null,
    });
  if (error) return { success: false, error: error.message };

  revalidatePath('/settings/aion');
  return { success: true };
}

// =============================================================================
// Dismiss a UI notice (banner)
// =============================================================================

export async function dismissUiNotice(noticeId: string): Promise<BaseResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema('cortex')
    .rpc('dismiss_ui_notice', { p_notice_id: noticeId });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Read pending (unseen) notices for the current user. Used by DealLens
 * (+ eventually a global banner host) to show one-shot toast/banners.
 */
export async function getPendingUiNotices(): Promise<
  Array<{
    id: string;
    notice_type: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>
> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .schema('cortex')
    .from('ui_notices')
    .select('id, notice_type, payload, created_at')
    .eq('workspace_id', workspaceId)
    .is('seen_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  return (data ?? []) as Array<{
    id: string;
    notice_type: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;
}
