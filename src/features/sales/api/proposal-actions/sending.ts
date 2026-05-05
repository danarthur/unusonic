'use server';

/**
 * Proposal-sending and signature flow server actions.
 *
 * Extracted from proposal-actions.ts (Phase 0.5-style split, 2026-04-29).
 *
 * Owns the email/DocuSeal-side of the proposal lifecycle:
 *   - sendProposalLinkToRecipients — Reply-To pattern (no Gmail/OAuth) for
 *     manually emailing a proposal link via Resend.
 *   - revertProposalToDraft — admin/testing path that flips an accepted
 *     proposal back to draft (does not unwind the contract).
 *   - sendForSignature — publishes the proposal + creates a DocuSeal
 *     submission + emails the public link. Falls back to plain link if
 *     DocuSeal is not configured. Resend path covered by resendActiveProposal.
 *   - sendProposalReminder — follow-up reminder on an unsigned proposal.
 *
 * The revert + signature/reminder cluster lives here together because each
 * function reaches into the same shared scaffolding (sender resolution,
 * couple-aware subject-entity lookup, Resend message-id stamping).
 */

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { sendProposalLinkEmail } from '@/shared/api/email/send';
import type { SendProposalLinkSenderOptions } from '@/shared/api/email/send';
import { createDocuSealSubmission } from '../create-docuseal-submission';
import { getPublicProposal } from '../get-public-proposal';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

/** Base URL for public links (proposal, claim, etc.). Prefer NEXT_PUBLIC_APP_URL; on Vercel fall back to VERCEL_URL so links in emails are always absolute. Duplicated from proposal-actions.ts — both files need it and 'use server' files cannot export non-async helpers. */
function getPublicBaseUrl(): string {
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app) return app.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return '';
}

// =============================================================================
// publishProposal(proposalId): Set status to 'sent', return public_token URL
// Uses service-role so RLS cannot block (user already proved access via upsert).
// Lives here alongside sendForSignature because that's the dominant caller —
// publishing is the first step of the signature flow. The Aion publish tool
// and the Proposal Builder still import via the main file's re-export.
// =============================================================================

export interface PublishProposalResult {
  publicToken: string | null;
  publicUrl: string | null;
  error?: string;
}

export async function publishProposal(proposalId: string): Promise<PublishProposalResult> {
  const supabase = getSystemClient();
  const now = new Date().toISOString();
  const publicToken = crypto.randomUUID();

  const { data, error } = await supabase
    .from('proposals')
    .update({
      status: 'sent',
      updated_at: now,
      public_token: publicToken,
    })
    .eq('id', proposalId)
    .eq('status', 'draft')
    .select('public_token')
    .single();

  if (error || !data) {
    // Check whether the proposal exists in a non-draft state — gives the caller
    // a precise message ("already sent") instead of the ambiguous catch-all.
    const { data: existing } = await supabase
      .from('proposals')
      .select('status')
      .eq('id', proposalId)
      .maybeSingle();
    const existingStatus = (existing as { status?: string | null } | null)?.status ?? null;
    if (existingStatus && existingStatus !== 'draft') {
      return {
        publicToken: null,
        publicUrl: null,
        error: `Proposal already ${existingStatus} (cannot republish).`,
      };
    }
    return {
      publicToken: null,
      publicUrl: null,
      error: error?.message ?? 'Proposal not found.',
    };
  }

  const token = (data?.public_token as string) ?? publicToken;
  const baseUrl = getPublicBaseUrl();
  const publicUrl = baseUrl ? `${baseUrl}/p/${token}` : `/p/${token}`;

  return { publicToken: token, publicUrl };
}

// =============================================================================
// sendProposalLinkToRecipients(publicUrl, recipientEmails, dealTitle?)
// Reply-To pattern (no Gmail/OAuth): sends via Resend; reply_to is set to the
// current user's email (auth.getUser()) so replies go to their inbox. Uses
// Resend only; if RESEND_API_KEY is not set, returns
// { sent: 0, failed: N, notConfigured: true }.
// =============================================================================

export type SendProposalLinkResult = {
  sent: number;
  failed: number;
  notConfigured?: boolean;
  firstError?: string;
};

