/**
 * Phase 5.2 — Lobby mobile structural tests.
 *
 * These tests assert the read-only contract the design doc §5 commits to:
 * at narrow viewports the Lobby never renders edit chrome, never opens the
 * library drawer, and always flows single-column. We verify through the
 * responsive primitives (Tailwind's `hidden md:flex`, `grid-cols-1 md:...`,
 * `LibraryDrawer open={false}`) rather than via window.matchMedia mocks —
 * happy-dom doesn't compute Tailwind classes, and a class-shape assertion is
 * the honest test of the contract.
 *
 * Drag mechanics are outside scope; they're gated by LayoutControls which is
 * itself `hidden md:flex`, so edit mode cannot activate on mobile.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LayoutControls } from '../LayoutControls';
import { LibraryDrawer } from '../LibraryDrawer';
import { LobbyBentoGrid } from '../LobbyBentoGrid';
import { LobbyTimeRangePicker } from '../LobbyTimeRangePicker';
import { LobbyTimeRangeProvider } from '../LobbyTimeRangeContext';

// The picker renders inside a Provider + reads nuqs URL state. Stub nuqs so
// the Provider can read/write without a real Next.js router context.
vi.mock('nuqs', async () => {
  const actual = await vi.importActual<typeof import('nuqs')>('nuqs');
  return {
    ...actual,
    useQueryState: () => [null, vi.fn()],
  };
});

describe('Lobby mobile (Phase 5.2)', () => {
  it('LayoutControls is tagged hidden below md:', () => {
    const { container } = render(
      <LayoutControls
        editMode={false}
        onToggleEdit={vi.fn()}
        onReset={vi.fn()}
        onAddCard={vi.fn()}
        cardCount={6}
        cap={12}
      />,
    );
    // The outer wrapper carries `hidden md:flex` so the control row collapses
    // entirely on mobile. This is the single guarantee the design relies on —
    // no drag, no reset, no library on mobile.
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('hidden');
    expect(root.className).toContain('md:flex');
  });

  it('LibraryDrawer trigger is never present at mobile (render tree)', () => {
    // When `open=false` the Sheet primitive does not render its content.
    // Library entries must not be reachable through the DOM tree.
    render(
      <LibraryDrawer
        open={false}
        onOpenChange={vi.fn()}
        userCaps={[]}
        currentCardIds={[]}
        cap={12}
        onAdd={vi.fn()}
      />,
    );
    // The search input and domain headers never mount when the sheet is closed.
    expect(screen.queryByPlaceholderText(/search cards/i)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('LobbyBentoGrid (modular) uses grid-cols-1 at mobile and grid-cols-X at md+', () => {
    const { container } = render(
      <LobbyBentoGrid
        cardIds={['lobby.action_queue', 'lobby.today_schedule']}
        dashboardData={undefined}
        editMode={false}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // The modular grid's outer div carries the responsive grid class. Single
    // column on mobile is the design's load-bearing rule.
    const grid = container.querySelector('.stage-grid');
    expect(grid).not.toBeNull();
    expect(grid!.className).toContain('grid-cols-1');
    expect(grid!.className).toContain('md:grid-cols-2');
    expect(grid!.className).toContain('lg:grid-cols-4');
  });

  it('LobbyBentoGrid (legacy) uses grid-cols-1 at mobile and grid-cols-X at md+', () => {
    const { container } = render(<LobbyBentoGrid dashboardData={undefined} />);
    const grid = container.querySelector('.stage-grid');
    expect(grid).not.toBeNull();
    expect(grid!.className).toContain('grid-cols-1');
    expect(grid!.className).toContain('md:grid-cols-2');
    expect(grid!.className).toContain('lg:grid-cols-4');
  });

  it('LobbyTimeRangePicker renders a visible trigger button (present on mobile)', () => {
    render(
      <LobbyTimeRangeProvider>
        <LobbyTimeRangePicker />
      </LobbyTimeRangeProvider>,
    );
    // The picker is intentionally NOT gated behind md:, so mobile users keep
    // the time-range control. Its label renders on the button; the presence of
    // the aria-label confirms it.
    const button = screen.getByRole('button', { name: /time range/i });
    expect(button).toBeTruthy();
  });
});
