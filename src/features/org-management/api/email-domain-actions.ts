'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import dns from 'dns/promises';
import { z } from 'zod';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import {
  addResendDomain,
  getResendDomainStatus,
  deleteResendDomain,
  type DnsRecord,
} from '@/shared/api/resend/domains';
import { requireAdminOrOwner } from './auth-helpers';

// ── Constants ──────────────────────────────────────────────────────────────────

const RESERVED_DOMAINS = [
  'signallive.io',
  'signal.live',
  'unusonic.com',
  'resend.dev',
  'gmail.com',
  'outlook.com',
  'yahoo.com',
  'apple.com',
  'google.com',
];

// ── Zod schema ─────────────────────────────────────────────────────────────────

/**
 * Subdomain must have at least 2 dots (e.g. mail.example.com).
 * Apex domains (only 1 dot, e.g. example.com) are rejected.
 */
const subdomainSchema = z
  .string()
  .trim()
  .min(1, 'Domain is required.')
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?){2,}$/i,
    'Use a subdomain like mail.yourdomain.com to avoid conflicts with your existing email.'
  );

// ── addSendingDomain ───────────────────────────────────────────────────────────

export type AddSendingDomainResult =
  | { ok: true; dnsRecords: DnsRecord[] }
  | { ok: false; error: string };

/**
 * Register a custom sending domain for this workspace.
 * Validates the domain, calls Resend, and stores the result.
 */
export async function addSendingDomain(
  domain: string,
  fromName: string,
  fromLocalpart: string
): Promise<AddSendingDomainResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const authResult = await requireAdminOrOwner(workspaceId);
  if (!authResult.ok) return authResult;
  const { supabase } = authResult;

  // Validate domain shape
  const parsed = subdomainSchema.safeParse(domain);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid domain.' };
  }
  const cleanDomain = parsed.data.toLowerCase();

  // Reject reserved domains
  const isReserved = RESERVED_DOMAINS.some(
    (r) => cleanDomain === r || cleanDomain.endsWith('.' + r)
  );
  if (isReserved) {
    return { ok: false, error: 'That domain cannot be used as a sending domain.' };
  }

  // Pre-flight: reject if already configured
  const { data: ws } = await supabase
    .from('workspaces')
    .select('sending_domain')
    .eq('id', workspaceId)
    .maybeSingle();

  if (ws?.sending_domain) {
    return { ok: false, error: 'Domain already configured. Remove it first.' };
  }

  // Register with Resend
  const result = await addResendDomain(cleanDomain);
  if (!result.ok) return result;

  // Persist to workspace
  const { error: updateErr } = await supabase
    .from('workspaces')
    .update({
      sending_domain: cleanDomain,
      resend_domain_id: result.id,
      sending_domain_status: 'pending',
      sending_from_name: fromName.trim() || null,
      sending_from_localpart: fromLocalpart.trim() || 'hello',
    })
    .eq('id', workspaceId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  revalidatePath('/settings/email');
  return { ok: true, dnsRecords: result.dnsRecords };
}

// ── verifySendingDomain ────────────────────────────────────────────────────────

export type VerifySendingDomainResult =
  | { ok: true; status: string; verified: boolean; dmarcStatus: 'configured' | 'not_configured'; dnsRecords: DnsRecord[] }
  | { ok: false; error: string };

/**
 * Refresh verification status from Resend and check DMARC presence.
 */
export async function verifySendingDomain(): Promise<VerifySendingDomainResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const authResult = await requireAdminOrOwner(workspaceId);
  if (!authResult.ok) return authResult;
  const { supabase } = authResult;

  const { data: ws } = await supabase
    .from('workspaces')
    .select('resend_domain_id, sending_domain')
    .eq('id', workspaceId)
    .maybeSingle();

  if (!ws?.resend_domain_id) {
    return { ok: false, error: 'No domain registered. Add a domain first.' };
  }

  const statusResult = await getResendDomainStatus(ws.resend_domain_id);
  if (!statusResult.ok) return statusResult;

  const { status, dnsRecords } = statusResult;

  // Check DMARC separately (Resend does not provide it)
  let dmarcStatus: 'configured' | 'not_configured' = 'not_configured';
  if (ws.sending_domain) {
    try {
      const txtRecords = await dns.resolveTxt(`_dmarc.${ws.sending_domain}`);
      const hasDmarc = txtRecords.flat().some((r) => r.startsWith('v=DMARC1'));
      if (hasDmarc) dmarcStatus = 'configured';
    } catch {
      // DNS lookup failure = not configured
    }
  }

  await supabase
    .from('workspaces')
    .update({ sending_domain_status: status, dmarc_status: dmarcStatus })
    .eq('id', workspaceId);

  revalidatePath('/settings/email');
  return {
    ok: true,
    status,
    verified: status === 'verified',
    dmarcStatus,
    dnsRecords,
  };
}

// ── removeSendingDomain ────────────────────────────────────────────────────────

export type RemoveSendingDomainResult = { ok: true } | { ok: false; error: string };

/**
 * Remove the custom sending domain.
 * Nulls workspace columns first (so the workspace is safe even if Resend 404s).
 */
export async function removeSendingDomain(): Promise<RemoveSendingDomainResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const authResult = await requireAdminOrOwner(workspaceId);
  if (!authResult.ok) return authResult;
  const { supabase } = authResult;

  const { data: ws } = await supabase
    .from('workspaces')
    .select('resend_domain_id')
    .eq('id', workspaceId)
    .maybeSingle();

  const resendDomainId = ws?.resend_domain_id ?? null;

  // Null workspace columns first — workspace is safe even if Resend call fails
  await supabase
    .from('workspaces')
    .update({
      sending_domain: null,
      resend_domain_id: null,
      sending_domain_status: null,
      sending_from_name: null,
      sending_from_localpart: null,
      dmarc_status: null,
    })
    .eq('id', workspaceId);

  // Best-effort Resend cleanup — non-fatal if 404
  if (resendDomainId) {
    await deleteResendDomain(resendDomainId);
  }

  revalidatePath('/settings/email');
  return { ok: true };
}
