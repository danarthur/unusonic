/**
 * Component tests for the Phase 4 sign-in card (v2 state machine).
 *
 * Focus: state transitions and the enumeration-safe magic-link
 * fallback. The resolver action itself has a dedicated unit test; here
 * we mock it at the module boundary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  sendMagicLinkMock: vi.fn(),
  authenticatePasskeyMock: vi.fn(),
  sendSmsOtpMock: vi.fn(),
  verifySmsOtpMock: vi.fn(),
}));

vi.mock('../../api/actions', () => ({
  resolveContinueAction: hoisted.resolveMock,
  sendMagicLinkAction: hoisted.sendMagicLinkMock,
  // these aren't used by v2 but the module exports them
  signInAction: vi.fn(),
  sendOtpAction: vi.fn(),
  verifyOtpAction: vi.fn(),
}));

vi.mock('../../api/sms-actions', () => ({
  sendSmsOtpAction: hoisted.sendSmsOtpMock,
  verifySmsOtpAction: hoisted.verifySmsOtpMock,
  toggleSmsSigninEnabled: vi.fn(),
}));

vi.mock('@/features/auth/passkey-authenticate/api/authenticate-passkey', () => ({
  authenticatePasskey: hoisted.authenticatePasskeyMock,
  runConditionalMediation: vi.fn(async () => ({ ok: true })),
}));

// LivingLogo has heavy three.js-style deps; stub.
vi.mock('@/shared/ui/branding/living-logo', () => ({
  LivingLogo: () => <div data-testid="living-logo" />,
}));

import { SignInCard } from '../sign-in-card';

function renderCard(overrides: Partial<Parameters<typeof SignInCard>[0]> = {}) {
  const props = {
    email: '',
    setEmail: vi.fn(),
    redirectTo: undefined,
    showInactivityMessage: false,
    showSessionExpiredMessage: false,
    signinExiting: false,
    anticipating: false,
    isPending: false,
    prefersReducedMotion: true,
    onModeSwitch: vi.fn(),
    onPasskeyPendingChange: vi.fn(),
    authV2LoginCard: true,
    ...overrides,
  };
  return render(<SignInCard {...props} />);
}

beforeEach(() => {
  hoisted.resolveMock.mockReset();
  hoisted.sendMagicLinkMock.mockReset();
  hoisted.authenticatePasskeyMock.mockReset();
  hoisted.sendSmsOtpMock.mockReset();
  hoisted.verifySmsOtpMock.mockReset();
});

describe('SignInCard v2 — flag gate', () => {
  it('renders legacy card when authV2LoginCard is false', () => {
    const { queryByTestId } = renderCard({ authV2LoginCard: false });
    // Legacy card does not use data-testid="signin-card-body"
    expect(queryByTestId('signin-card-body')).toBeNull();
  });

  it('renders v2 card when authV2LoginCard is true', () => {
    renderCard({ authV2LoginCard: true });
    expect(screen.getByTestId('signin-card-body')).toBeTruthy();
  });
});

describe('SignInCard v2 — state machine', () => {
  it('starts in idle with Continue button disabled when email empty', () => {
    renderCard();
    const btn = screen.getByTestId('signin-continue-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables Continue when email is valid', () => {
    const setEmail = vi.fn();
    const { rerender } = renderCard({ email: '', setEmail });
    rerender(
      <SignInCard
        email="alice@example.com"
        setEmail={setEmail}
        showInactivityMessage={false}
        showSessionExpiredMessage={false}
        signinExiting={false}
        anticipating={false}
        isPending={false}
        prefersReducedMotion
        onModeSwitch={vi.fn()}
        onPasskeyPendingChange={vi.fn()}
        authV2LoginCard
      />,
    );
    const btn = screen.getByTestId('signin-continue-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('transitions idle → checking → magic-link-sent on unknown email', async () => {
    hoisted.resolveMock.mockResolvedValue({ kind: 'magic-link' });
    renderCard({ email: 'nobody@example.com' });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signin-continue-button'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('signin-resend-button')).toBeTruthy();
    });
    expect(screen.getByTestId('signin-different-email-button')).toBeTruthy();
  });

  it('transitions to passkey on resolved=passkey and keeps magic-link fallback visible from moment 1', async () => {
    hoisted.resolveMock.mockResolvedValue({ kind: 'passkey' });
    hoisted.authenticatePasskeyMock.mockResolvedValue({ ok: true });
    renderCard({ email: 'alice@example.com' });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signin-continue-button'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('signin-use-magic-link-instead')).toBeTruthy();
    });
    expect(screen.getByTestId('signin-passkey-button')).toBeTruthy();
  });

  it('returns to idle when the user cancels the passkey prompt', async () => {
    hoisted.resolveMock.mockResolvedValue({ kind: 'passkey' });
    hoisted.authenticatePasskeyMock.mockResolvedValue({
      ok: false,
      error: 'NotAllowedError: The operation was canceled.',
    });
    renderCard({ email: 'alice@example.com' });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signin-continue-button'));
    });

    await waitFor(() => {
      // After cancellation, the reducer drops to idle → Continue button
      // is rendered again.
      expect(screen.queryByTestId('signin-continue-button')).toBeTruthy();
    });
  });
});

describe('SignInCard v2 — session-expired', () => {
  it('mounts directly in the passkey/session-expired state', () => {
    renderCard({
      email: 'alice@example.com',
      showSessionExpiredMessage: true,
    });
    // In session-expired, the passkey CTA renders immediately.
    expect(screen.queryByTestId('signin-passkey-button')).toBeTruthy();
    // Magic-link fallback is visible from moment 1.
    expect(screen.queryByTestId('signin-use-magic-link-instead')).toBeTruthy();
  });
});

describe('SignInCard v2 — Phase 6 SMS code path', () => {
  it('hides the SMS button when authV2Sms is OFF', async () => {
    hoisted.resolveMock.mockResolvedValue({ kind: 'magic-link' });
    renderCard({ email: 'alice@example.com', authV2Sms: false });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signin-continue-button'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('signin-resend-button')).toBeTruthy();
    });
    expect(screen.queryByTestId('signin-use-sms-instead')).toBeNull();
  });

  it('shows the SMS button on the magic-link-sent state when authV2Sms is ON', async () => {
    hoisted.resolveMock.mockResolvedValue({ kind: 'magic-link' });
    renderCard({ email: 'alice@example.com', authV2Sms: true });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signin-continue-button'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('signin-use-sms-instead')).toBeTruthy();
    });
  });

  it('transitions to sms-sent after tapping the SMS button on success', async () => {
    hoisted.resolveMock.mockResolvedValue({ kind: 'magic-link' });
    hoisted.sendSmsOtpMock.mockResolvedValue({
      ok: true,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    renderCard({ email: 'alice@example.com', authV2Sms: true });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signin-continue-button'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('signin-use-sms-instead')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signin-use-sms-instead'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('signin-sms-code-input')).toBeTruthy();
      expect(screen.queryByTestId('signin-sms-verify-button')).toBeTruthy();
    });
    expect(hoisted.sendSmsOtpMock).toHaveBeenCalledWith({ email: 'alice@example.com' });
  });

  it('surfaces the not-available error on the SMS pane when send fails', async () => {
    hoisted.resolveMock.mockResolvedValue({ kind: 'magic-link' });
    hoisted.sendSmsOtpMock.mockResolvedValue({
      ok: false,
      error: 'SMS sign-in is not available for this account.',
    });
    renderCard({ email: 'alice@example.com', authV2Sms: true });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signin-continue-button'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('signin-use-sms-instead')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signin-use-sms-instead'));
    });

    // We still transition to sms-sent so the error lands in context.
    await waitFor(() => {
      expect(screen.queryByTestId('signin-sms-error')).toBeTruthy();
    });
    expect(screen.getByTestId('signin-sms-error').textContent).toMatch(/not available/i);
  });
});