export async function sendProposalLinkToRecipients(
  publicUrl: string,
  recipientEmails: string[],
  dealTitle?: string | null
): Promise<SendProposalLinkResult> {
  const normalized = [...new Set(recipientEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length === 0) return { sent: 0, failed: 0 };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    : { data: null };
  const senderName =
    (profile as { full_name?: string | null } | null)?.full_name?.trim() ||
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    null;
  const senderReplyTo = user?.email?.trim() || null;
  const senderOptions =
    senderName || senderReplyTo
      ? { senderName: senderName ?? undefined, senderReplyTo: senderReplyTo ?? undefined }
      : undefined;

  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const to of normalized) {
    const result = await sendProposalLinkEmail(to, publicUrl, dealTitle, senderOptions);
    if (result.ok) sent++;
    else {
      failed++;
      if (!firstError) firstError = result.error;
    }
  }
  const notConfigured = sent === 0 && failed > 0 && firstError?.includes('not configured');
  return { sent, failed, ...(firstError ? { firstError } : {}), ...(notConfigured ? { notConfigured: true } : {}) };
}

// =============================================================================
// signProposal — REMOVED 2026-04-12 (Wave 3 V5 deletion).
// Reason: non-DocuSeal sign path was a pre-launch orphan that bypassed
// finance.spawn_invoices_from_proposal — clients signed but no invoices spawned.
// DocuSeal webhook (/api/docuseal-webhook) is now the canonical sign path per
// billing rebuild commit 5edf5ff. SignProposalDialog and AcceptanceBar deleted.
// Workspaces without DocuSeal show a "not yet enabled" notice in PublicProposalView.
// =============================================================================

// =============================================================================
// revertProposalToDraft(proposalId): Set status back to 'draft' (testing/admin)
// Uses server client so RLS enforces workspace access. Use to unlock a signed
// proposal for editing (e.g. test events). Contract remains signed; this only
// unlocks the proposal builder.
// =============================================================================

export type RevertProposalResult = { success: true } | { success: false; error: string };

export async function revertProposalToDraft(proposalId: string): Promise<RevertProposalResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('proposals')
    .update({
      status: 'draft',
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposalId)
    .eq('status', 'accepted')
    .select('id')
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Proposal not found or not accepted.' };
  }
  return { success: true };
}

// =============================================================================
// sendForSignature(dealId, clientEmail, clientName): Publish + DocuSeal e-sign
// Publishes the draft proposal (sets public_token + status='sent'), then creates
// a DocuSeal submission for e-signature. Stores docuseal_submission_id on the
// proposal row. Falls back gracefully if DocuSeal is not configured.
// =============================================================================

export type SendForSignatureResult =
  | { success: true; publicUrl: string; docusealFallback?: { reason: string } }
  | { success: false; error: string };

/**
 * Internal helper: re-send an already-sent proposal's link to a recipient.
 * Skips the publish + DocuSeal submission steps (those happen on first send)
 * and just re-emails the existing public link, stamps reminder_sent_at,
 * and stores the new Resend message id for delivery tracking.
 *
 * Used by sendForSignature when a draft isn't found but an active proposal
 * exists. Same shape as the main path's return so callers don't need to
 * branch on send-vs-resend.
 */
