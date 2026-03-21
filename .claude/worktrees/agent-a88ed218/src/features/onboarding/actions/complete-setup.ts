/**
 * Signal Onboarding – Server-Side Event Orchestration (EDA)
 * initializeOrganization: Transaction + Async Triggers (Afterburner)
 * @module features/onboarding/actions/complete-setup
 */

'use server';

import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { revalidatePath } from 'next/cache';
import type { UserPersona, SubscriptionTier } from '../model/subscription-types';

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
  signalPayEnabled?: boolean;
}

export interface InitializeOrganizationResult {
  success: boolean;
  error?: string;
  organizationId?: string;
  workspaceId?: string;
  redirectPath?: string;
}

/**
 * Initialize Organization: Transaction + Async Triggers
 * 1. Create Commercial Organization
 * 2. Create Workspace (1:1)
 * 3. Add User as Owner (organization_members + workspace_members)
 * 4. Update Profile (onboarding_completed)
 * 5. Create Agent Config
 * 6. Async Triggers (Venue: triggerVectorEmbeddings, Autonomous: registerAgent)
 */
export async function initializeOrganization(
  input: InitializeOrganizationInput
): Promise<InitializeOrganizationResult> {
  // Validate user with cookie-based client (session must be present)
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
    // 1. Create Workspace first (workspaces.id needed for commercial_organizations)
    const { data: workspace, error: wsError } = await db
      .from('workspaces')
      .insert({ name, slug: `${slug}-${Math.random().toString(36).slice(2, 8)}` })
      .select('id')
      .single();

    if (wsError || !workspace) {
      return { success: false, error: wsError?.message ?? 'Failed to create workspace' };
    }

    // 2. Create Commercial Organization
    const { data: org, error: orgError } = await db
      .from('commercial_organizations')
      .insert({
        name,
        type: input.type,
        subscription_tier: input.subscriptionTier,
        pms_integration_enabled: input.pmsIntegrationEnabled ?? false,
        signalpay_enabled: input.signalPayEnabled ?? false,
        workspace_id: workspace.id,
      })
      .select('id')
      .single();

    if (orgError || !org) {
      await db.from('workspaces').delete().eq('id', workspace.id);
      return { success: false, error: orgError?.message ?? 'Failed to create organization' };
    }

    // 3. Add User as Owner (org + workspace)
    const { error: omError } = await db.from('organization_members').insert({
      user_id: user.id,
      organization_id: org.id,
      role: 'owner',
    });

    if (omError) {
      await db.from('commercial_organizations').delete().eq('id', org.id);
      await db.from('workspaces').delete().eq('id', workspace.id);
      return { success: false, error: `Organization member: ${omError.message}` };
    }

    const { error: wmError } = await db.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner',
    });

    if (wmError) {
      await db.from('organization_members').delete().eq('user_id', user.id).eq('organization_id', org.id);
      await db.from('commercial_organizations').delete().eq('id', org.id);
      await db.from('workspaces').delete().eq('id', workspace.id);
      return { success: false, error: `Workspace member: ${wmError.message}` };
    }

    // 4. Update Profile (onboarding_completed)
    const personaMap: Record<OrganizationType, UserPersona> = {
      solo: 'solo_professional',
      agency: 'agency_team',
      venue: 'venue_brand',
    };
    const persona = personaMap[input.type];

    await db.from('profiles').update({
      onboarding_completed: true,
      onboarding_step: 3,
      persona,
    }).eq('id', user.id);

    // 5. Create Agent Config (organization_id + workspace_id for backward compat)
    await db.from('agent_configs').insert({
      workspace_id: workspace.id,
      organization_id: org.id,
      persona,
      tier: input.subscriptionTier,
      xai_reasoning_enabled: true,
      agent_mode: input.subscriptionTier === 'autonomous' ? 'autonomous' : 'assist',
      modules_enabled: ['crm', 'calendar'],
    });

    revalidatePath('/');

    // 6. Async Triggers (non-blocking; fire-and-forget)
    const tier = input.subscriptionTier;
    const orgId = org.id;

    if (input.type === 'venue') {
      triggerVectorEmbeddings(orgId).catch(console.warn);
    }
    if (tier === 'autonomous') {
      registerAgent(orgId).catch(console.warn);
    }

    // Redirect path by tier
    const redirectPath = getRedirectPath(tier, input.type);
    redirect(redirectPath);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) {
      throw e;
    }
    console.error('[Onboarding] initializeOrganization:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Setup failed' };
  }
}

/** Redirect path based on tier (Event-Driven UI). */
function getRedirectPath(tier: SubscriptionTier, type: OrganizationType): string {
  if (tier === 'autonomous') return '/dashboard/agent';
  if (type === 'venue') return '/dashboard/venue';
  return '/lobby';
}

/** Afterburner: Venue → ingest floor plans. */
async function triggerVectorEmbeddings(_orgId: string): Promise<void> {
  // TODO: Server-to-Server call to ingest floor plans / venue data
}

/** Afterburner: Autonomous → spin up LangGraph. */
async function registerAgent(_orgId: string): Promise<void> {
  // TODO: Call orchestrator.registerAgent(orgId)
}
