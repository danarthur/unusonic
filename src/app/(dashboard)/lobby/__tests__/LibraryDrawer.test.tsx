/**
 * Phase 2.3 — LibraryDrawer tests.
 *
 * Drag mechanics aren't covered here (see LobbyBentoGrid manual smoke
 * checklist). These tests focus on the pure pickable filter and the
 * rendering / interaction surface of the drawer.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LibraryDrawer, pickableForViewer } from '../LibraryDrawer';
import type { CapabilityKey } from '@/shared/lib/permission-registry';

const ALL_CAPS = [
  'finance:view',
  'finance:reconcile',
  'planning:view',
  'ros:view',
  'deals:read:global',
  'workspace:team:manage',
  'workspace:owner',
  'tier:aion:active',
] as CapabilityKey[];

describe('pickableForViewer', () => {
  it('omits cards already on the user\'s lobby', () => {
    const result = pickableForViewer(ALL_CAPS, ['lobby.action_queue']);
    expect(result.find((d) => d.id === 'lobby.action_queue')).toBeUndefined();
  });

  it('omits unpickable widget entries (sheets, banners, page grids)', () => {
    const result = pickableForViewer(ALL_CAPS, []);
    const ids = result.map((d) => d.id);
    expect(ids).not.toContain('lobby.org_dashboard');
    expect(ids).not.toContain('lobby.event_dashboard');
    expect(ids).not.toContain('lobby.network_detail');
    expect(ids).not.toContain('lobby.onboarding');
    expect(ids).not.toContain('lobby.design_showcase');
    expect(ids).not.toContain('lobby.run_of_show');
  });

  it('omits scalar/table metrics that lack a widgetKey', () => {
    const result = pickableForViewer(ALL_CAPS, []);
    const ids = result.map((d) => d.id);
    // Pure scalar metric without widgetKey — Phase 3 renders these.
    expect(ids).not.toContain('finance.revenue_collected');
    expect(ids).not.toContain('finance.ar_aged_60plus');
    // Pure table metric without widgetKey.
    expect(ids).not.toContain('finance.unreconciled_payments');
  });

  it('keeps RPC-backed metrics that DO carry a widgetKey', () => {
    const result = pickableForViewer(ALL_CAPS, []);
    const ids = result.map((d) => d.id);
    expect(ids).toContain('finance.qbo_variance');
  });

  it('drops cards the viewer lacks capability for', () => {
    const noFinance = pickableForViewer(
      ['planning:view', 'ros:view'] as CapabilityKey[],
      [],
    );
    const ids = noFinance.map((d) => d.id);
    expect(ids).not.toContain('lobby.financial_pulse');
    expect(ids).not.toContain('finance.qbo_variance');
    expect(ids).toContain('lobby.today_schedule');
  });
});

describe('LibraryDrawer', () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    userCaps: ALL_CAPS,
    currentCardIds: [] as string[],
    cap: 12,
    onAdd: vi.fn(),
  };

  it('renders the drawer title', () => {
    render(<LibraryDrawer {...baseProps} />);
    expect(screen.getByText('Card library')).toBeTruthy();
  });

  it('filters out cards already on the user\'s lobby', () => {
    render(
      <LibraryDrawer
        {...baseProps}
        currentCardIds={['lobby.today_schedule']}
      />,
    );
    // "Today" is the title for lobby.today_schedule — should be absent.
    expect(screen.queryByText('Today')).toBeNull();
    // Week strip(s) should still be there — three registry entries share the
    // "This week" title (schedule-strip, this-week-tally, another week card).
    expect(screen.getAllByText('This week').length).toBeGreaterThan(0);
  });

  it('narrows the list when the search box is used', () => {
    render(<LibraryDrawer {...baseProps} />);
    expect(screen.getAllByText('This week').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Search cards'), {
      target: { value: 'velocity' },
    });
    // Pipeline velocity matches by title.
    expect(screen.getByText('Pipeline velocity')).toBeTruthy();
    // "This week" cards no longer match the velocity search term.
    expect(screen.queryByText('This week')).toBeNull();
  });

  it('calls onAdd with the registry id when a row is clicked', () => {
    const onAdd = vi.fn();
    render(<LibraryDrawer {...baseProps} onAdd={onAdd} />);
    // Use the description text to disambiguate from the domain heading and
    // any other title that contains "Today".
    const titleEl = screen.getByText(
      /Events, calls, and load-ins scheduled for today/i,
    );
    const row = titleEl.closest('button');
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLButtonElement);
    expect(onAdd).toHaveBeenCalledWith('lobby.today_schedule');
  });

  it('disables rows when at cap and never fires onAdd', () => {
    const onAdd = vi.fn();
    render(
      <LibraryDrawer
        {...baseProps}
        onAdd={onAdd}
        currentCardIds={Array.from({ length: 12 }, (_, i) => `placeholder-${i}`)}
        cap={12}
      />,
    );
    const rows = screen.getAllByRole('button');
    // Find a card-row button (not the close/search). Card rows have a title attr
    // when at cap.
    const capped = rows.find((r) =>
      (r.getAttribute('title') ?? '').includes('At cap'),
    );
    expect(capped).toBeDefined();
    expect((capped as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(capped as HTMLButtonElement);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
