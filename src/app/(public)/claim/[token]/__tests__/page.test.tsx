/**
 * Integration-level coverage for `/claim/[token]`.
 *
 * The page is a server component that wires:
 *   - `getInvitationForClaim` (token lookup)
 *   - `validateInvitation` (full InvitationSummary)
 *   - supabase auth getUser
 *   - `ClaimView` / `ClaimWizard` / `ClaimError` branches
 *
 * We mock those boundary modules and let the real page render. That
 * exercises the routing logic without a live database.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Module mocks (declared before any import of the page) ──────────────────
vi.mock('next/headers', async () => {
  const actual = await vi.importActual<typeof import('next/headers')>('next/headers');
  return {
    ...actual,
    headers: vi.fn(async () => new Headers({ 'user-agent': 'Mozilla/5.0 iPhone' })),
    cookies: vi.fn(async () => ({
      get: vi.fn(),
      getAll: vi.fn(() => []),
      set: vi.fn(),
      delete: vi.fn(),
    })),
  };
});

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  })),
}));

const getInvitationForClaimMock = vi.fn();
vi.mock('@/features/summoning', () => ({
  getInvitationForClaim: (...args: unknown[]) =>
    getInvitationForClaimMock(...args),
}));

const validateInvitationMock = vi.fn();
vi.mock('@/features/network/api/actions', () => ({
  validateInvitation: (...args: unknown[]) =>
    validateInvitationMock(...args),
}));

// Server actions imported by ClaimView — stubbed so the client component
// can render.
vi.mock('@/features/onboarding/api/actions', () => ({
  claimOrganization: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/features/team-invite/api/actions', () => ({
  acceptEmployeeInvite: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/features/auth/smart-login/api/actions', () => ({
  sendMagicLinkAction: vi.fn(async () => ({
    ok: true,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  })),
}));

// Import after mocks register.
import ClaimPage from '../page';

beforeEach(() => {
  getInvitationForClaimMock.mockReset();
  validateInvitationMock.mockReset();
});

describe('/claim/[token] — happy path', () => {
  it('renders workspace, inviter, and role on a valid employee invite', async () => {
    getInvitationForClaimMock.mockResolvedValue({
      ok: true,
      invitation: {
        token: 'tkn-ok',
        email: 'crew@vibe.co',
        type: 'employee_invite',
        payload: { orgName: 'Vibe Productions', inviterName: 'Elena Rivera' },
        originName: 'Vibe Productions',
        targetName: 'Vibe Productions',
        targetLogoUrl: null,
      },
    });
    validateInvitationMock.mockResolvedValue({
      ok: true,
      workspaceId: 'ws_1',
      workspaceName: 'Vibe Productions',
      workspaceLogoUrl: null,
      inviterDisplayName: 'Elena Rivera',
      inviterEntityId: 'ent_elena',
      role: { slug: 'member', label: 'Production Manager' },
      email: 'crew@vibe.co',
      expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });

    const element = await ClaimPage({ params: Promise.resolve({ token: 'tkn-ok' }) });
    render(element as React.ReactElement);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('Elena Rivera');
    expect(heading.textContent).toContain('Vibe Productions');
    expect(screen.getByText('as Production Manager')).toBeTruthy();
  });
});

describe('/claim/[token] — expired/invalid token', () => {
  it('renders ClaimError when the initial invitation lookup fails', async () => {
    getInvitationForClaimMock.mockResolvedValue({
      ok: false,
      error: 'This invitation has expired.',
    });

    const element = await ClaimPage({ params: Promise.resolve({ token: 'tkn-expired' }) });
    render(element as React.ReactElement);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/Link invalid or expired/);
    expect(screen.getByText('This invitation has expired.')).toBeTruthy();
  });

  it('renders ClaimError when validateInvitation fails (race or non-employee type)', async () => {
    getInvitationForClaimMock.mockResolvedValue({
      ok: true,
      invitation: {
        token: 'tkn-bad',
        email: 'x@y.com',
        type: 'employee_invite',
        payload: {},
        originName: '',
        targetName: '',
        targetLogoUrl: null,
      },
    });
    validateInvitationMock.mockResolvedValue({
      ok: false,
      error: 'This invitation has expired.',
    });

    const element = await ClaimPage({ params: Promise.resolve({ token: 'tkn-bad' }) });
    render(element as React.ReactElement);

    expect(screen.getByText('This invitation has expired.')).toBeTruthy();
  });
});
