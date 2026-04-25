/**
 * Preflight DNS check tests — verifies the wizard's "your existing email
 * keeps working" reassurance flow.
 *
 * Mocks node:dns/promises so each test can describe a specific DNS state
 * (parent has Google MX, parent has DMARC p=reject, subdomain already
 * receives mail, etc.) and assert the expected findings shape.
 *
 * @module features/org-management/api/__tests__/preflight-sending-domain
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock node:dns/promises BEFORE importing the action.
const mockResolveMx = vi.fn();
const mockResolveTxt = vi.fn();
const mockResolve = vi.fn();

vi.mock('dns/promises', () => ({
  default: {
    resolveMx: (...args: unknown[]) => mockResolveMx(...args),
    resolveTxt: (...args: unknown[]) => mockResolveTxt(...args),
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

// We don't want the real Supabase client; the preflight helper doesn't use
// it but the module imports it. Stub minimally.
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/shared/lib/workspace', () => ({
  getActiveWorkspaceId: vi.fn(),
}));
vi.mock('@/shared/api/resend/domains', () => ({
  addResendDomain: vi.fn(),
  getResendDomainStatus: vi.fn(),
  deleteResendDomain: vi.fn(),
}));

import { preflightSendingDomain } from '../email-domain-actions';

beforeEach(() => {
  mockResolveMx.mockReset();
  mockResolveTxt.mockReset();
  mockResolve.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('preflightSendingDomain — input validation', () => {
  it('rejects an apex domain (only 1 dot)', async () => {
    const result = await preflightSendingDomain('example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.toLowerCase()).toContain('subdomain');
  });

  it('rejects a single-label domain', async () => {
    const result = await preflightSendingDomain('example');
    expect(result.ok).toBe(false);
  });

  it('rejects empty string', async () => {
    const result = await preflightSendingDomain('');
    expect(result.ok).toBe(false);
  });

  it('accepts a valid 3-label subdomain', async () => {
    mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveTxt.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolve.mockResolvedValue([]);
    const result = await preflightSendingDomain('mail.example.com');
    expect(result.ok).toBe(true);
  });
});

describe('preflightSendingDomain — parent MX detection (the reassurance case)', () => {
  it('surfaces parent-mx-detected info when Google Workspace is on the parent', async () => {
    mockResolveMx.mockImplementation((domain: string) => {
      if (domain === 'mail.invisibletouchevents.com') {
        return Promise.reject(new Error('ENOTFOUND'));
      }
      // parent
      return Promise.resolve([
        { exchange: 'aspmx.l.google.com', priority: 1 },
        { exchange: 'alt1.aspmx.l.google.com', priority: 5 },
      ]);
    });
    mockResolveTxt.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('mail.invisibletouchevents.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const finding = result.findings.find((f) => f.code === 'parent-mx-detected');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('info');
    expect(finding?.message).toContain('keeps working');
    expect(finding?.message).toContain('aspmx.l.google.com');
  });

  it('does NOT add parent-mx-detected when parent has no MX (parked domain)', async () => {
    mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveTxt.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('mail.parkeddomain.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.findings.find((f) => f.code === 'parent-mx-detected')).toBeUndefined();
  });
});

describe('preflightSendingDomain — subdomain conflict detection', () => {
  it('warns when the chosen subdomain already has MX records', async () => {
    mockResolveMx.mockImplementation((domain: string) => {
      if (domain === 'mail.example.com') {
        return Promise.resolve([{ exchange: 'something.else.com', priority: 10 }]);
      }
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockResolveTxt.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('mail.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const finding = result.findings.find((f) => f.code === 'subdomain-already-receives-mail');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('warning');
  });
});

describe('preflightSendingDomain — DMARC inheritance warning', () => {
  it('warns when parent enforces p=reject', async () => {
    mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveTxt.mockImplementation((domain: string) => {
      if (domain === '_dmarc.example.com') {
        return Promise.resolve([['v=DMARC1; p=reject; rua=mailto:dmarc@example.com']]);
      }
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('mail.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const finding = result.findings.find((f) => f.code === 'parent-dmarc-strict');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('warning');
    expect(finding?.message.toLowerCase()).toContain('p=reject');
  });

  it('warns when parent enforces p=quarantine', async () => {
    mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveTxt.mockImplementation((domain: string) => {
      if (domain === '_dmarc.example.com') {
        return Promise.resolve([['v=DMARC1; p=quarantine']]);
      }
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('mail.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const finding = result.findings.find((f) => f.code === 'parent-dmarc-strict');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('warning');
  });

  it('does NOT warn when parent has p=none', async () => {
    mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveTxt.mockImplementation((domain: string) => {
      if (domain === '_dmarc.example.com') {
        return Promise.resolve([['v=DMARC1; p=none']]);
      }
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('mail.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.findings.find((f) => f.code === 'parent-dmarc-strict')).toBeUndefined();
  });

  it('respects sp= directive over p=', async () => {
    // Parent says p=none for parent traffic, sp=reject for subdomains.
    // We're verifying a subdomain — sp= governs us.
    mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveTxt.mockImplementation((domain: string) => {
      if (domain === '_dmarc.example.com') {
        return Promise.resolve([['v=DMARC1; p=none; sp=reject']]);
      }
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('mail.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const finding = result.findings.find((f) => f.code === 'parent-dmarc-strict');
    expect(finding).toBeDefined();
    expect(finding?.message.toLowerCase()).toContain('p=reject');
  });
});

describe('preflightSendingDomain — SPF detection (info-only)', () => {
  it('surfaces parent-spf-detected when parent has v=spf1', async () => {
    mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveTxt.mockImplementation((domain: string) => {
      if (domain === 'example.com') {
        return Promise.resolve([
          ['v=spf1 include:_spf.google.com ~all'],
          ['google-site-verification=abc123'],
        ]);
      }
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('mail.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const finding = result.findings.find((f) => f.code === 'parent-spf-detected');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('info');
    expect(finding?.message).toContain("won't conflict");
  });

  it('does not surface SPF when parent has only non-SPF TXT records', async () => {
    mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveTxt.mockImplementation((domain: string) => {
      if (domain === 'example.com') {
        return Promise.resolve([['google-site-verification=abc123']]);
      }
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('mail.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.findings.find((f) => f.code === 'parent-spf-detected')).toBeUndefined();
  });
});

describe('preflightSendingDomain — non-resolvable parent fallback', () => {
  it('warns when parent domain does not resolve at all (typo case)', async () => {
    mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveTxt.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolve.mockRejectedValue(new Error('ENOTFOUND'));

    const result = await preflightSendingDomain('mail.deftly-hidden-typo.example');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const finding = result.findings.find((f) => f.code === 'parent-not-resolvable');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('warning');
    expect(finding?.message.toLowerCase()).toContain("doesn't resolve");
  });

  it('does NOT add the not-resolvable warning when other findings already exist', async () => {
    mockResolveMx.mockImplementation((domain: string) => {
      if (domain.startsWith('mail.')) return Promise.reject(new Error('ENOTFOUND'));
      return Promise.resolve([{ exchange: 'aspmx.l.google.com', priority: 1 }]);
    });
    mockResolveTxt.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('mail.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.findings.find((f) => f.code === 'parent-mx-detected')).toBeDefined();
    expect(result.findings.find((f) => f.code === 'parent-not-resolvable')).toBeUndefined();
  });
});

describe('preflightSendingDomain — composite scenarios', () => {
  it('Marcus on Squarespace + Google Workspace + soft DMARC (the common case)', async () => {
    mockResolveMx.mockImplementation((domain: string) => {
      if (domain === 'mail.invisibletouchevents.com') {
        return Promise.reject(new Error('ENOTFOUND'));
      }
      return Promise.resolve([
        { exchange: 'aspmx.l.google.com', priority: 1 },
        { exchange: 'alt1.aspmx.l.google.com', priority: 5 },
      ]);
    });
    mockResolveTxt.mockImplementation((domain: string) => {
      if (domain === 'invisibletouchevents.com') {
        return Promise.resolve([
          ['v=spf1 include:_spf.google.com ~all'],
        ]);
      }
      if (domain === '_dmarc.invisibletouchevents.com') {
        return Promise.resolve([['v=DMARC1; p=none']]);
      }
      return Promise.reject(new Error('ENOTFOUND'));
    });
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('mail.invisibletouchevents.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should have parent-mx-detected (info) + parent-spf-detected (info)
    // and NO warnings (DMARC is p=none, no inheritance concern).
    const codes = result.findings.map((f) => f.code).sort();
    expect(codes).toEqual(['parent-mx-detected', 'parent-spf-detected']);
    expect(result.findings.every((f) => f.severity === 'info')).toBe(true);
  });

  it('uppercase input is normalized to lowercase before processing', async () => {
    mockResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolveTxt.mockRejectedValue(new Error('ENOTFOUND'));
    mockResolve.mockResolvedValue([]);

    const result = await preflightSendingDomain('MAIL.EXAMPLE.COM');
    expect(result.ok).toBe(true);
    // The action lowercases internally; we just verify it didn't reject.
  });
});
