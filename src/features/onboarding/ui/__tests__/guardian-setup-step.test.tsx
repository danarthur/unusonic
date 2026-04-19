/**
 * Component tests for the Phase 5 guardian setup step.
 *
 * These tests lock the non-negotiables from `docs/reference/login-redesign-design.md` §8
 * and the Phase 5 scope: the primary CTA stays disabled until the threshold
 * is met, the deferral warning ESC-blocks, and the server actions are
 * called with the expected arguments.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GuardianSetupStep } from '../guardian-setup-step';

const listMyGuardians = vi.fn();
const addGuardian = vi.fn();
const removeGuardian = vi.fn();
const setGuardianThreshold = vi.fn();
const recordGuardianDeferral = vi.fn();
const recordGuardianAcceptance = vi.fn();

vi.mock('@/features/onboarding/api/guardian-actions', () => ({
  listMyGuardians: (...args: unknown[]) => listMyGuardians(...args),
  addGuardian: (...args: unknown[]) => addGuardian(...args),
  removeGuardian: (...args: unknown[]) => removeGuardian(...args),
  setGuardianThreshold: (...args: unknown[]) => setGuardianThreshold(...args),
  recordGuardianDeferral: (...args: unknown[]) => recordGuardianDeferral(...args),
  recordGuardianAcceptance: (...args: unknown[]) => recordGuardianAcceptance(...args),
}));
vi.mock('@/features/onboarding/model/guardian-constants', () => ({
  GUARDIAN_DEFAULT_THRESHOLD: 2,
  GUARDIAN_MIN_THRESHOLD: 2,
  GUARDIAN_MAX_THRESHOLD: 3,
}));

beforeEach(() => {
  listMyGuardians.mockReset();
  addGuardian.mockReset();
  removeGuardian.mockReset();
  setGuardianThreshold.mockReset();
  recordGuardianDeferral.mockReset();
  recordGuardianAcceptance.mockReset();
});

describe('<GuardianSetupStep />', () => {
  it('renders the primary CTA disabled until threshold guardians are added', async () => {
    // First the list is empty; after addGuardian, the list has 2 rows.
    listMyGuardians
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'g1', name: 'Ana', email: 'ana@example.com', createdAt: '2026-04-18T00:00:00Z' },
      ])
      .mockResolvedValueOnce([
        { id: 'g1', name: 'Ana', email: 'ana@example.com', createdAt: '2026-04-18T00:00:00Z' },
        { id: 'g2', name: '', email: 'ben@example.com', createdAt: '2026-04-18T00:01:00Z' },
      ]);
    addGuardian
      .mockResolvedValueOnce({ ok: true, id: 'g1' })
      .mockResolvedValueOnce({ ok: true, id: 'g2' });

    render(<GuardianSetupStep onDecision={vi.fn()} />);

    const continueBtn = (await screen.findByTestId('guardian-continue')) as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);

    // Add the first guardian — still under threshold (1 of 2).
    fireEvent.change(screen.getByPlaceholderText('guardian@example.com'), {
      target: { value: 'ana@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));
    await waitFor(() => expect(addGuardian).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText('ana@example.com')).toBeTruthy(),
    );
    expect((screen.getByTestId('guardian-continue') as HTMLButtonElement).disabled).toBe(true);

    // Add the second guardian — threshold met.
    fireEvent.change(screen.getByPlaceholderText('guardian@example.com'), {
      target: { value: 'ben@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));
    await waitFor(() => expect(addGuardian).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText('ben@example.com')).toBeTruthy(),
    );

    await waitFor(() =>
      expect((screen.getByTestId('guardian-continue') as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it('calls recordGuardianAcceptance + onDecision("accept") when CTA clicked with threshold met', async () => {
    listMyGuardians.mockResolvedValue([
      { id: 'g1', name: 'Ana', email: 'ana@example.com', createdAt: '2026-04-18T00:00:00Z' },
      { id: 'g2', name: 'Ben', email: 'ben@example.com', createdAt: '2026-04-18T00:01:00Z' },
    ]);
    setGuardianThreshold.mockResolvedValue({ ok: true });
    recordGuardianAcceptance.mockResolvedValue({ ok: true });

    const onDecision = vi.fn();
    render(<GuardianSetupStep onDecision={onDecision} />);

    const continueBtn = (await screen.findByTestId('guardian-continue')) as HTMLButtonElement;
    await waitFor(() => expect(continueBtn.disabled).toBe(false));

    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(recordGuardianAcceptance).toHaveBeenCalledTimes(1);
      expect(setGuardianThreshold).toHaveBeenCalledWith({ threshold: 2 });
      expect(onDecision).toHaveBeenCalledWith({ kind: 'accept' });
    });
  });

  it('opens the deferral warning and requires an explicit "Skip anyway" click', async () => {
    listMyGuardians.mockResolvedValue([]);
    recordGuardianDeferral.mockResolvedValue({ ok: true });

    const onDecision = vi.fn();
    render(<GuardianSetupStep onDecision={onDecision} />);

    const defer = await screen.findByTestId('guardian-defer');
    fireEvent.click(defer);

    // alertdialog renders the warning
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toBeTruthy();

    // ESC does nothing — still open, onDecision not called.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDecision).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeTruthy();

    // "Go back" dismisses without recording a decision
    fireEvent.click(screen.getByRole('button', { name: /Go back/i }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).toBeFalsy(),
    );
    expect(recordGuardianDeferral).not.toHaveBeenCalled();

    // Re-open and click Skip anyway
    fireEvent.click(screen.getByTestId('guardian-defer'));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: /Skip anyway/i }));

    await waitFor(() => {
      expect(recordGuardianDeferral).toHaveBeenCalledTimes(1);
      expect(onDecision).toHaveBeenCalledWith({ kind: 'deferred' });
    });
  });

  it('removes a guardian via removeGuardian', async () => {
    listMyGuardians.mockResolvedValue([
      { id: 'g1', name: 'Ana', email: 'ana@example.com', createdAt: '2026-04-18T00:00:00Z' },
    ]);
    removeGuardian.mockResolvedValue({ ok: true });

    render(<GuardianSetupStep onDecision={vi.fn()} />);
    await screen.findByText('ana@example.com');

    fireEvent.click(screen.getByRole('button', { name: /Remove Ana/i }));
    await waitFor(() =>
      expect(removeGuardian).toHaveBeenCalledWith('g1'),
    );
  });

  it('surfaces server error text from addGuardian without advancing', async () => {
    listMyGuardians.mockResolvedValue([]);
    addGuardian.mockResolvedValue({ ok: false, error: 'This person is already on your list.' });

    render(<GuardianSetupStep onDecision={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText('guardian@example.com'), {
      target: { value: 'ana@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

    await waitFor(() =>
      expect(screen.getByText(/already on your list/i)).toBeTruthy(),
    );
  });
});
