'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type ContractForDeal = {
  status: string;
  signed_at: string | null;
  pdf_url: string | null;
};

/** One-hour signed URL is enough for a click-through from the Plan tab — the
 *  link regenerates on every page load. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** contracts.pdf_url carries one of three shapes:
 *    1. absolute URL (https://…) — DocuSeal-hosted fallback when our storage
 *       upload failed. Pass through untouched.
 *    2. storage path (workspaceId/dealId/proposals/signed-*.pdf) in the
 *       private 'documents' bucket — generate a signed URL so the link works.
 *    3. null — no contract PDF yet. */
async function resolvePdfUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raw: string | null,
): Promise<string | null> {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(raw, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    Sentry.captureMessage('getContractForEvent: createSignedUrl failed', {
      level: 'warning',
      extra: { path: raw, error: error?.message ?? null },
      tags: { module: 'crm', action: 'getContractForEvent' },
    });
    return null;
  }
  return data.signedUrl;
}

/**
 * Fetches the latest contract for an event (created at handover when proposal was accepted).
 * Workspace-scoped via contracts.workspace_id. pdf_url is resolved to an
 * accessible URL (signed for private storage paths, pass-through for absolute URLs).
 */
export async function getContractForEvent(
  eventId: string
): Promise<ContractForDeal | null> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contracts')
      .select('status, signed_at, pdf_url')
      .eq('event_id', eventId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      Sentry.captureMessage('getContractForEvent: read failed', {
        level: 'warning',
        extra: { eventId, workspaceId, code: error.code, message: error.message },
        tags: { module: 'crm', action: 'getContractForEvent' },
      });
      return null;
    }
    if (!data) return null;
    const r = data as Record<string, unknown>;
    const rawPdf = (r.pdf_url as string | null) ?? null;
    const resolvedPdf = await resolvePdfUrl(supabase, rawPdf);
    return {
      status: (r.status as string) ?? 'draft',
      signed_at: (r.signed_at as string) ?? null,
      pdf_url: resolvedPdf,
    };
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm', action: 'getContractForEvent' } });
    return null;
  }
}
