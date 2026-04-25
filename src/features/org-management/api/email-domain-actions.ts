'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import dns from 'dns/promises';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import {
  addResendDomain,
  getResendDomainStatus,
  deleteResendDomain,
  type DnsRecord,
} from '@/shared/api/resend/domains';

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

// ── Auth helper ────────────────────────────────────────────────────────────────

async function requireAdminOrOwner(workspaceId: string): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    return { ok: false, error: 'Unauthorized. Owner or admin role required.' };
  }

  return { ok: true, supabase };
}

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

// ── preflightSendingDomain ─────────────────────────────────────────────────────

export type PreflightFinding = {
  /** Severity surface — info is reassuring, warning is actionable. */
  severity: 'info' | 'warning';
  /** Stable machine-readable code for analytics + telemetry. */
  code:
    | 'parent-mx-detected'
    | 'parent-spf-detected'
    | 'parent-dmarc-strict'
    | 'subdomain-already-receives-mail'
    | 'parent-not-resolvable';
  /** Human-readable message for the wizard UI. */
  message: string;
};

export type PreflightSendingDomainResult =
  | { ok: true; findings: PreflightFinding[] }
  | { ok: false; error: string };

/**
 * Check the user's existing DNS BEFORE they commit to adding our records.
 *
 * Closes Marcus's #1 fear from the User Advocate research run on 2026-04-25:
 *   "If your wizard tells me to add records that BREAK my existing email,
 *    the pilot is over... ARE YOU GOING TO DELETE MY MX RECORDS?"
 *
 * This action runs on the domain-input blur in the wizard. It looks at the
 * PARENT domain (the user enters `mail.invisibletouchevents.com`, we query
 * `invisibletouchevents.com`) for existing email infrastructure that our
 * subdomain-only setup will NOT touch — and surfaces the affirmation.
 *
 * Findings are non-blocking. We never reject a domain based on preflight
 * results; we surface them so the user can decide.
 *
 * Why parent (not the subdomain itself): the user enters a SUBDOMAIN we'll
 * own (`mail.<theirdomain>`). The subdomain is empty by design. The parent
 * is where their existing email lives. Reassuring them about the parent is
 * the whole point.
 *
 * @module features/org-management/api/email-domain-actions
 */
export async function preflightSendingDomain(
  domain: string,
): Promise<PreflightSendingDomainResult> {
  // Allow unauthenticated callers — the preflight is read-only DNS lookups
  // and doesn't reveal anything not already public via `dig`. This makes the
  // wizard work on first input even before the workspace context loads.

  const parsed = subdomainSchema.safeParse(domain);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid domain.' };
  }
  const cleanDomain = parsed.data.toLowerCase();

  // Compute parent domain by stripping the leftmost label.
  const parts = cleanDomain.split('.');
  if (parts.length < 3) {
    // Schema already enforces ≥2 dots, but defence in depth.
    return { ok: false, error: 'Invalid subdomain.' };
  }
  const parentDomain = parts.slice(1).join('.');

  const findings: PreflightFinding[] = [];

  // Check the SUBDOMAIN itself — should be empty. If anything resolves there,
  // the user will be surprised when our records appear.
  try {
    const subMx = await dns.resolveMx(cleanDomain);
    if (subMx.length > 0) {
      findings.push({
        severity: 'warning',
        code: 'subdomain-already-receives-mail',
        message: `${cleanDomain} already has MX records — adding our records may conflict. Pick a different subdomain or remove the existing MX.`,
      });
    }
  } catch {
    // ENOTFOUND / NODATA — subdomain is empty, which is what we want.
  }

  // Check the PARENT for an existing MX (Google Workspace / Microsoft 365 /
  // self-hosted). Reassure: our records DON'T touch their inbox.
  try {
    const parentMx = await dns.resolveMx(parentDomain);
    if (parentMx.length > 0) {
      const exchanges = parentMx.map((r) => r.exchange).join(', ');
      findings.push({
        severity: 'info',
        code: 'parent-mx-detected',
        message: `Your existing email at ${parentDomain} (via ${exchanges}) keeps working. We add records on the ${parts[0]} subdomain only — your inbox is untouched.`,
      });
    }
  } catch {
    // No MX on the parent — uncommon but possible (parked domain). No info needed.
  }

  // Check parent SPF — SPF has a 10-include limit and only ONE TXT may be a
  // v=spf1 record per RFC. We don't add to it (we use subdomain), but we
  // surface the existing setup so the user knows we're not going to clobber it.
  try {
    const parentTxt = await dns.resolveTxt(parentDomain);
    const flat = parentTxt.flat();
    if (flat.some((r) => r.startsWith('v=spf1'))) {
      findings.push({
        severity: 'info',
        code: 'parent-spf-detected',
        message: `Your existing SPF on ${parentDomain} keeps working. We use a separate SPF on ${parts[0]}.${parentDomain}, so our setup won't conflict with the 10-include limit.`,
      });
    }
  } catch {
    // No TXT on the parent — fine.
  }

  // Check parent DMARC — if they enforce p=reject, our subdomain inherits via
  // the `sp=` directive. Warn so they know our subdomain mail might get
  // quarantined until verification completes.
  try {
    const parentDmarcTxt = await dns.resolveTxt(`_dmarc.${parentDomain}`);
    const dmarcRecord = parentDmarcTxt.flat().find((r) => r.startsWith('v=DMARC1'));
    if (dmarcRecord) {
      const policyMatch = dmarcRecord.match(/(?:^|;)\s*p\s*=\s*(none|quarantine|reject)/i);
      const subPolicyMatch = dmarcRecord.match(/(?:^|;)\s*sp\s*=\s*(none|quarantine|reject)/i);
      const policy = (subPolicyMatch?.[1] ?? policyMatch?.[1] ?? '').toLowerCase();
      if (policy === 'reject' || policy === 'quarantine') {
        findings.push({
          severity: 'warning',
          code: 'parent-dmarc-strict',
          message: `Your domain enforces DMARC ${policy === 'reject' ? 'p=reject' : 'p=quarantine'}. Until DKIM verifies on the new subdomain, mail we send may be filtered. Plan to send a test before high-stakes proposals.`,
        });
      }
    }
  } catch {
    // No parent DMARC — fine, no inheritance concerns.
  }

  // Final fallback — if nothing resolves on the parent, the domain may not
  // be live or we may be looking at a typo. Surface gently.
  if (findings.length === 0) {
    try {
      await dns.resolve(parentDomain);
      // Parent resolves but no email infra detected — common for new domains.
    } catch {
      findings.push({
        severity: 'warning',
        code: 'parent-not-resolvable',
        message: `${parentDomain} doesn't resolve in DNS yet. Double-check the spelling, or wait for the domain to propagate before adding records.`,
      });
    }
  }

  return { ok: true, findings };
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
