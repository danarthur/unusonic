/**
 * Unusonic onboarding — creating the workspace.
 *
 * Workspace, org entity, owner person entity, ROSTER_MEMBER edge, membership,
 * profile and agent config, all in one database transaction via
 * `create_workspace_with_owner`. This file used to do those seven writes in
 * sequence and undo them by hand; see the migration for why that produced an
 * orphaned workspace in production.
 *
 * @module features/onboarding/actions/complete-setup
 */

'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import type { UserPersona, SubscriptionTier } from '../model/subscription-types';
import { getModulesForTier } from '../lib/get-modules-for-tier';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-|-$/g, '');
}

export type OrganizationType = 'solo' | 'agency' | 'venue';

export interface InitializeOrganizationInput {
  name: string;
  type: OrganizationType;
  subscriptionTier: SubscriptionTier;
  pmsIntegrationEnabled?: boolean;
  unusonicPayEnabled?: boolean;
}

export interface InitializeOrganizationResult {
  success: boolean;
  error?: string;
  organizationId?: string;
  workspaceId?: string;
  redirectPath?: string;
  finalSlug?: string;
}

/**
 * Create the workspace and everything a workspace needs to exist, atomically.
 *
 * Safe to call twice: the RPC holds an advisory lock on the caller and returns
 * the workspace they already own by that name rather than making a second one,
 * which is what a double-click or an impatient refresh on a slow onboarding
 * submit would otherwise do.
 *
 * NOTE on removed afterburners: earlier versions fired `triggerVectorEmbeddings`
 * on venue tiers and `registerAgent` on studio tiers. Both were stubs blocked on
 * external systems (Aion RAG ingestion endpoint + orchestrator). They have been
 * removed — when those backends ship, wire the calls here directly with proper
 * retry/DLQ handling rather than reinstating the no-op pattern.
 */
export async function initializeOrganization(
  input: InitializeOrganizationInput
): Promise<InitializeOrganizationResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Organization name is required' };

  const personaMap: Record<OrganizationType, UserPersona> = {
    solo: 'solo_professional',
    agency: 'agency_team',
    venue: 'venue_brand',
  };
  const persona = personaMap[input.type];
  if (!persona) {
    return { success: false, error: `Invalid organization type "${input.type}"` };
  }

  const slug = slugify(name) || `org-${Date.now()}`;

  /*
    One call, one transaction.

    This was six writes issued in sequence with hand-written compensation
    between them, and the compensation had gone wrong: the owner's person
    entity is created with `owner_workspace_id` pointing at the new workspace,
    but the rollback after a failed `workspace_members` insert deleted only the
    org entity before trying to delete the workspace. `directory.entities`
    references workspaces with no ON DELETE, so that delete raised a foreign
    key violation -- and its result was discarded. The caller was told setup
    failed while the workspace stayed behind, owned by nobody.

    Postgres already does all-or-nothing. The RPC uses it, so there is no
    compensation left to get wrong, and it takes an advisory lock on the caller
    so a double submit returns the workspace they already have.

    Read the profile name here rather than inside the function: the RPC runs as
    its definer and should not be deciding what to call anybody.
  */
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const { data, error } = await supabase.rpc('create_workspace_with_owner', {
    p_name: name,
    p_slug: slug,
    p_organization_type: input.type,
    p_subscription_tier: input.subscriptionTier,
    p_persona: persona,
    p_owner_display_name: profile?.full_name ?? user.email ?? 'Owner',
    p_owner_email: user.email ?? '',
    p_signalpay_enabled: input.unusonicPayEnabled ?? false,
    p_pms_integration_enabled: input.pmsIntegrationEnabled ?? false,
    p_modules_enabled: getModulesForTier(input.subscriptionTier),
  });

  if (error) {
    console.error('[Onboarding] create_workspace_with_owner:', error.message);
    Sentry.captureException(error, { tags: { area: 'onboarding' } });
    return { success: false, error: error.message };
  }

  const result = data as {
    ok?: boolean;
    error?: string;
    workspace_id?: string;
    org_entity_id?: string;
    slug?: string;
    already_existed?: boolean;
  } | null;

  if (!result?.ok || !result.workspace_id) {
    return { success: false, error: result?.error ?? 'Setup failed' };
  }

  revalidatePath('/');

  // Client navigates via router.push(result.redirectPath) — server action
  // can't throw NEXT_REDIRECT here because it's awaited inside useActionState.
  return {
    success: true,
    organizationId: result.org_entity_id,
    workspaceId: result.workspace_id,
    redirectPath: '/',
    finalSlug: result.slug ?? slug,
  };
}

// Redirect path resolution removed — middleware handles all role-based routing via /.
