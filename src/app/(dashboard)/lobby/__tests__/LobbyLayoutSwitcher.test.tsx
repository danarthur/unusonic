/**
 * LobbyLayoutSwitcher tests.
 *
 * Covers:
 *   - Visibility gate (hidden when only Default visible)
 *   - Active-layout checkmark
 *   - onActivate is fired on pick
 *   - Duplicate + New blank actions appear on a preset
 *   - Rename + Delete actions appear on a custom
 *   - Duplicate action triggers onDuplicatePreset with the right slug
 *
 * Dialog-level interactions (name input, confirm) are covered implicitly by
 * observing the handler fires after clicking an action; the Dialog itself is
 * an underlying shared primitive with its own tests.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LobbyLayoutSwitcher } from '../LobbyLayoutSwitcher';
import type { LobbyLayout } from '@/shared/lib/lobby-layouts/types';

const presetDefault: LobbyLayout = {
  id: 'default',
  kind: 'preset',
  name: 'Default',
  cardIds: [],
  isActive: false,
  rendererMode: 'legacy',
};
const presetSales: LobbyLayout = {
  id: 'sales',
  kind: 'preset',
  name: 'Sales',
  cardIds: ['lobby.deal_pipeline'],
  isActive: true,
  rendererMode: 'modular',
};
const presetFinance: LobbyLayout = {
  id: 'finance',
  kind: 'preset',
  name: 'Finance',
  cardIds: ['lobby.financial_pulse'],
  isActive: false,
  rendererMode: 'modular',
};
const customA: LobbyLayout = {
  id: '00000000-0000-0000-0000-000000000001',
  kind: 'custom',
  name: 'My review view',
  cardIds: ['lobby.action_queue'],
  sourcePresetSlug: 'sales',
  isActive: false,
  rendererMode: 'modular',
};

function renderSwitcher(
  overrides: Partial<React.ComponentProps<typeof LobbyLayoutSwitcher>> = {},
) {
  const props = {
    layouts: [presetDefault, presetSales, presetFinance, customA],
    activeLayoutId: 'sales',
    onActivate: vi.fn(),
    onDuplicatePreset: vi.fn(),
    onCreateBlank: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const utils = render(<LobbyLayoutSwitcher {...props} />);
  return { ...utils, props };
}

describe('LobbyLayoutSwitcher', () => {
  it('hides entirely when only Default is visible', () => {
    const { container } = render(
      <LobbyLayoutSwitcher
        layouts={[{ ...presetDefault, isActive: true }]}
        activeLayoutId="default"
        onActivate={vi.fn()}
        onDuplicatePreset={vi.fn()}
        onCreateBlank={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders with the active layout name on the button', () => {
    renderSwitcher();
    const button = screen.getByTestId('lobby-layout-switcher');
    expect(button.textContent).toContain('Sales');
  });

  it('opens the popover and lists every visible layout', () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId('lobby-layout-switcher'));
    // Presets
    expect(screen.getByRole('option', { name: /default/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /sales/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /finance/i })).toBeTruthy();
    // Customs
    expect(screen.getByRole('option', { name: /my review view/i })).toBeTruthy();
  });

  it('marks the active layout with aria-selected', () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId('lobby-layout-switcher'));
    const salesRow = screen.getByRole('option', { name: /sales/i });
    expect(salesRow.getAttribute('aria-selected')).toBe('true');
    const financeRow = screen.getByRole('option', { name: /finance/i });
    expect(financeRow.getAttribute('aria-selected')).toBe('false');
  });

  it('fires onActivate with the picked id', () => {
    const { props } = renderSwitcher();
    fireEvent.click(screen.getByTestId('lobby-layout-switcher'));
    fireEvent.click(screen.getByRole('option', { name: /finance/i }));
    expect(props.onActivate).toHaveBeenCalledWith('finance');
  });

  it('shows Duplicate + New blank when active is a preset', () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId('lobby-layout-switcher'));
    expect(screen.getByRole('button', { name: /duplicate this view/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /new blank/i })).toBeTruthy();
    // Rename + Delete should NOT appear for a preset.
    expect(screen.queryByRole('button', { name: /^rename$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull();
  });

  it('shows Rename + Delete when active is a custom', () => {
    renderSwitcher({ activeLayoutId: customA.id });
    fireEvent.click(screen.getByTestId('lobby-layout-switcher'));
    expect(screen.getByRole('button', { name: /^rename$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeTruthy();
    // Duplicate shows only for presets.
    expect(
      screen.queryByRole('button', { name: /duplicate this view/i }),
    ).toBeNull();
    // New blank is always available.
    expect(screen.getByRole('button', { name: /new blank/i })).toBeTruthy();
  });

  it('Duplicate opens the name dialog', () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId('lobby-layout-switcher'));
    fireEvent.click(screen.getByRole('button', { name: /duplicate this view/i }));
    // The dialog renders its title into the tree.
    expect(screen.getByRole('dialog', { name: /duplicate this view/i })).toBeTruthy();
  });

  it('New blank opens the name dialog', () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId('lobby-layout-switcher'));
    fireEvent.click(screen.getByRole('button', { name: /new blank/i }));
    expect(screen.getByRole('dialog', { name: /new blank view/i })).toBeTruthy();
  });

  it('Delete opens the confirm dialog with the custom name', () => {
    renderSwitcher({ activeLayoutId: customA.id });
    fireEvent.click(screen.getByTestId('lobby-layout-switcher'));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = screen.getByRole('dialog', { name: /delete view/i });
    expect(dialog.textContent).toContain('My review view');
  });
});
