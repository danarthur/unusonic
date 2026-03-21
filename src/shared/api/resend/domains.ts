/**
 * Resend Domain Management — server utility (not a server action).
 * Wraps the Resend SDK for domain add / status / delete operations.
 * Import only from server-side files (server actions, API routes).
 */

import 'server-only';
import { Resend } from 'resend';

// ── Types ──────────────────────────────────────────────────────────────────────

export type DnsRecord = {
  record: 'SPF' | 'DKIM' | 'MX' | 'DMARC';
  name: string;
  type: 'TXT' | 'MX' | 'CNAME';
  value: string;
  ttl: string;
  status: 'not_started' | 'verified' | 'failure';
  priority?: number;
};

export type AddDomainResult =
  | { ok: true; id: string; dnsRecords: DnsRecord[] }
  | { ok: false; error: string };

export type DomainStatusResult =
  | { ok: true; status: string; dnsRecords: DnsRecord[] }
  | { ok: false; error: string };

// ── Internal helpers ───────────────────────────────────────────────────────────

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key?.trim()) return null;
  return new Resend(key.trim());
}

/** Map Resend SDK records to our typed DnsRecord shape. */
function mapRecords(raw: unknown[]): DnsRecord[] {
  return (raw ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      record: (rec['record'] as DnsRecord['record']) ?? 'SPF',
      name: (rec['name'] as string) ?? '',
      type: (rec['type'] as DnsRecord['type']) ?? 'TXT',
      value: (rec['value'] as string) ?? '',
      ttl: (rec['ttl'] as string) ?? 'Auto',
      status: (rec['status'] as DnsRecord['status']) ?? 'not_started',
      ...(rec['priority'] != null ? { priority: rec['priority'] as number } : {}),
    };
  });
}

// ── Exported functions ─────────────────────────────────────────────────────────

/**
 * Register a new sending domain with Resend.
 * Returns the domain ID and the DNS records to configure.
 */
export async function addResendDomain(domain: string): Promise<AddDomainResult> {
  const resend = getResendClient();
  if (!resend) {
    return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  }

  try {
    const { data, error } = await resend.domains.create({ name: domain });
    if (error || !data) {
      return { ok: false, error: (error as { message?: string } | null)?.message ?? 'Failed to add domain to Resend.' };
    }
    const records = mapRecords((data as { records?: unknown[] }).records ?? []);
    return { ok: true, id: data.id, dnsRecords: records };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Fetch current verification status and DNS records for a domain already registered in Resend.
 */
export async function getResendDomainStatus(resendDomainId: string): Promise<DomainStatusResult> {
  const resend = getResendClient();
  if (!resend) {
    return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  }

  try {
    const { data, error } = await resend.domains.get(resendDomainId);
    if (error || !data) {
      return { ok: false, error: (error as { message?: string } | null)?.message ?? 'Failed to get domain status from Resend.' };
    }
    const raw = data as { status?: string; records?: unknown[] };
    const records = mapRecords(raw.records ?? []);
    return { ok: true, status: raw.status ?? 'pending', dnsRecords: records };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Delete a domain from Resend. Non-fatal if the domain is already gone (404).
 */
export async function deleteResendDomain(
  resendDomainId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResendClient();
  if (!resend) {
    return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  }

  try {
    const { error } = await resend.domains.remove(resendDomainId);
    if (error) {
      const errMsg = (error as { message?: string }).message ?? '';
      // Treat 404 as success — domain may have already been removed
      if (errMsg.toLowerCase().includes('not found') || errMsg.includes('404')) {
        return { ok: true };
      }
      return { ok: false, error: errMsg };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
