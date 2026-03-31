/**
 * DocuSeal Webhook Handler
 * Handles submission.completed events from DocuSeal.
 * Marks proposal as accepted, stores signed PDF path, advances deal status.
 *
 * @module app/api/docuseal-webhook/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHmac } from 'crypto';
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
   
  const db = supabase as any;

  const submitter = payload.submitters?.[0];
  const proposalId = submitter?.metadata?.proposal_id;
  const metaWorkspaceId = submitter?.metadata?.workspace_id;
  const signedDocUrl = payload.documents?.[0]?.url ?? null;
  const completedAt = submitter?.completed_at ?? new Date().toISOString();

  if (!proposalId || !metaWorkspaceId) {
    console.error('[docuseal-webhook] Missing proposal_id or workspace_id in metadata');
    return;
  }

  // Fetch proposal — verify ownership
  const { data: proposal, error: fetchErr } = await supabase
    .from('proposals')
    .select('id, workspace_id, deal_id, signed_at, status, public_token')
    .eq('id', proposalId)
    .maybeSingle();

  if (fetchErr || !proposal) {
    console.error('[docuseal-webhook] Proposal not found:', proposalId);
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
    console.error('[docuseal-webhook] workspace_id mismatch — possible forgery');
    return;
  }

  // Idempotency
  if (p.signed_at) {
    console.log('[docuseal-webhook] Already processed — skipping');
    return;
  }

  // Upload signed PDF to Supabase Storage (best-effort)
  let signedPdfPath: string | null = signedDocUrl; // fallback to DocuSeal URL
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
        } else {
          console.error('[docuseal-webhook] Storage upload failed:', uploadErr.message);
        }
      }
    } catch (e) {
      console.error('[docuseal-webhook] PDF download/upload failed:', e);
    }
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

  // Advance deal status to contract_signed (only if not already further along)
  await db
    .from('deals')
    .update({ status: 'contract_signed' })
    .eq('id', p.deal_id)
    .in('status', ['inquiry', 'proposal', 'contract_sent']); // only advance, never regress

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
  }).catch((e) => console.error('[docuseal-webhook] Client confirmation email failed:', e));

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
        }).catch((e) => console.error('[docuseal-webhook] Admin notification email failed:', e));
      }
    }
  }

  console.log('[docuseal-webhook] Submission completed for proposal:', proposalId);
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
    console.error('[docuseal-webhook] Handler threw:', e);
    // Return 500 so DocuSeal retries
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
