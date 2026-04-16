/**
 * LobbyViewTabs tests.
 *
 * Covers:
 *   - Visibility gate (hidden when only Default visible)
 *   - Renders a tab per visible layout, preset/custom divider
 *   - Active tab gets aria-current="page"
 *   - onActivate fires when picking a non-active tab
 *   - + menu exposes Duplicate [active] + Start blank; Duplicate opens NameDialog
 *   - Custom tab ⋯ menu exposes Rename + Delete; Delete opens confirm dialog
 *
 * Dialog-level interactions (name input commit, confirm button) are covered
 * implicitly — the Dialog primitive has its own tests.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LobbyViewTabs } from '../LobbyViewTabs';
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

function renderTabs(
  overrides: Partial<React.ComponentProps<typeof LobbyViewTabs>> = {},
) {
  const props = {
    layouts: [presetDefault, presetSales, presetFinance, customA],
    activeLayoutId: 'sales',
    onActivate: vi.fn(),
    onDuplicatePreset: vi.fn(),
    onDuplicateActive: vi.fn(),
    onCreateBlank: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const utils = render(<LobbyViewTabs {...props} />);
  return { ...utils, props };
}

describe('LobbyViewTabs', () => {
  it('hides entirely when only Default is visible', () => {
    const { container } = render(
      <LobbyViewTabs
        layouts={[{ ...presetDefault, isActive: true }]}
        activeLayoutId="default"
        onActivate={vi.fn()}
        onDuplicatePreset={vi.fn()}
        onDuplicateActive={vi.fn()}
        onCreateBlank={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a tab per visible layout', () => {
    renderTabs();
    expect(screen.getByTestId('lobby-view-tab-default')).toBeTruthy();
    expect(screen.getByTestId('lobby-view-tab-sales')).toBeTruthy();
    expect(screen.getByTestId('lobby-view-tab-finance')).toBeTruthy();
    expect(screen.getByTestId(`lobby-view-tab-${customA.id}`)).toBeTruthy();
  });

  it('marks the active tab with aria-current="page"', () => {
    renderTabs();
    const sales = screen.getByTestId('lobby-view-tab-sales');
    expect(sales.getAttribute('aria-current')).toBe('page');
    const finance = screen.getByTestId('lobby-view-tab-finance');
    expect(finance.getAttribute('aria-current')).toBeNull();
  });

  it('fires onActivate with the picked id when switching tabs', () => {
    const { props } = renderTabs();
    fireEvent.click(screen.getByTestId('lobby-view-tab-finance'));
    expect(props.onActivate).toHaveBeenCalledWith('finance');
  });

  it('does not fire onActivate when clicking the already-active tab', () => {
    const { props } = renderTabs();
    fireEvent.click(screen.getByTestId('lobby-view-tab-sales'));
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it('+ menu shows Duplicate [active] and Start blank', () => {
    renderTabs();
    fireEvent.click(screen.getByTestId('lobby-view-tabs-add'));
    expect(
      screen.getByRole('button', { name: /duplicate "sales"/i }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /start blank/i })).toBeTruthy();
  });

  it('Duplicate on a preset opens the NameDialog', () => {
    renderTabs();
    fireEvent.click(screen.getByTestId('lobby-view-tabs-add'));
    fireEvent.click(screen.getByRole('button', { name: /duplicate "sales"/i }));
    expect(screen.getByRole('dialog', { name: /duplicate this view/i })).toBeTruthy();
  });

  it('Start blank opens the NameDialog in blank mode', () => {
    renderTabs();
    fireEvent.click(screen.getByTestId('lobby-view-tabs-add'));
    fireEvent.click(screen.getByRole('button', { name: /start blank/i }));
    expect(screen.getByRole('dialog', { name: /new blank view/i })).toBeTruthy();
  });

  it('Duplicate when a custom is active calls onDuplicateActive', () => {
    const { props } = renderTabs({ activeLayoutId: customA.id });
    fireEvent.click(screen.getByTestId('lobby-view-tabs-add'));
    fireEvent.click(
      screen.getByRole('button', { name: /duplicate "my review view"/i }),
    );
    expect(props.onDuplicateActive).toHaveBeenCalledTimes(1);
  });

  it('custom tab ⋯ menu shows Rename + Delete and Delete opens confirm', () => {
    renderTabs();
    const menuTrigger = screen.getByRole('button', { name: /view options/i });
    fireEvent.click(menuTrigger);
    expect(screen.getByRole('button', { name: /^rename$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = screen.getByRole('dialog', { name: /delete view/i });
    expect(dialog.textContent).toContain('My review view');
  });
});
