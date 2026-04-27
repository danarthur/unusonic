/**
 * Public-facing actions for the DNS handoff flow.
 *
 * Anon-callable: the recipient (Mike Web) hits the public page with a
 * 32-byte token and no auth session. Uses the system (service-role) client
 * and reads/writes `ops.handoff_links` directly, matching the
 * crew_confirmation_tokens pattern. No SECURITY DEFINER RPCs — sidesteps
 * the feedback_postgres_function_grants.md bug class.
 *
 * Design doc: docs/reference/byo-rescue-flow-design.md
 */

'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import dns from 'dns/promises';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getResendDomainStatus, type DnsRecord } from '@/shared/api/resend/domains';

type SystemClient = ReturnType<typeof getSystemClient>;

// ── Types ─────────────────────────────────────────────────────────────────────

export type HandoffPublicView = {
  token: string;
  domain: string;
  ownerName: string;
  ownerCompany: string;
  message: string | null;
  /** ISO 8601. */
  expiresAt: string;
  /** ISO 8601. */
  confirmedAt: string | null;
  /** Snapshot of records at send-time. */
  records: DnsRecord[];
  /** True if the workspace re-ran wizard after this handoff was sent. */
  recordsMayBeStale: boolean;
};

export type GetHandoffPublicViewResult =
  | { kind: 'ok'; view: HandoffPublicView }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'not_found' };

