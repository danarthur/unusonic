/**
 * Create a Stripe Customer Portal session for subscription self-service.
 * @module app/api/stripe/create-portal-session/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { getStripe } from '@/shared/api/stripe/server';

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const { workspaceId } = (await req.json()) as { workspaceId?: string };
  if (!workspaceId) {
    return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
  }

  // Verify caller is a workspace admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Get workspace's Stripe customer ID
  const { data: workspace } = await (supabase as any)
    .from('workspaces')
    .select('stripe_customer_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (!workspace?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer linked to this workspace' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const session = await stripe.billingPortal.sessions.create({
    customer: workspace.stripe_customer_id,
    return_url: `${baseUrl}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
