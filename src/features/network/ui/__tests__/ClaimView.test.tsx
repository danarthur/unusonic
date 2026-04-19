/**
 * Component coverage for `ClaimView` — the invite card.
 *
 * Locks the visible contract the Phase 3 design spec (§5) promises:
 *   - Workspace name + inviter name + role label all appear in the hero.
 *   - Device-aware primary CTA uses the Face ID / Touch ID / Windows Hello /
 *     generic copy per the `DeviceCapability` prop.
 *   - Authenticated users see Accept; unauthenticated users see the
 *     magic-link CTA.
 *   - Email mismatch renders the "Wrong account" branch.
 *   - We never leak the word "passkey" into the rendered DOM.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClaimView } from '../ClaimView';
import type { InvitationSummary } from '@/entities/auth/model/types';

// Server-action imports are mocked so the component can render in happy-dom
// without the 'server-only' module exploding. We only need the identity of
// the exports — the happy-path tests never click Accept.
vi.mock('@/features/onboarding/api/actions', () => ({
  claimOrganization: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/features/team-invite/api/actions', () => ({
  acceptEmployeeInvite: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/features/auth/smart-login/api/actions', () => ({
  sendMagicLinkAction: vi.fn(
    async () => ({ ok: true, expiresAt: new Date(Date.now() + 3600_000).toISOString() }),
  ),
}));

function summaryFixture(overrides: Partial<InvitationSummary> = {}): InvitationSummary {
  return {
    workspaceId: 'ws_1',
    workspaceName: 'Vibe Productions',
    workspaceLogoUrl: null,
    inviterDisplayName: 'Elena Rivera',
    inviterEntityId: 'ent_elena',
    role: { slug: 'member', label: 'Production Manager' },
    email: 'crew@vibe.co',
    expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<ClaimView />', () => {
  it('renders workspace, inviter, and role in the hero for unauthed users', () => {
    render(
      <ClaimView
        token="tkn-1"
        summary={summaryFixture()}
        isAuthenticated={false}
        isEmployeeInvite={true}
        userEmail={null}
        deviceCapability="faceid"
      />,
    );

    const heading = screen.getByRole('heading', { level: 1 });
    const txt = heading.textContent ?? '';
    expect(txt).toContain('Elena Rivera');
    expect(txt).toContain('Vibe Productions');
    // role label appears under the heading
    expect(screen.getByText('as Production Manager')).toBeTruthy();
    // email appears as a quiet trailer
    expect(screen.getByText('crew@vibe.co')).toBeTruthy();
  });

  it('shows the Face ID primary CTA when deviceCapability="faceid"', () => {
    render(
      <ClaimView
        token="tkn-1"
        summary={summaryFixture()}
        isAuthenticated={false}
        isEmployeeInvite={true}
        userEmail={null}
        deviceCapability="faceid"
      />,
    );
    const cta = screen.getByTestId('claim-primary-cta');
    expect(cta.textContent).toMatch(/Accept and set up Face ID/);
  });

  it('shows the Touch ID primary CTA when deviceCapability="touchid"', () => {
    render(
      <ClaimView
        token="tkn-1"
        summary={summaryFixture()}
        isAuthenticated={false}
        isEmployeeInvite={true}
        userEmail={null}
        deviceCapability="touchid"
      />,
    );
    const cta = screen.getByTestId('claim-primary-cta');
    expect(cta.textContent).toMatch(/Accept and set up Touch ID/);
  });

  it('shows the Windows Hello primary CTA when deviceCapability="windowshello"', () => {
    render(
      <ClaimView
        token="tkn-1"
        summary={summaryFixture()}
        isAuthenticated={false}
        isEmployeeInvite={true}
        userEmail={null}
        deviceCapability="windowshello"
      />,
    );
    const cta = screen.getByTestId('claim-primary-cta');
    expect(cta.textContent).toMatch(/Windows Hello/);
  });

  it('shows the generic CTA for deviceCapability="device"', () => {
    render(
      <ClaimView
        token="tkn-1"
        summary={summaryFixture()}
        isAuthenticated={false}
        isEmployeeInvite={true}
        userEmail={null}
        deviceCapability="device"
      />,
    );
    const cta = screen.getByTestId('claim-primary-cta');
    // Generic copy is "Accept and set up secure sign-in"
    expect(cta.textContent).toMatch(/secure sign-in/i);
  });

  it('offers a magic-link secondary action for unauthed users', () => {
    render(
      <ClaimView
        token="tkn-1"
        summary={summaryFixture()}
        isAuthenticated={false}
        isEmployeeInvite={true}
        userEmail={null}
        deviceCapability="faceid"
      />,
    );
    const link = screen.getByTestId('claim-magic-link');
    expect(link.textContent).toMatch(/magic link/i);
  });

  it('shows the Accept CTA for authenticated users (no magic link)', () => {
    render(
      <ClaimView
        token="tkn-1"
        summary={summaryFixture()}
        isAuthenticated={true}
        isEmployeeInvite={true}
        userEmail="crew@vibe.co"
        deviceCapability="faceid"
      />,
    );
    expect(screen.getByTestId('claim-accept')).toBeTruthy();
    // The magic-link secondary is hidden when we're already authed.
    expect(screen.queryByTestId('claim-magic-link')).toBeNull();
    expect(screen.queryByTestId('claim-primary-cta')).toBeNull();
  });

  it('routes to the mismatch branch when authed user\'s email differs from invite email', () => {
    render(
      <ClaimView
        token="tkn-1"
        summary={summaryFixture()}
        isAuthenticated={true}
        isEmployeeInvite={true}
        userEmail="someone-else@gmail.com"
        deviceCapability="faceid"
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Wrong account/);
  });

  it('never renders the word "passkey" in its DOM', () => {
    const { container } = render(
      <ClaimView
        token="tkn-1"
        summary={summaryFixture()}
        isAuthenticated={false}
        isEmployeeInvite={true}
        userEmail={null}
        deviceCapability="faceid"
      />,
    );
    expect((container.textContent ?? '').toLowerCase()).not.toContain('passkey');
  });
});

/** Snapshot — locks the current Stage-Engineering structure. Regenerate on intentional changes. */
describe('<ClaimView /> — snapshot', () => {
  it('renders the default unauthed Face ID variant', () => {
    const { asFragment } = render(
      <ClaimView
        token="tkn-1"
        summary={summaryFixture()}
        isAuthenticated={false}
        isEmployeeInvite={true}
        userEmail={null}
        deviceCapability="faceid"
      />,
    );
    expect(asFragment()).toMatchSnapshot();
  });
});