type HandoffRow = {
  public_token: string;
  kind: string;
  recipient_kind: string;
  sender_message: string | null;
  expires_at: string;
  confirmed_at: string | null;
  revoked_at: string | null;
  sender_user_id: string;
  workspace_id: string;
  payload: { domain?: string; records?: DnsRecord[] };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidToken(token: string): boolean {
  return !!token && token.length >= 16 && token.length <= 128;
}

const PUBLIC_VIEW_COLUMNS =
  'public_token, kind, recipient_kind, sender_message, expires_at, confirmed_at, revoked_at, sender_user_id, workspace_id, payload';

async function loadHandoffRow(
  system: SystemClient,
  token: string,
): Promise<{ kind: 'ok'; row: HandoffRow } | { kind: 'not_found' }> {
  const { data, error } = await system
    .schema('ops')
    .from('handoff_links')
    .select(PUBLIC_VIEW_COLUMNS)
    .eq('public_token', token)
    .eq('kind', 'dns_helper')
    .maybeSingle();
  if (error) {
    Sentry.captureMessage('dns-handoff: db error on public lookup', {
      level: 'warning',
      extra: { error: error.message },
      tags: { area: 'byo-rescue' },
    });
    return { kind: 'not_found' };
  }
  if (!data) return { kind: 'not_found' };
  return { kind: 'ok', row: data as unknown as HandoffRow };
}

async function resolveOwnerName(system: SystemClient, userId: string): Promise<string> {
  const { data: profile } = await system
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  const fromProfile = (profile as { full_name?: string | null } | null)?.full_name?.trim();
  if (fromProfile) return fromProfile;

  try {
    const { data: userResp } = await system.auth.admin.getUserById(userId);
    const u = userResp?.user;
    const fromMeta = (u?.user_metadata?.full_name as string | undefined)?.trim();
    if (fromMeta) return fromMeta;
  } catch {
    // ignore — fall through to fallback
  }
  // Deliberately do NOT fall back to email-localpart: the email may be
  // sensitive (e.g., personal address) and the recipient is anon.
  return 'A Unusonic customer';
}

async function checkDmarc(domain: string): Promise<'configured' | 'not_configured'> {
  try {
    const txtRecords = await dns.resolveTxt(`_dmarc.${domain}`);
    const hasDmarc = txtRecords.flat().some((t) => t.startsWith('v=DMARC1'));
    return hasDmarc ? 'configured' : 'not_configured';
  } catch {
    return 'not_configured';
  }
}

async function loadWorkspaceMeta(
  system: SystemClient,
  workspaceId: string,
): Promise<{ name: string; sendingDomain: string | null }> {
  const { data } = await system
    .from('workspaces')
    .select('name, sending_domain')
    .eq('id', workspaceId)
    .maybeSingle();
  const ws = (data ?? null) as { name: string | null; sending_domain: string | null } | null;
  return {
    name: ws?.name ?? 'Unusonic workspace',
    sendingDomain: ws?.sending_domain ?? null,
  };
}

function buildPublicView(
  r: HandoffRow,
  ownerName: string,
  workspaceName: string,
  currentDomain: string | null,
): HandoffPublicView {
  const snapshotDomain = r.payload?.domain ?? '';
  const snapshotRecords = Array.isArray(r.payload?.records) ? r.payload!.records! : [];
  const normalizedCurrent = currentDomain?.trim().toLowerCase() ?? '';
  const recordsMayBeStale =
    !!snapshotDomain && !!normalizedCurrent && snapshotDomain !== normalizedCurrent;
  return {
    token: r.public_token,
    domain: snapshotDomain,
    ownerName,
    ownerCompany: workspaceName,
    message: r.sender_message,
    expiresAt: r.expires_at,
    confirmedAt: r.confirmed_at,
    records: snapshotRecords,
    recordsMayBeStale,
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Resolve a public token to a redacted handoff view. Read-only; no DNS
 * verification side effect.
 */
export async function getDnsHandoffPublicView(
  token: string,
): Promise<GetHandoffPublicViewResult> {
  if (!isValidToken(token)) return { kind: 'not_found' };

  const system = getSystemClient();
  const lookup = await loadHandoffRow(system, token);
  if (lookup.kind === 'not_found') return { kind: 'not_found' };
  const r = lookup.row;

  if (r.revoked_at) return { kind: 'revoked' };
  if (new Date(r.expires_at) < new Date()) return { kind: 'expired' };

  const [workspaceMeta, ownerName] = await Promise.all([
    loadWorkspaceMeta(system, r.workspace_id),
    resolveOwnerName(system, r.sender_user_id),
  ]);

  return {
    kind: 'ok',
    view: buildPublicView(r, ownerName, workspaceMeta.name, workspaceMeta.sendingDomain),
  };
}

export type ConfirmDnsHandoffResult =
  | {
      ok: true;
      records: DnsRecord[];
      allVerified: boolean;
      domainStatus: string;
      confirmedAt: string | null;
    }
  | { ok: false; error: string };

type ConfirmRow = {
  id: string;
  workspace_id: string;
  expires_at: string;
  revoked_at: string | null;
  confirmed_at: string | null;
};

async function loadConfirmRow(
  system: SystemClient,
  token: string,
): Promise<{ ok: true; row: ConfirmRow } | { ok: false; error: string }> {
  const { data, error } = await system
    .schema('ops')
    .from('handoff_links')
    .select('id, workspace_id, expires_at, revoked_at, confirmed_at')
    .eq('public_token', token)
    .eq('kind', 'dns_helper')
    .maybeSingle();
  if (error || !data) return { ok: false, error: 'Link not found.' };
  const row = data as unknown as ConfirmRow;
  if (row.revoked_at) return { ok: false, error: 'This link was revoked.' };
  if (new Date(row.expires_at) < new Date()) return { ok: false, error: 'This link has expired.' };
  return { ok: true, row };
}

/**
 * Already-confirmed short-circuit. Returns the cached snapshot and skips
 * Resend + workspace mutation entirely (Guardian C2).
 */
async function buildConfirmedShortCircuit(
  system: SystemClient,
  token: string,
  confirmedAt: string,
): Promise<ConfirmDnsHandoffResult> {
  const snapshot = await loadHandoffRow(system, token);
  const records = snapshot.kind === 'ok' ? snapshot.row.payload?.records ?? [] : [];
  return {
    ok: true,
    records,
    allVerified: true,
    domainStatus: 'verified',
    confirmedAt,
  };
}

/**
 * Apply the verified-state side effects: flip workspace status + DMARC, and
 * stamp `confirmed_at` on the handoff row. Returns the new confirmedAt.
 */
async function applyVerifiedTransition(
  system: SystemClient,
  row: ConfirmRow,
  domain: string,
  resendStatus: string,
): Promise<string> {
  const dmarcStatus = await checkDmarc(domain);
  await system
    .from('workspaces')
    .update({
      sending_domain_status: resendStatus,
      dmarc_status: dmarcStatus,
    })
    .eq('id', row.workspace_id);

  const nowIso = new Date().toISOString();
  await system
    .schema('ops')
    .from('handoff_links')
    .update({ confirmed_at: nowIso })
    .eq('id', row.id);
  return nowIso;
}

/**
 * Recipient-triggered DNS verification. Idempotent — safe to call multiple
 * times. When all records resolve to `verified`, sets `confirmed_at` AND
 * flips `workspaces.sending_domain_status` so the owner's wizard reflects
 * the verified state without manual refresh.
 *
 * Once a handoff is confirmed, repeated calls short-circuit with the cached
 * snapshot — recipients can refresh the page without re-spending Resend
 * rate-limit budget on the workspace's behalf, and the owner's
 * `sending_domain_status` cannot be flapped by anonymous traffic
 * (Guardian C2, PR #26).
 */
export async function confirmDnsHandoff(token: string): Promise<ConfirmDnsHandoffResult> {
  if (!isValidToken(token)) return { ok: false, error: 'Invalid link.' };

  const system = getSystemClient();
  const rowResult = await loadConfirmRow(system, token);
  if (!rowResult.ok) return rowResult;
  const r = rowResult.row;

  if (r.confirmed_at) {
    return buildConfirmedShortCircuit(system, token, r.confirmed_at);
  }

  const { data: ws } = await system
    .from('workspaces')
    .select('resend_domain_id, sending_domain')
    .eq('id', r.workspace_id)
    .maybeSingle();
  const w = ws as { resend_domain_id: string | null; sending_domain: string | null } | null;

  if (!w?.resend_domain_id || !w?.sending_domain) {
    return { ok: false, error: 'No sending domain configured.' };
  }

  const statusResult = await getResendDomainStatus(w.resend_domain_id);
  if (!statusResult.ok) {
    Sentry.captureMessage('dns-handoff: resend status fetch failed', {
      level: 'warning',
      extra: { handoffId: r.id, error: statusResult.error },
      tags: { area: 'byo-rescue' },
    });
    return { ok: false, error: 'Could not check verification status. Please try again.' };
  }

  const records = statusResult.dnsRecords;
  const allVerified =
    statusResult.status === 'verified' ||
    (records.length > 0 && records.every((rec) => rec.status === 'verified'));

  // Only mutate state on verification advance. Mid-flight statuses (pending,
  // temporary_failure) must not flap workspace status via anon traffic.
  const confirmedAt = allVerified
    ? await applyVerifiedTransition(system, r, w.sending_domain, statusResult.status)
    : r.confirmed_at;

  return {
    ok: true,
    records,
    allVerified,
    domainStatus: statusResult.status,
    confirmedAt,
  };
}
