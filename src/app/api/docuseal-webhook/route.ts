/**
 * DocuSeal Webhook Handler
 * Handles submission.completed events from DocuSeal.
 * Marks proposal as accepted, stores signed PDF path, advances deal status.
 *
 * @module app/api/docuseal-webhook/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHmac } from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { getSystemClient } from '@/shared/api/supabase/system';
import { revalidatePath } from 'next/cache';
import { sendProposalAcceptedEmail, sendProposalSignedNotificationEmail } from '@/shared/api/email/send';
import { getPublicProposal } from '@/features/sales/api/get-public-proposal';
import { formatCurrency } from '@/shared/lib/format-currency';

export const runtime = 'nodejs';

// ── Webhook payload types ──────────────────────────────────────────────────────

type DocuSealSubmitter = {
  id: number;
  email: string;
  name?: string | null;
  status: string;
  completed_at: string | null;
  metadata: Record<string, string>;
};

type DocuSealDocument = {
  name: string;
  url: string;
};

type DocuSealSubmission = {
  id: number;
  status: string;
  submitters: DocuSealSubmitter[];
  documents: DocuSealDocument[];
};

type DocuSealWebhookPayload = {
  event_type: string;
  timestamp: string;
  data: DocuSealSubmission;
};

// ── Signature verification ─────────────────────────────────────────────────────

function verifyWebhookSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET;
  if (!secret) return false;

  // Option A: shared secret header (DocuSeal dashboard → custom header)
  const headerSecret = headers.get('x-docuseal-secret');
  if (headerSecret) {
    try {
      return timingSafeEqual(
        Buffer.from(headerSecret),
        Buffer.from(secret)
      );
    } catch {
      return false;
    }
  }

  // Option B: HMAC-SHA256 (if DocuSeal provides a signing secret)
  const hmacHeader = headers.get('x-docuseal-signature');
  if (hmacHeader) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  return false;
}

// ── Submission completed handler ───────────────────────────────────────────────

async function handleSubmissionCompleted(payload: DocuSealSubmission): Promise<void> {
  const supabase = getSystemClient();
   
  const db = supabase;

  const submitter = payload.submitters?.[0];
  const proposalId = submitter?.metadata?.proposal_id;
  const metaWorkspaceId = submitter?.metadata?.workspace_id;
  const signedDocUrl = payload.documents?.[0]?.url ?? null;
  const completedAt = submitter?.completed_at ?? new Date().toISOString();

  if (!proposalId || !metaWorkspaceId) {
    Sentry.logger.error('docuseal.webhook.missingMetadata', {
      submissionId: payload.id,
      hasProposalId: !!proposalId,
      hasWorkspaceId: !!metaWorkspaceId,
    });
    return;
  }

  // Fetch proposal — verify ownership
  const { data: proposal, error: fetchErr } = await supabase
    .from('proposals')
    .select('id, workspace_id, deal_id, signed_at, status, public_token')
    .eq('id', proposalId)
    .maybeSingle();

  if (fetchErr || !proposal) {
    Sentry.logger.error('docuseal.webhook.proposalNotFound', {
      proposalId,
      error: fetchErr?.message ?? null,
      submissionId: payload.id,
    });
    return;
  }

  const p = proposal as {
    id: string;
    workspace_id: string;
    deal_id: string;
    signed_at: string | null;
    status: string;
    public_token: string | null;
  };

  // Cross-workspace protection
  if (p.workspace_id !== metaWorkspaceId) {
    // This is a potential forgery attempt — log prominently.
    Sentry.logger.error('docuseal.webhook.workspaceMismatch', {
      proposalId,
      proposalWorkspaceId: p.workspace_id,
      metadataWorkspaceId: metaWorkspaceId,
      submissionId: payload.id,
    });
    return;
  }

  // Idempotency
  if (p.signed_at) {
    console.log('[docuseal-webhook] Already processed — skipping');
    return;
  }

  // Upload signed PDF to Supabase Storage (best-effort).
  // SECURITY NOTE: on upload failure we currently persist `signedDocUrl` (a raw
  // docuseal.com URL) as `signed_pdf_path`. That URL is externally reachable and
  // the PDF contains signed contract content — so every failure here is a
  // compliance-sensitive event. Escalate to Sentry at logger.error so the team
  // can investigate storage health and retry manually.
  let signedPdfPath: string | null = signedDocUrl; // fallback to DocuSeal URL
  let storageUploadSucceeded = false;
  if (signedDocUrl) {
    try {
      // Validate DocuSeal domain before fetching (SSRF guard)
      const docUrl = new URL(signedDocUrl);
      if (!docUrl.hostname.endsWith('docuseal.com') && !docUrl.hostname.endsWith('docuseal.co')) {
        throw new Error(`Unexpected PDF host: ${docUrl.hostname}`);
      }
      const pdfResponse = await fetch(signedDocUrl);
      if (pdfResponse.ok) {
        const pdfBuffer = await pdfResponse.arrayBuffer();
        const storagePath = `${p.workspace_id}/${p.deal_id}/proposals/signed-${Date.now()}.pdf`;
        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
        if (!uploadErr) {
          signedPdfPath = storagePath;
          storageUploadSucceeded = true;
        } else {
          Sentry.logger.error('docuseal.webhook.storageUploadFailed', {
            proposalId,
            workspaceId: p.workspace_id,
            dealId: p.deal_id,
            storagePath,
            error: uploadErr.message,
            fallback: 'persisting raw docuseal.com URL as signed_pdf_path',
          });
        }
      } else {
        Sentry.logger.error('docuseal.webhook.pdfDownloadFailed', {
          proposalId,
          status: pdfResponse.status,
          fallback: 'persisting raw docuseal.com URL',
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      Sentry.logger.error('docuseal.webhook.pdfFetchThrew', {
        proposalId,
        workspaceId: p.workspace_id,
        error: message,
        fallback: 'persisting raw docuseal.com URL',
      });
    }
  }
  if (!storageUploadSucceeded && signedDocUrl) {
    Sentry.logger.warn('docuseal.webhook.usingRawDocusealUrlFallback', {
      proposalId,
      workspaceId: p.workspace_id,
    });
  }

  // Update proposal
  await supabase
    .from('proposals')
    .update({
      status: 'accepted',
      signed_at: completedAt,
      signed_pdf_path: signedPdfPath,
    })
    .eq('id', proposalId);

  // Advance deal status to the workspace's contract_signed stage. Phase 3d:
  // resolve via tag instead of writing a literal slug so renamed stages still
  // auto-advance. Failure must not throw out of the handler (DocuSeal retries
  // would pile up).
  await advanceDealFromDocuSealWebhook({
    supabase: db,
    dealId: p.deal_id,
    submissionId: payload.id,
  });

  // Spawn draft invoices from the accepted proposal (PR-CLIENT-1).
  // Idempotent: returns existing invoices if already spawned for this proposal.
  // Non-blocking: failure here should not prevent the rest of the webhook from completing.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types; PR-INFRA-2 fixes this
    await supabase.schema('finance').rpc('spawn_invoices_from_proposal', {
      p_proposal_id: proposalId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    Sentry.logger.error('docuseal.webhook.spawnInvoicesFailed', {
      proposalId,
      workspaceId: p.workspace_id,
      dealId: p.deal_id,
      error: message,
    });
  }

  // Revalidate public proposal page
  if (p.public_token) {
    revalidatePath(`/p/${p.public_token}`);
  }

  // Fetch rich proposal data for enriched emails
  // Called after the update so getPublicProposal's status check passes for 'accepted'
  const proposalData = p.public_token
    ? await getPublicProposal(p.public_token).catch(() => null)
    : null;

  const enrichedTotal = proposalData?.total ?? null;
  const totalFormatted = enrichedTotal && enrichedTotal > 0 ? formatCurrency(enrichedTotal) : null;
  const depositPercent = (proposalData?.proposal as { deposit_percent?: number | null } | undefined)?.deposit_percent ?? null;
  const depositDueDays = (proposalData?.proposal as { payment_due_days?: number | null } | undefined)?.payment_due_days ?? null;
  const depositAmount = enrichedTotal && depositPercent && depositPercent > 0
    ? formatCurrency((enrichedTotal * depositPercent) / 100)
    : null;
  const eventDate = proposalData?.event?.startsAt ?? null;
  const signerEmail = submitter.email ?? null;

  // Resolve workspace name + admin email for notifications
  const { data: workspaceRow } = await supabase
    .from('workspaces')
    .select('name, sending_domain, sending_domain_status, sending_from_name, sending_from_localpart')
    .eq('id', p.workspace_id)
    .maybeSingle();
  const workspaceName = (workspaceRow as { name?: string | null } | null)?.name ?? null;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
  const portalUrl = p.public_token ? `${baseUrl}/p/${p.public_token}` : baseUrl;
  const crmUrl = p.deal_id ? `${baseUrl}/crm/deals/${p.deal_id}` : `${baseUrl}/crm`;

  const signerName = submitter.name?.trim() || submitter.email;

  // Fetch deal title for notification emails
  const { data: dealRow } = await supabase
    .from('deals')
    .select('title')
    .eq('id', p.deal_id)
    .maybeSingle();
  const resolvedDealTitle = (dealRow as { title?: string | null } | null)?.title ?? 'your event';

  // Send client confirmation email (best-effort — non-fatal)
  await sendProposalAcceptedEmail({
    to: submitter.email,
    signerName,
    dealTitle: resolvedDealTitle,
    signedAt: completedAt,
    portalUrl,
    workspaceName,
    workspaceId: p.workspace_id,
    eventDate,
    totalFormatted,
    depositAmount,
    depositDueDays,
  }).catch((e) => {
    const message = e instanceof Error ? e.message : String(e);
    Sentry.logger.error('docuseal.webhook.clientConfirmationEmailFailed', {
      proposalId,
      workspaceId: p.workspace_id,
      recipient: submitter.email,
      error: message,
    });
  });

  // Send internal notification to workspace admin (best-effort — look up admin email)
  const { data: adminRows } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', p.workspace_id)
    .eq('role', 'admin')
    .limit(3);

  if (adminRows?.length) {
    const adminUserIds = adminRows.map((r: { user_id: string }) => r.user_id);
    // Primary: profiles.email (auth email, always set)
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', adminUserIds);

    for (const profile of adminProfiles ?? []) {
      const adminEmail = (profile as { email?: string | null }).email ?? null;
      if (adminEmail) {
        await sendProposalSignedNotificationEmail({
          to: adminEmail,
          signerName,
          dealTitle: resolvedDealTitle,
          signedAt: completedAt,
          crmUrl,
          workspaceName,
          workspaceId: p.workspace_id,
          totalFormatted,
          signerEmail,
          eventDate,
        }).catch((e) => {
          const message = e instanceof Error ? e.message : String(e);
          Sentry.logger.error('docuseal.webhook.adminNotificationEmailFailed', {
            proposalId,
            workspaceId: p.workspace_id,
            recipient: adminEmail,
            error: message,
          });
        });
      }
    }
  }

  console.log('[docuseal-webhook] Submission completed for proposal:', proposalId);
}

// ── Phase 3d: tag-based stage advance ──────────────────────────────────────────
// Resolves the workspace's contract_signed stage via tag and advances the deal
// through the ops.advance_deal_stage_from_webhook RPC (which stamps webhook
// metadata on the generated deal_transitions row). Failures log and return —
// the webhook must always ack so DocuSeal doesn't retry indefinitely.

async function advanceDealFromDocuSealWebhook(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST types
  supabase: any;
  dealId: string;
  submissionId: number;
}): Promise<void> {
  const { supabase, dealId, submissionId } = args;

  const { data: deal, error: fetchErr } = await supabase
    .from('deals')
    .select('id, pipeline_id')
    .eq('id', dealId)
    .maybeSingle();

  if (fetchErr || !deal) {
    Sentry.logger.warn('docuseal.webhook.dealLookupFailed', {
      dealId,
      error: fetchErr?.message ?? 'deal not found',
    });
    return;
  }

  const pipelineId = (deal as { pipeline_id: string | null }).pipeline_id;
  if (!pipelineId) {
    Sentry.logger.warn('docuseal.webhook.dealMissingPipelineId', { dealId });
    return;
  }

  const { data: resolvedStageId, error: resolveErr } = await supabase
    .schema('ops')
    .rpc('resolve_stage_by_tag', {
      p_pipeline_id: pipelineId,
      p_tag: 'contract_signed',
    });

  if (resolveErr) {
    Sentry.logger.warn('docuseal.webhook.stageResolveFailed', {
      dealId,
      pipelineId,
      tag: 'contract_signed',
      error: resolveErr.message,
    });
    return;
  }

  if (!resolvedStageId) {
    // Workspace removed the contract_signed tag from every stage — opted out.
    Sentry.logger.info('docuseal.webhook.stageTagNotPresent', {
      dealId,
      pipelineId,
      tag: 'contract_signed',
      action: 'skipped auto-advance; workspace opted out',
    });
    return;
  }

  const { data: stageRow, error: stageFetchErr } = await supabase
    .schema('ops')
    .from('pipeline_stages')
    .select('slug')
    .eq('id', resolvedStageId)
    .maybeSingle();

  if (stageFetchErr || !stageRow) {
    Sentry.logger.warn('docuseal.webhook.stageSlugFetchFailed', {
      dealId,
      resolvedStageId,
      error: stageFetchErr?.message ?? 'stage row not found',
    });
    return;
  }

  const stageSlug = (stageRow as { slug: string }).slug;

  // DocuSeal doesn't give us a stable event_id like Stripe — submission.id is
  // the closest-to-unique correlator per the webhook payload.
  const webhookEventId = `docuseal_submission_${submissionId}`;

  // Phase 3h: switch from literal slug list to tag-overlap guard so workspaces
  // that rename their stages still auto-advance correctly. The pre-states for
  // contract_signed are any working stage before it: initial_contact,
  // proposal_sent, contract_out. Legacy slug guard set to NULL.
  const { data: advanced, error: advanceErr } = await supabase
    .schema('ops')
    .rpc('advance_deal_stage_from_webhook', {
      p_deal_id: dealId,
      p_new_stage_id: resolvedStageId,
      p_new_status_slug: stageSlug,
      p_webhook_source: 'docuseal',
      p_webhook_event_id: webhookEventId,
      p_only_if_status_in: null,
      p_only_if_tags_any: ['initial_contact', 'proposal_sent', 'contract_out'],
    });

  if (advanceErr) {
    Sentry.logger.warn('docuseal.webhook.dealStatusUpdateFailed', {
      dealId,
      pipelineId,
      resolvedStageId,
      error: advanceErr.message,
    });
    return;
  }

  if (advanced !== true) {
    Sentry.logger.info('docuseal.webhook.dealAlreadyAdvanced', {
      dealId,
      pipelineId,
      resolvedStageId,
    });
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  if (!verifyWebhookSignature(rawBody, req.headers)) {
    // 401 (not 400) so DocuSeal retries on key rotation, 400 = permanent failure
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: DocuSealWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as DocuSealWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload.event_type !== 'submission.completed') {
    // Acknowledge other event types silently
    return NextResponse.json({ received: true });
  }

  if (payload.data?.status !== 'completed') {
    return NextResponse.json({ received: true });
  }

  try {
    await handleSubmissionCompleted(payload.data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    Sentry.logger.error('docuseal.webhook.handlerThrew', {
      submissionId: payload.data?.id,
      error: message,
    });
    // Capture the full exception too so we get a stack trace.
    Sentry.captureException(e);
    // Return 500 so DocuSeal retries
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
