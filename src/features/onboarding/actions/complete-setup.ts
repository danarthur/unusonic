/**
 * Unusonic Onboarding – Server-Side Event Orchestration (EDA)
 * initializeOrganization: Transaction + Async Triggers (Afterburner)
 * Creates workspace + directory.entities org + cortex ROSTER_MEMBER edge.
 * @module features/onboarding/actions/complete-setup
 */

'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
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
 * Initialize Organization: Transaction
 * 1. Create Workspace (with subscription_tier + signalpay_enabled)
 * 2. Create directory.entities company (handle = slug)
 * 3. Create person entity (if missing) + ROSTER_MEMBER edge
 * 4. Add User as Owner (workspace_members)
 * 5. Update Profile (onboarding_completed)
 * 6. Create Agent Config
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

  const slug = slugify(name) || `org-${Date.now()}`;

  // Use service-role client for writes so onboarding succeeds even when
  // the session JWT is not forwarded to Postgres (Server Action cookie context).
  const db = getSystemClient();

  try {
    // 1. Create Workspace (canonical source for subscription tier + billing flags)
    // Try the clean slug first; only append a random suffix on collision
    let finalSlug = slug;
    const { count } = await db
      .from('workspaces')
      .select('id', { count: 'exact', head: true })
      .eq('slug', slug);
    if (count && count > 0) {
      finalSlug = `${slug}-${Math.random().toString(36).slice(2, 8)}`;
    }

    const { data: workspace, error: wsError } = await db
      .from('workspaces')
      .insert({
        name,
        slug: finalSlug,
        subscription_tier: input.subscriptionTier,
        signalpay_enabled: input.unusonicPayEnabled ?? false,
      })
      .select('id')
      .single();

    if (wsError || !workspace) {
      return { success: false, error: wsError?.message ?? 'Failed to create workspace' };
    }

    // 2. Create directory.entities company (replaces commercial_organizations)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- directory schema not in generated types for service-role client
    const dirDb = db.schema('directory');
    const { data: orgEntity, error: orgError } = await dirDb
      .from('entities')
      .insert({
        display_name: name,
        handle: finalSlug,
        type: 'company',
        owner_workspace_id: workspace.id,
        attributes: {
          is_ghost: false,
          is_claimed: true,
          organization_type: input.type,
          pms_integration_enabled: input.pmsIntegrationEnabled ?? false,
        },
      })
      .select('id')
      .single();

    if (orgError || !orgEntity) {
      await db.from('workspaces').delete().eq('id', workspace.id);
      return { success: false, error: orgError?.message ?? 'Failed to create organization' };
    }

    // 3. Get or create person entity for the user + ROSTER_MEMBER edge
    const { data: existingPerson } = await dirDb
      .from('entities')
      .select('id')
      .eq('claimed_by_user_id', user.id)
      .eq('type', 'person')
      .maybeSingle();

    let personId = (existingPerson as { id: string } | null)?.id ?? null;
    if (!personId) {
      const { data: profile } = await db
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      const { data: newPerson, error: personErr } = await dirDb
        .from('entities')
        .insert({
          display_name: (profile as { full_name?: string | null } | null)?.full_name ?? user.email ?? 'Owner',
          type: 'person',
          claimed_by_user_id: user.id,
          owner_workspace_id: workspace.id,
          attributes: { email: user.email ?? '', is_ghost: false },
        })
        .select('id')
        .single();

      if (personErr || !newPerson) {
        await dirDb.from('entities').delete().eq('id', (orgEntity as { id: string }).id);
        await db.from('workspaces').delete().eq('id', workspace.id);
        return { success: false, error: personErr?.message ?? 'Failed to create person entity' };
      }
      personId = (newPerson as { id: string }).id;
    }

    const orgId = (orgEntity as { id: string }).id;

    // Create ROSTER_MEMBER edge (person → org) via RPC
    const { error: relError } = await db.rpc('upsert_relationship', {
      p_source_entity_id: personId,
      p_target_entity_id: orgId,
      p_type: 'ROSTER_MEMBER',
      p_context_data: { role: 'owner', employment_status: 'internal_employee' },
    });

    if (relError) {
      console.warn('[Onboarding] ROSTER_MEMBER edge failed (non-fatal):', relError.message);
      Sentry.captureMessage('Onboarding ROSTER_MEMBER edge failed', {
        level: 'warning',
        extra: { userId: user.id, orgId, workspaceId: workspace.id, error: relError.message },
      });
      // Non-fatal — workspace_members is the primary membership. Edge is for graph queries.
    }

    // 4. Add User as Owner (workspace_members — primary membership table)
    const { error: wmError } = await db.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner',
    });

    if (wmError) {
      await dirDb.from('entities').delete().eq('id', orgId);
      await db.from('workspaces').delete().eq('id', workspace.id);
      return { success: false, error: `Workspace member: ${wmError.message}` };
    }

    // 5. Update Profile (onboarding_completed)
    const personaMap: Record<OrganizationType, UserPersona> = {
      solo: 'solo_professional',
      agency: 'agency_team',
      venue: 'venue_brand',
    };
    const persona = personaMap[input.type];
    if (!persona) {
      // Defensive: callers must pass a valid OrganizationType. Roll back rather than
      // upsert an undefined persona that would break agent_configs + role routing.
      await dirDb.from('entities').delete().eq('id', orgId);
      await db.from('workspace_members').delete().eq('workspace_id', workspace.id).eq('user_id', user.id);
      await db.from('workspaces').delete().eq('id', workspace.id);
      return { success: false, error: `Invalid organization type "${input.type}"` };
    }

    await db.from('profiles').update({
      onboarding_completed: true,
      onboarding_step: 3,
      persona,
    }).eq('id', user.id);

    // 6. Create Agent Config (workspace_id only — no legacy organization_id)
    await db.from('agent_configs').insert({
      workspace_id: workspace.id,
      persona,
      tier: input.subscriptionTier,
      xai_reasoning_enabled: true,
      agent_mode: input.subscriptionTier === 'studio' ? 'autonomous' : 'assist',
      modules_enabled: getModulesForTier(input.subscriptionTier),
    });

    revalidatePath('/');

    // Client navigates via router.push(result.redirectPath) — server action
    // can't throw NEXT_REDIRECT here because it's awaited inside useActionState.
    return {
      success: true,
      organizationId: orgId,
      workspaceId: workspace.id,
      redirectPath: '/',
      finalSlug,
    };
  } catch (e) {
    console.error('[Onboarding] initializeOrganization:', e);
    Sentry.captureException(e, { tags: { area: 'onboarding' } });
    return { success: false, error: e instanceof Error ? e.message : 'Setup failed' };
  }
}

// Redirect path resolution removed — middleware handles all role-based routing via /.
