/**
 * Tests for the public DNS-handoff actions. These actions are anon-callable
 * (no auth session required), so the validation and gating behavior is
 * security-sensitive: a malformed or guessed token must NOT leak workspace
 * data.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: vi.fn(),
}));

vi.mock('@/shared/api/resend/domains', () => ({
  getResendDomainStatus: vi.fn(),
}));

vi.mock('dns/promises', () => ({
  default: { resolveTxt: vi.fn() },
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}));

const { getSystemClient } = await import('@/shared/api/supabase/system');
const { getResendDomainStatus } = await import('@/shared/api/resend/domains');
const dns = (await import('dns/promises')).default;
const { getDnsHandoffPublicView, confirmDnsHandoff } = await import('../dns-handoff-public');

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'a'.repeat(43); // ~43 chars matches base64url-encoded 32 bytes

function buildValidRow(overrides: Record<string, unknown> = {}) {
  return {
    public_token: VALID_TOKEN,
    kind: 'dns_helper',
    recipient_kind: 'email',
    sender_message: null,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    confirmed_at: null,
    revoked_at: null,
    sender_user_id: 'user-uuid-1',
    workspace_id: 'ws-uuid-1',
    payload: {
      domain: 'invisibletouchevents.com',
      records: [
        { record: 'SPF', type: 'TXT', name: 'send.invisibletouchevents.com', value: 'v=spf1 include:resend ~all', ttl: 'Auto', status: 'verified' },
        { record: 'DKIM', type: 'CNAME', name: 'r1._domainkey.invisibletouchevents.com', value: 'r1.resend.com', ttl: 'Auto', status: 'not_started' },
      ],
    },
    ...overrides,
  };
}

function mockSystemForGet(handoffRow: unknown, workspace: unknown, profile: unknown) {
  const handoffQb = makeMaybeSingle(handoffRow);
  const workspaceQb = makeMaybeSingle(workspace);
  const profileQb = makeMaybeSingle(profile);

  const adminGetUserById = vi.fn().mockResolvedValue({ data: { user: null } });

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'workspaces') return workspaceQb;
    if (table === 'profiles') return profileQb;
    return makeMaybeSingle(null);
  });

  const schemaMock = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue(handoffQb),
  });

  vi.mocked(getSystemClient).mockReturnValue({
    schema: schemaMock,
    from: fromMock,
    auth: { admin: { getUserById: adminGetUserById } },
  } as never);
}

function makeMaybeSingle(data: unknown) {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'update', 'insert']) {
    qb[m] = vi.fn().mockReturnValue(qb);
  }
  qb.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  qb.single = vi.fn().mockResolvedValue({ data, error: null });
  return qb;
}

// ── getDnsHandoffPublicView ───────────────────────────────────────────────────

describe('getDnsHandoffPublicView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not_found for empty token', async () => {
    const result = await getDnsHandoffPublicView('');
    expect(result.kind).toBe('not_found');
  });

  it('returns not_found for short token (defends against enumeration)', async () => {
    const result = await getDnsHandoffPublicView('abc');
    expect(result.kind).toBe('not_found');
  });

  it('returns not_found for absurdly long token', async () => {
    const result = await getDnsHandoffPublicView('x'.repeat(200));
    expect(result.kind).toBe('not_found');
  });

  it('returns not_found when token does not exist in DB', async () => {
    mockSystemForGet(null, null, null);
    const result = await getDnsHandoffPublicView(VALID_TOKEN);
    expect(result.kind).toBe('not_found');
  });

  it('returns revoked when revoked_at is set', async () => {
    mockSystemForGet(buildValidRow({ revoked_at: new Date().toISOString() }), null, null);
    const result = await getDnsHandoffPublicView(VALID_TOKEN);
    expect(result.kind).toBe('revoked');
  });

  it('returns expired when expires_at is in the past', async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    mockSystemForGet(buildValidRow({ expires_at: past }), null, null);
    const result = await getDnsHandoffPublicView(VALID_TOKEN);
    expect(result.kind).toBe('expired');
  });

  it('returns ok with view including snapshot records', async () => {
    mockSystemForGet(
      buildValidRow(),
      { name: 'Invisible Touch Events', sending_domain: 'invisibletouchevents.com' },
      { full_name: 'Linda Arthur' },
    );
    const result = await getDnsHandoffPublicView(VALID_TOKEN);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.view.domain).toBe('invisibletouchevents.com');
    expect(result.view.ownerName).toBe('Linda Arthur');
    expect(result.view.ownerCompany).toBe('Invisible Touch Events');
    expect(result.view.records).toHaveLength(2);
    expect(result.view.recordsMayBeStale).toBe(false);
  });

  it('flags recordsMayBeStale when current workspace domain differs from snapshot', async () => {
    mockSystemForGet(
      buildValidRow(),
      { name: 'Invisible Touch Events', sending_domain: 'newdomain.com' },
      { full_name: 'Linda Arthur' },
    );
    const result = await getDnsHandoffPublicView(VALID_TOKEN);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.view.recordsMayBeStale).toBe(true);
  });

  it('falls back to "A Unusonic customer" when no name resolvable', async () => {
    mockSystemForGet(
      buildValidRow(),
      { name: 'Some Workspace', sending_domain: 'example.com' },
      null,
    );
    const result = await getDnsHandoffPublicView(VALID_TOKEN);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.view.ownerName).toBe('A Unusonic customer');
  });
});

// ── confirmDnsHandoff ─────────────────────────────────────────────────────────

describe('confirmDnsHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dns.resolveTxt).mockRejectedValue(new Error('no dmarc'));
  });

  function mockSystemForConfirm(opts: {
    confirmRow: unknown;
    workspace: unknown;
  }) {
    const handoffQb = makeMaybeSingle(opts.confirmRow);
    const updateQb = makeMaybeSingle(null);
    const workspaceQb = makeMaybeSingle(opts.workspace);
    const workspacesUpdateQb = makeMaybeSingle(null);

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'workspaces') {
        // First call (select), subsequent (update) — return same shape
        return workspaceQb.update.mock?.calls?.length ? workspacesUpdateQb : workspaceQb;
      }
      return makeMaybeSingle(null);
    });

    const schemaMock = vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        return handoffQb.update.mock?.calls?.length ? updateQb : handoffQb;
      }),
    }));

    vi.mocked(getSystemClient).mockReturnValue({
      schema: schemaMock,
      from: fromMock,
      auth: { admin: { getUserById: vi.fn() } },
    } as never);
  }

  it('rejects invalid token', async () => {
    const result = await confirmDnsHandoff('short');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Invalid link.');
  });

  it('rejects revoked link', async () => {
    mockSystemForConfirm({
      confirmRow: {
        id: 'h-1',
        workspace_id: 'ws-1',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        revoked_at: new Date().toISOString(),
        confirmed_at: null,
      },
      workspace: { resend_domain_id: 'rd-1', sending_domain: 'example.com' },
    });
    const result = await confirmDnsHandoff(VALID_TOKEN);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('This link was revoked.');
  });

  it('rejects expired link', async () => {
    mockSystemForConfirm({
      confirmRow: {
        id: 'h-1',
        workspace_id: 'ws-1',
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        revoked_at: null,
        confirmed_at: null,
      },
      workspace: { resend_domain_id: 'rd-1', sending_domain: 'example.com' },
    });
    const result = await confirmDnsHandoff(VALID_TOKEN);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('This link has expired.');
  });

  it('reports allVerified=true when Resend status is verified', async () => {
    vi.mocked(getResendDomainStatus).mockResolvedValue({
      ok: true,
      status: 'verified',
      dnsRecords: [
        { record: 'SPF', type: 'TXT', name: 'a', value: 'v', ttl: 'Auto', status: 'verified' },
      ],
    });
    mockSystemForConfirm({
      confirmRow: {
        id: 'h-1',
        workspace_id: 'ws-1',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        revoked_at: null,
        confirmed_at: null,
      },
      workspace: { resend_domain_id: 'rd-1', sending_domain: 'example.com' },
    });
    const result = await confirmDnsHandoff(VALID_TOKEN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allVerified).toBe(true);
    expect(result.confirmedAt).not.toBeNull();
  });

  it('reports allVerified=false when any record still pending', async () => {
    vi.mocked(getResendDomainStatus).mockResolvedValue({
      ok: true,
      status: 'pending',
      dnsRecords: [
        { record: 'SPF', type: 'TXT', name: 'a', value: 'v', ttl: 'Auto', status: 'verified' },
        { record: 'DKIM', type: 'CNAME', name: 'b', value: 'v', ttl: 'Auto', status: 'not_started' },
      ],
    });
    mockSystemForConfirm({
      confirmRow: {
        id: 'h-1',
        workspace_id: 'ws-1',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        revoked_at: null,
        confirmed_at: null,
      },
      workspace: { resend_domain_id: 'rd-1', sending_domain: 'example.com' },
    });
    const result = await confirmDnsHandoff(VALID_TOKEN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allVerified).toBe(false);
    expect(result.confirmedAt).toBeNull();
  });

  it('returns error when Resend status fetch fails', async () => {
    vi.mocked(getResendDomainStatus).mockResolvedValue({ ok: false, error: 'rate limited' });
    mockSystemForConfirm({
      confirmRow: {
        id: 'h-1',
        workspace_id: 'ws-1',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        revoked_at: null,
        confirmed_at: null,
      },
      workspace: { resend_domain_id: 'rd-1', sending_domain: 'example.com' },
    });
    const result = await confirmDnsHandoff(VALID_TOKEN);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Could not check verification');
  });
});
