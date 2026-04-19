/**
 * Integration coverage for the Phase 5 guardian gate wiring into the
 * onboarding wizard state machine.
 *
 * The wizard-as-a-whole has a lot of moving parts (avatar upload, ghost
 * claim, Scout, genesis); these tests mock those out and focus on the one
 * contract Phase 5 introduces: when `guardianGateEnabled` is true, the
 * wizard inserts the guardian step between website and genesis and
 * refuses to advance past it without an explicit decision.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingWizard } from '../onboarding-wizard';

vi.mock('@/features/identity-hydration', () => ({
  updateProfile: vi.fn(async () => ({ success: true })),
  updateOnboardingStep: vi.fn(async () => ({ success: true })),
  uploadAvatar: vi.fn(async () => ({ success: true, avatarUrl: null })),
  claimGhostEntities: vi.fn(async () => ({ success: true, count: 0 })),
}));

vi.mock('@/features/onboarding', () => ({
  GenesisOrchestrator: () => <div data-testid="genesis-orchestrator">genesis</div>,
}));

vi.mock('@/features/onboarding/ui/website-step', () => ({
  WebsiteStep: ({ onSkip }: { onSkip: () => void }) => (
    <div>
      <button data-testid="website-skip" onClick={onSkip}>
        Skip website
      </button>
    </div>
  ),
}));

// Surface the guardian step's two exits as controllable buttons.
vi.mock('@/features/onboarding/ui/guardian-setup-step', () => ({
  GuardianSetupStep: ({
    onDecision,
  }: {
    onDecision: (d: { kind: 'accept' } | { kind: 'deferred' }) => void;
  }) => (
    <div>
      <button data-testid="mock-accept" onClick={() => onDecision({ kind: 'accept' })}>
        mock-accept
      </button>
      <button data-testid="mock-deferred" onClick={() => onDecision({ kind: 'deferred' })}>
        mock-deferred
      </button>
    </div>
  ),
}));

vi.mock('@/features/onboarding/ui/aion-onboarding-shell', () => ({
  AionOnboardingShell: ({
    children,
    prompt,
    onBack,
    footer,
  }: {
    children: React.ReactNode;
    prompt: string;
    onBack?: () => void;
    footer?: React.ReactNode;
  }) => (
    <div>
      <div data-testid="prompt">{prompt}</div>
      {onBack ? (
        <button data-testid="back-btn" onClick={onBack}>
          back
        </button>
      ) : null}
      <div data-testid="content">{children}</div>
      <div data-testid="footer">{footer}</div>
    </div>
  ),
}));

vi.mock('@/features/onboarding/ui/onboarding-chat-input', () => ({
  OnboardingChatInput: (props: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSubmit: () => void;
  }) => (
    <input
      data-testid="profile-input"
      value={props.value}
      onChange={props.onChange}
      onKeyDown={(e) => {
        if (e.key === 'Enter') props.onSubmit();
      }}
    />
  ),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const baseState = {
  user: { id: 'u1', email: 'test@unusonic.com' },
  profile: {
    fullName: 'Test User', // skip past profile step
    avatarUrl: null as string | null,
    onboardingStep: 1, // at website step
  },
  hasWorkspace: false,
  workspaceId: null as string | null,
  workspaceName: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<OnboardingWizard /> guardian gate wiring', () => {
  it('when flag is OFF, skipping the website step advances directly to genesis', async () => {
    render(<OnboardingWizard initialState={baseState} guardianGateEnabled={false} />);
    // Website step renders
    expect(screen.getByTestId('website-skip')).toBeTruthy();

    fireEvent.click(screen.getByTestId('website-skip'));

    await waitFor(() => {
      expect(screen.getByTestId('genesis-orchestrator')).toBeTruthy();
    });
    // Guardian step was never mounted
    expect(screen.queryByTestId('mock-accept')).toBeNull();
  });

  it('when flag is ON, skipping the website step lands on the guardian step', async () => {
    render(<OnboardingWizard initialState={baseState} guardianGateEnabled={true} />);

    fireEvent.click(screen.getByTestId('website-skip'));

    // Guardian step appears; genesis does not
    await waitFor(() => {
      expect(screen.getByTestId('mock-accept')).toBeTruthy();
    });
    expect(screen.queryByTestId('genesis-orchestrator')).toBeNull();
    expect(screen.getByTestId('prompt').textContent).toContain('recovery guardians');
  });

  it('guardian accept advances to genesis and locks out the Back button', async () => {
    render(<OnboardingWizard initialState={baseState} guardianGateEnabled={true} />);
    fireEvent.click(screen.getByTestId('website-skip'));
    await screen.findByTestId('mock-accept');

    fireEvent.click(screen.getByTestId('mock-accept'));

    await waitFor(() => {
      expect(screen.getByTestId('genesis-orchestrator')).toBeTruthy();
    });
    // Back is now disabled (no button rendered) so the user cannot reopen
    // the gate after deciding.
    expect(screen.queryByTestId('back-btn')).toBeNull();
  });

  it('guardian deferred advances to genesis and locks out the Back button', async () => {
    render(<OnboardingWizard initialState={baseState} guardianGateEnabled={true} />);
    fireEvent.click(screen.getByTestId('website-skip'));
    await screen.findByTestId('mock-deferred');

    fireEvent.click(screen.getByTestId('mock-deferred'));

    await waitFor(() => {
      expect(screen.getByTestId('genesis-orchestrator')).toBeTruthy();
    });
    expect(screen.queryByTestId('back-btn')).toBeNull();
  });

  it('without a decision, the guardian step itself does not expose a skip path', () => {
    render(<OnboardingWizard initialState={baseState} guardianGateEnabled={true} />);
    fireEvent.click(screen.getByTestId('website-skip'));

    // The wizard has not auto-advanced anywhere; genesis is absent.
    expect(screen.queryByTestId('genesis-orchestrator')).toBeNull();
    // There is no third exit button the wizard provides — only the mocked
    // decision buttons from the step itself, which both go through the
    // onDecision contract.
    expect(screen.queryByText(/skip guardian/i)).toBeNull();
  });
});
