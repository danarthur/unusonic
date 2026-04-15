/**
 * Phase 2.3 — LayoutControls component tests.
 *
 * Covers the edit-mode toggle, reset confirmation flow, cap indicator
 * rendering, and the Add-card disabled state at cap. Drag mechanics are
 * intentionally not tested here (see LobbyBentoGrid manual smoke checklist).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutControls } from '../LayoutControls';

function renderControls(overrides: Partial<React.ComponentProps<typeof LayoutControls>> = {}) {
  const props = {
    editMode: false,
    onToggleEdit: vi.fn(),
    onReset: vi.fn(),
    onAddCard: vi.fn(),
    cardCount: 0,
    cap: 12,
    ...overrides,
  };
  const utils = render(<LayoutControls {...props} />);
  return { ...utils, props };
}

describe('LayoutControls', () => {
  it('shows "Edit layout" by default and calls onToggleEdit when clicked', () => {
    const { props } = renderControls();
    const btn = screen.getByRole('button', { name: /edit layout/i });
    fireEvent.click(btn);
    expect(props.onToggleEdit).toHaveBeenCalledTimes(1);
  });

  it('switches to "Done" label when editMode is true', () => {
    renderControls({ editMode: true });
    expect(screen.getByRole('button', { name: /done editing layout/i })).toBeTruthy();
  });

  it('hides reset / add-card / count when not in edit mode', () => {
    renderControls({ editMode: false, cardCount: 5 });
    expect(screen.queryByRole('button', { name: /reset layout/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add card/i })).toBeNull();
    expect(screen.queryByText(/5 of 12/)).toBeNull();
  });

  it('renders cap indicator at 0/12, 8/12, and 12/12 in edit mode', () => {
    const a = renderControls({ editMode: true, cardCount: 0 });
    expect(screen.getByText('0 of 12')).toBeTruthy();
    a.unmount();

    const b = renderControls({ editMode: true, cardCount: 8 });
    expect(screen.getByText('8 of 12')).toBeTruthy();
    b.unmount();

    renderControls({ editMode: true, cardCount: 12 });
    expect(screen.getByText('12 of 12')).toBeTruthy();
  });

  it('disables the Add-card button at cap', () => {
    const { props } = renderControls({ editMode: true, cardCount: 12, cap: 12 });
    const btn = screen.getByRole('button', { name: /at cap/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(props.onAddCard).not.toHaveBeenCalled();
  });

  it('enables the Add-card button below cap and fires onAddCard', () => {
    const { props } = renderControls({ editMode: true, cardCount: 5, cap: 12 });
    const btn = screen.getByRole('button', { name: /add card from library/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    expect(props.onAddCard).toHaveBeenCalledTimes(1);
  });

  it('requires a confirmation click before firing onReset', () => {
    const { props } = renderControls({ editMode: true, cardCount: 5 });
    const btn = screen.getByRole('button', { name: /reset layout to defaults/i });
    fireEvent.click(btn);
    expect(props.onReset).not.toHaveBeenCalled();
    // Now the same button should be in confirm state.
    const confirm = screen.getByRole('button', { name: /confirm reset to defaults/i });
    fireEvent.click(confirm);
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it('drops the confirm prompt when edit mode flips off', () => {
    const { rerender, props } = renderControls({ editMode: true, cardCount: 5 });
    fireEvent.click(screen.getByRole('button', { name: /reset layout to defaults/i }));
    expect(screen.getByRole('button', { name: /confirm reset to defaults/i })).toBeTruthy();

    rerender(
      <LayoutControls
        {...props}
        editMode={false}
        cardCount={5}
      />,
    );
    rerender(
      <LayoutControls
        {...props}
        editMode={true}
        cardCount={5}
      />,
    );
    // Should be back to the un-confirmed label.
    expect(screen.getByRole('button', { name: /reset layout to defaults/i })).toBeTruthy();
  });
});
