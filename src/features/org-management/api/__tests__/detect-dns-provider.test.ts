/**
 * detectDnsProvider tests — verifies the wizard's "registrar detected" chip
 * and Cloudflare orange-cloud warning logic.
 *
 * @module features/org-management/api/__tests__/detect-dns-provider
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockResolveNs = vi.fn();

vi.mock('dns/promises', () => ({
  default: {
    resolveNs: (...args: unknown[]) => mockResolveNs(...args),
    resolveMx: vi.fn(),
    resolveTxt: vi.fn(),
    resolve: vi.fn(),
  },
}));

vi.mock('@/shared/api/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/shared/lib/workspace', () => ({ getActiveWorkspaceId: vi.fn() }));
vi.mock('@/shared/api/resend/domains', () => ({
  addResendDomain: vi.fn(),
  getResendDomainStatus: vi.fn(),
  deleteResendDomain: vi.fn(),
}));

import { detectDnsProvider } from '../email-domain-actions';

beforeEach(() => {
  mockResolveNs.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('detectDnsProvider — registrar pattern matching', () => {
  it.each([
    {
      provider: 'cloudflare' as const,
      label: 'Cloudflare',
      ns: ['violet.ns.cloudflare.com', 'mark.ns.cloudflare.com'],
    },
    {
      provider: 'godaddy' as const,
      label: 'GoDaddy',
      ns: ['ns01.domaincontrol.com', 'ns02.domaincontrol.com'],
    },
    {
      provider: 'namecheap' as const,
      label: 'Namecheap',
      ns: ['dns1.registrar-servers.com', 'dns2.registrar-servers.com'],
    },
    {
      provider: 'route53' as const,
      label: 'AWS Route 53',
      ns: ['ns-1234.awsdns-56.com', 'ns-789.awsdns-12.org'],
    },
    {
      provider: 'google-domains' as const,
      label: 'Google Domains',
      ns: ['ns-cloud-a1.googledomains.com', 'ns-cloud-a2.googledomains.com'],
    },
    {
      provider: 'squarespace' as const,
      label: 'Squarespace',
      ns: ['ns1.squarespacedns.com', 'ns2.squarespacedns.com'],
    },
    {
      provider: 'vercel' as const,
      label: 'Vercel',
      ns: ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'],
    },
    {
      provider: 'wix' as const,
      label: 'Wix',
      ns: ['ns1.wixdns.net', 'ns2.wixdns.net'],
    },
  ])('detects $label from nameservers', async ({ provider, label, ns }) => {
    mockResolveNs.mockResolvedValue(ns);
    const result = await detectDnsProvider('mail.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe(provider);
    expect(result.label).toBe(label);
    expect(result.nameservers).toEqual(ns.map((n) => n.toLowerCase()));
  });

  it('returns Unknown registrar for nameservers we don\'t recognize', async () => {
    mockResolveNs.mockResolvedValue(['ns1.somerandomhost.com', 'ns2.somerandomhost.com']);
    const result = await detectDnsProvider('mail.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe('');
    expect(result.label).toBe('Unknown registrar');
  });

  it('returns Unknown registrar with empty nameservers when DNS lookup fails', async () => {
    mockResolveNs.mockRejectedValue(new Error('ENOTFOUND'));
    const result = await detectDnsProvider('mail.parked-domain.example');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe('');
    expect(result.label).toBe('Unknown registrar');
    expect(result.nameservers).toEqual([]);
  });

  it('handles uppercase nameserver values', async () => {
    mockResolveNs.mockResolvedValue(['VIOLET.NS.CLOUDFLARE.COM']);
    const result = await detectDnsProvider('mail.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe('cloudflare');
  });

  it('rejects an apex domain (only 1 dot)', async () => {
    const result = await detectDnsProvider('example.com');
    expect(result.ok).toBe(false);
  });

  it('queries the PARENT domain (not the subdomain) for NS', async () => {
    mockResolveNs.mockImplementation((domain: string) => {
      // Verify we ask about the parent.
      if (domain === 'invisibletouchevents.com') {
        return Promise.resolve(['ns1.squarespacedns.com', 'ns2.squarespacedns.com']);
      }
      // If anyone queries the subdomain, return empty (which our code treats as Unknown).
      return Promise.reject(new Error('ENOTFOUND'));
    });
    const result = await detectDnsProvider('mail.invisibletouchevents.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe('squarespace');
    expect(mockResolveNs).toHaveBeenCalledWith('invisibletouchevents.com');
  });
});
