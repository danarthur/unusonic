/**
 * Phase 3.2 — PinnedAnswersWidget component tests.
 *
 * Verifies the widget renders nothing on zero pins, renders a read-only
 * AnalyticsResultCard per pin, and the "Open in Aion" click fires through the
 * router push we wire in production.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// next/navigation router push — captured for assertion.
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

// sonner is imported transitively by AnalyticsResultCard.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// pin-actions is a server-only module — AnalyticsResultCard imports savePin.
// Stub so the import chain resolves in jsdom.
vi.mock('@/app/(dashboard)/(features)/aion/actions/pin-actions', () => ({
  savePin: vi.fn(async () => ({ pinId: 'pin-ignored' })),
}));

import { PinnedAnswersWidget } from '../ui/PinnedAnswersWidget';
import type { LobbyPin } from '@/app/(dashboard)/(features)/aion/actions/pin-actions';

const pin = (overrides: Partial<LobbyPin> = {}): LobbyPin => ({
  pinId: 'pin-a',
  title: 'Revenue · Live Nation',
  metricId: 'finance.revenue_collected',
  args: { client_id: 'abc' },
  cadence: 'hourly',
  lastValue: { primary: '$128,400', unit: 'currency', secondary: '3 payments' },
  lastRefreshedAt: '2026-04-14T09:00:00Z',
  position: 0,
  ...overrides,
});

describe('<PinnedAnswersWidget />', () => {
  it('renders nothing when no pins exist', () => {
    const { container } = render(<PinnedAnswersWidget pins={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a read-only card per pin', () => {
    render(
      <PinnedAnswersWidget
        pins={[pin(), pin({ pinId: 'pin-b', title: 'AR · 60+' })]}
      />,
    );
    // Read-only cards expose "Open in Aion" buttons in the header.
    const openBtns = screen.getAllByTestId('analytics-open-in-aion');
    expect(openBtns).toHaveLength(2);
    expect(screen.getByText('Your pins')).toBeTruthy();
  });

  it('routes to /aion?openPin=<id> on "Open in Aion" click', () => {
    routerPush.mockClear();
    render(<PinnedAnswersWidget pins={[pin({ pinId: 'pin-click' })]} />);
    fireEvent.click(screen.getByTestId('analytics-open-in-aion'));
    expect(routerPush).toHaveBeenCalledWith('/aion?openPin=pin-click');
  });

  it('falls back to "—" when a pin has no last_value.primary', () => {
    render(
      <PinnedAnswersWidget
        pins={[pin({ lastValue: { unit: 'currency' } })]}
      />,
    );
    // The hero span renders "—" as a fallback.
    const heroes = screen.getAllByTestId('analytics-hero-value');
    expect(heroes[0].textContent).toBe('—');
  });
});