async function resendActiveProposal(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  proposalId: string;
  publicToken: string;
  workspaceId: string;
  dealId: string;
  clientEmail: string;
  clientName: string;
}): Promise<SendForSignatureResult> {
  const { supabase, proposalId, publicToken, workspaceId, dealId, clientEmail, clientName } = params;

  const base = getPublicBaseUrl();
  const publicUrl = base ? `${base}/p/${publicToken}` : `/p/${publicToken}`;

  // Resolve deal title + organization for branding parity with first send.
  const { data: dealRow } = await supabase
    .from('deals')
    .select('title, event_archetype, organization_id')
    .eq('id', dealId)
    .maybeSingle();
  const deal = dealRow as { title?: string | null; event_archetype?: string | null; organization_id?: string | null } | null;
  const eventTitle = deal?.title ?? 'Proposal';

  // Sender + workspace for the From line and email shell.
  const { data: { user } } = await supabase.auth.getUser();
  const senderEmail = user?.email ?? null;
  const [senderEntRes, workspaceRes] = await Promise.all([
    user?.id
      ? supabase.schema('directory').from('entities')
          .select('display_name')
          .eq('claimed_by_user_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('workspaces').select('name').eq('id', workspaceId).maybeSingle(),
  ]);
  const senderName = (senderEntRes.data as { display_name?: string | null } | null)?.display_name ?? null;
  const workspaceName = (workspaceRes.data as { name?: string | null } | null)?.name ?? null;

  // Couple-aware subject line uses the client entity type — same lookup as the first-send path.
  const entityTypeRes = deal?.organization_id
    ? await supabase
        .schema('directory')
        .from('entities')
        .select('type')
        .eq('id', deal.organization_id)
        .maybeSingle()
    : null;
  const rawEntityType = (entityTypeRes?.data as { type?: string | null } | null)?.type ?? null;
  const SUBJECT_ENTITY_TYPES = ['person', 'company', 'venue', 'couple'] as const;
  type SubjectEntityType = typeof SUBJECT_ENTITY_TYPES[number];
  const entityType: SubjectEntityType | null =
    rawEntityType && (SUBJECT_ENTITY_TYPES as readonly string[]).includes(rawEntityType)
      ? (rawEntityType as SubjectEntityType)
      : null;

  // Rich proposal data for the email body (event date, total, deposit, payment terms).
  const proposalData = await getPublicProposal(publicToken);
  const clientFirstName = clientName?.trim().split(/\s+/)[0] ?? null;

  const senderOptions: SendProposalLinkSenderOptions = {
    senderName,
    senderReplyTo: senderEmail,
    workspaceName,
    workspaceId,
    clientFirstName,
    eventDate: proposalData?.event.startsAt ?? null,
    total: proposalData?.total ?? null,
    depositPercent: (proposalData?.proposal as { deposit_percent?: number | null } | undefined)?.deposit_percent ?? null,
    paymentDueDays: (proposalData?.proposal as { payment_due_days?: number | null } | undefined)?.payment_due_days ?? null,
    entityType,
    eventArchetype: deal?.event_archetype ?? null,
    eventStartTime: proposalData?.event.eventStartTime ?? null,
    eventEndTime: proposalData?.event.eventEndTime ?? null,
  };

  const emailResult = await sendProposalLinkEmail(clientEmail, publicUrl, eventTitle, senderOptions);
  if (!emailResult.ok) {
    return { success: false, error: emailResult.error ?? 'Failed to send proposal email.' };
  }

  // Stamp reminder_sent_at + store the new Resend message id so the bounce/
  // delivery webhook can update the right row. Uses the system client because
  // the proposal row is owned by service_role for webhook write paths.
  const sys = getSystemClient();
  await sys
    .from('proposals')
    .update({
      reminder_sent_at: new Date().toISOString(),
      ...(emailResult.messageId ? { resend_message_id: emailResult.messageId } : {}),
    })
    .eq('id', proposalId)
    .eq('workspace_id', workspaceId);

  return { success: true, publicUrl };
}

export async function sendForSignature(
  dealId: string,
  clientEmail: string,
  clientName: string
): Promise<SendForSignatureResult> {
  const supabase = await createClient();

  // 0. Verify caller owns the deal (defence-in-depth over RLS alone)
  const workspaceMembership = await getActiveWorkspaceId();
  if (!workspaceMembership) {
    return { success: false, error: 'No active workspace.' };
  }

  // 1. Resolve the draft proposal ID for this deal — include workspace_id for ownership check
  const { data: draftRow } = await supabase
    .from('proposals')
    .select('id, workspace_id')
    .eq('deal_id', dealId)
    .eq('status', 'draft')
    .eq('workspace_id', workspaceMembership)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Resend path — when there's no draft, the proposal was already sent.
  // Find the most recent active proposal and re-email its link to the
  // (possibly corrected) recipient. The user clicks "Resend" expecting the
  // same proposal to go out again, not a new draft to be created.
  if (!draftRow?.id) {
    const { data: activeRow } = await supabase
      .from('proposals')
      .select('id, public_token')
      .eq('deal_id', dealId)
      .eq('workspace_id', workspaceMembership)
      .in('status', ['sent', 'viewed', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const activeProposal = activeRow as { id: string; public_token: string | null } | null;
    if (!activeProposal?.public_token) {
      return { success: false, error: 'No proposal found for this deal.' };
    }

    return await resendActiveProposal({
      supabase,
      proposalId: activeProposal.id,
      publicToken: activeProposal.public_token,
      workspaceId: workspaceMembership,
      dealId,
      clientEmail,
      clientName,
    });
  }

  const draftProposalId = draftRow.id;

  // 2. Publish the proposal (sets public_token, status → 'sent')
  const publishResult = await publishProposal(draftProposalId);
  if (!publishResult.publicToken || !publishResult.publicUrl) {
    return { success: false, error: publishResult.error ?? 'Failed to publish proposal.' };
  }

  const { publicToken, publicUrl } = publishResult;

  // 2b. Advance deal to the workspace's contract-out stage — only when it is
  // still in one of the pre-contract-out stages. Phase 3i: use the
  // ops.advance_deal_stage RPC with a tag-overlap guard so the guard is
  // rename-resilient AND post-collapse correct. The RPC derives status from
  // the target stage's kind via the BEFORE trigger.
  //
  // Guard tags: initial_contact OR proposal_sent — any working stage before
  // contract_out. A deal already tagged contract_out / contract_signed /
  // deposit_received / won / lost silently no-ops (RPC returns false).
  const { resolveStageByTag } = await import('@/shared/lib/pipeline-stages/resolve-stage');
  const contractOutStage = await resolveStageByTag(supabase, workspaceMembership, 'contract_out');
  if (contractOutStage) {
    await supabase
      .schema('ops')
      .rpc('advance_deal_stage', {
        p_deal_id: dealId,
        p_new_stage_id: contractOutStage.stageId,
        p_only_if_status_in: undefined,
        p_only_if_tags_any: ['initial_contact', 'proposal_sent'],
      });
  }

  // 3. Fetch deal title + workspace name for branding
  const { data: dealRow } = await supabase
    .from('deals')
    .select('title, workspace_id, event_archetype, organization_id')
    .eq('id', dealId)
    .maybeSingle();
  const deal = dealRow as { title?: string | null; workspace_id?: string | null; event_archetype?: string | null; organization_id?: string | null } | null;
  const eventTitle = deal?.title ?? 'Proposal';
  const workspaceId = deal?.workspace_id ?? '';

  // Resolve sender name (display name from directory) + workspace name for branding
  const { data: { user } } = await supabase.auth.getUser();
  const senderEmail = user?.email ?? null;
  const [senderEntRes, workspaceRes] = await Promise.all([
    user?.id
      ? supabase.schema('directory').from('entities')
          .select('display_name')
          .eq('claimed_by_user_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('workspaces').select('name').eq('id', workspaceId).maybeSingle(),
  ]);
  const senderName = (senderEntRes.data as { display_name?: string | null } | null)?.display_name ?? null;
  const workspaceName = (workspaceRes.data as { name?: string | null } | null)?.name ?? null;

  // Look up client entity type for couple-aware subject line logic
  const entityTypeRes = deal?.organization_id
    ? await supabase
        .schema('directory')
        .from('entities')
        .select('type')
        .eq('id', deal.organization_id)
        .maybeSingle()
    : null;
  const rawEntityType = (entityTypeRes?.data as { type?: string | null } | null)?.type ?? null;
  const SUBJECT_ENTITY_TYPES = ['person', 'company', 'venue', 'couple'] as const;
  type SubjectEntityType = typeof SUBJECT_ENTITY_TYPES[number];
  const entityType: SubjectEntityType | null =
    rawEntityType && (SUBJECT_ENTITY_TYPES as readonly string[]).includes(rawEntityType)
      ? (rawEntityType as SubjectEntityType)
      : null;

  const clientFirstName = clientName?.trim().split(/\s+/)[0] ?? null;

  // 4. Create DocuSeal submission
  const submission = await createDocuSealSubmission(
    draftProposalId,
    publicToken,
    clientEmail,
    clientName,
    eventTitle,
    workspaceId
  );

  // 4b. Fetch rich proposal data for email (event date, total, payment terms).
  // getPublicProposal was already called inside createDocuSealSubmission — we call it
  // again here so sendForSignature owns the data without coupling to DocuSeal internals.
  const proposalData = await getPublicProposal(publicToken);

  const senderOptions: SendProposalLinkSenderOptions = {
    senderName,
    senderReplyTo: senderEmail,
    workspaceName,
    workspaceId,
    clientFirstName,
    eventDate: proposalData?.event.startsAt ?? null,
    total: proposalData?.total ?? null,
    depositPercent: (proposalData?.proposal as { deposit_percent?: number | null } | undefined)?.deposit_percent ?? null,
    paymentDueDays: (proposalData?.proposal as { payment_due_days?: number | null } | undefined)?.payment_due_days ?? null,
    entityType,
    eventArchetype: deal?.event_archetype ?? null,
    eventStartTime: proposalData?.event.eventStartTime ?? null,
    eventEndTime: proposalData?.event.eventEndTime ?? null,
  };

  if (!submission.success) {
    // Non-fatal: DocuSeal not configured or returned an error — fall back to
    // sending a plain proposal link. Surface to Sentry so operators can see
    // when a workspace is losing the e-signature path; this was previously
    // a silent console.warn that hid DocuSeal outages.
    console.warn('[sendForSignature] DocuSeal step skipped:', submission.error);
    Sentry.captureMessage('sendForSignature: DocuSeal fallback to plain email', {
      level: 'warning',
      extra: {
        draftProposalId,
        workspaceId: workspaceMembership,
        dealId,
        reason: submission.error,
      },
      tags: { area: 'sales.docuseal' },
    });
    const fallbackResult = await sendProposalLinkEmail(clientEmail, publicUrl, eventTitle, senderOptions);
    if (fallbackResult.ok && fallbackResult.messageId) {
      const sys = getSystemClient();
      await sys
        .from('proposals')
        .update({ resend_message_id: fallbackResult.messageId })
        .eq('id', draftProposalId)
        .eq('workspace_id', workspaceMembership);
    }
    return {
      success: true,
      publicUrl,
      docusealFallback: { reason: submission.error ?? 'DocuSeal not configured' },
    };
  }

  // 5. Store docuseal_submission_id + embed_src
  const systemClient = getSystemClient();
  await systemClient
    .from('proposals')
    .update({
      docuseal_submission_id: submission.submissionId,
      docuseal_embed_src: submission.embedSrc,
    })
    .eq('id', draftProposalId)
    .eq('workspace_id', workspaceMembership);

  // 6. Send "Review and sign" email via Resend — publicUrl is the proposal page where signing happens
  const emailResult = await sendProposalLinkEmail(clientEmail, publicUrl, eventTitle, senderOptions);

  // Store Resend message ID for delivery/bounce webhook tracking
  if (emailResult.ok && emailResult.messageId) {
    await systemClient
      .from('proposals')
      .update({ resend_message_id: emailResult.messageId })
      .eq('id', draftProposalId)
      .eq('workspace_id', workspaceMembership);
  }

  // 7. Create immediate follow-up queue item so the PM sees it on the Deal tab right away
  try {
    const { createProposalSentFollowUp } = await import('@/app/(dashboard)/(features)/events/actions/follow-up-actions');
    await createProposalSentFollowUp(dealId);
  } catch { /* non-fatal */ }

  return { success: true, publicUrl };
}

// =============================================================================
// sendProposalReminder(dealId): Send a follow-up reminder for an unsigned proposal
// =============================================================================

export async function sendProposalReminder(
  dealId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth — server client RLS scopes to user's workspace automatically
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authorised' };

  // Fetch deal with latest proposal
  const { data: dealRow } = await supabase
    .from('deals')
    .select('id, workspace_id, title, main_contact_id, event_archetype, proposals(id, status, public_token, created_at)')
    .eq('id', dealId)
    .maybeSingle();

  if (!dealRow) return { ok: false, error: 'Not authorised' };

  const deal = dealRow as {
    id: string;
    workspace_id: string | null;
    title: string | null;
    main_contact_id: string | null;
    event_archetype: string | null;
    proposals: { id: string; status: string; public_token: string | null; created_at: string }[];
  };

  // Find the most recent sent/viewed proposal. Sort descending so activeProposals[0]
  // is always the latest one (guards against multiple sent proposals from resends).
  const activeProposals = (deal.proposals ?? [])
    .filter((p) => p.status === 'sent' || p.status === 'viewed')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (activeProposals.length === 0) {
    // Check if there's an already-accepted one
    const accepted = (deal.proposals ?? []).some((p) => p.status === 'accepted');
    if (accepted) return { ok: false, error: 'Proposal already signed' };
    return { ok: false, error: 'No active proposal to remind' };
  }

  const proposal = activeProposals[0];
  const publicToken = (proposal as { public_token?: string | null }).public_token;
  if (!publicToken) return { ok: false, error: 'Proposal has no public link' };

  const base = getPublicBaseUrl();
  const proposalUrl = base ? `${base}/p/${publicToken}` : `/p/${publicToken}`;

  // Resolve client email from main_contact_id → directory.entities.attributes
  let clientEmail: string | null = null;
  let clientFirstName: string | null = null;
  let clientEntityType: string | null = null;
  if (deal.main_contact_id) {
    const { data: entityRow } = await supabase
      .schema('directory')
      .from('entities')
      .select('type, attributes, display_name')
      .eq('id', deal.main_contact_id)
      .maybeSingle();
    if (entityRow) {
      const rawAttributes = (entityRow as { attributes?: Record<string, unknown> | null }).attributes ?? {};
      const entityType = (entityRow as { type?: string }).type ?? 'person';
      clientEntityType = entityType;
      if (entityType === 'company') {
        const companyAttrs = readEntityAttrs(rawAttributes, 'company');
        clientEmail = companyAttrs.support_email ?? companyAttrs.billing_email ?? null;
      } else if (entityType === 'couple') {
        const coupleAttrs = readEntityAttrs(rawAttributes, 'couple');
        clientEmail = coupleAttrs.partner_a_email ?? coupleAttrs.partner_b_email ?? null;
      } else {
        const personAttrs = readEntityAttrs(rawAttributes, 'person');
        clientEmail = personAttrs.email ?? null;
      }
      // display_name is a proper column, not an attributes JSONB field — no ESLint violation
      const displayName = (entityRow as { display_name?: string | null }).display_name ?? null;
      clientFirstName = displayName?.split(' ')[0] ?? null;
    }
  }

  if (!clientEmail?.trim()) {
    return { ok: false, error: 'No email address on file for this client' };
  }

  // Stamp reminder_sent_at
  await supabase
    .from('proposals')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', proposal.id);

  // Resolve sender name from directory entity (same source as sendForSignature)
  const { data: senderEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('display_name')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();
  const senderName = (senderEntity as { display_name?: string | null } | null)?.display_name ?? null;

  // Fetch rich proposal data for reminder enrichment (status is 'sent' or 'viewed' — both valid)
  const proposalData = publicToken
    ? await getPublicProposal(publicToken).catch((err: unknown) => {
        Sentry.captureMessage('sendProposalReminder: getPublicProposal failed', {
          level: 'warning',
          extra: {
            dealId,
            publicToken,
            error: err instanceof Error ? err.message : String(err),
          },
          tags: { area: 'sales.docuseal' },
        });
        return null;
      })
    : null;

  const { sendProposalReminderEmail } = await import('@/shared/api/email/send');
  const emailResult = await sendProposalReminderEmail({
    to: clientEmail.trim(),
    proposalUrl,
    eventTitle: deal.title ?? 'your event',
    workspaceId: deal.workspace_id ?? '',
    senderName,
    clientFirstName,
    eventDate: proposalData?.event?.startsAt ?? null,
    proposalTotal: proposalData?.total ?? null,
    entityType: clientEntityType,
    eventArchetype: deal.event_archetype ?? null,
  });

  if (!emailResult.ok) return { ok: false, error: emailResult.error };

  // Store Resend message ID for delivery/bounce webhook tracking
  if (emailResult.messageId) {
    await supabase
      .from('proposals')
      .update({ resend_message_id: emailResult.messageId } as Record<string, unknown>)
      .eq('id', proposal.id);
  }

  return { ok: true };
}
