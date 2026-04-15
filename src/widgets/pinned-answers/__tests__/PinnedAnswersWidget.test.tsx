/**
 * PinnedAnswersWidget component tests.
 *
 * Phase 3.2 coverage: zero-state, read-only cards, "Open in Aion" click.
 * Phase 5.3 coverage: staleness nudge, error chip, Keep/Remove wiring, and
 * view-recording via IntersectionObserver dwell.
 *
 * happy-dom doesn't ship IntersectionObserver, so we stub a lightweight
 * scheduler that fires entry callbacks synchronously on observe() — the
 * dwell timer inside useInViewOnce is exercised via fake timers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ─── next/navigation router push — captured for assertion ─────────────────
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

// sonner is imported transitively by AnalyticsResultCard + our widget.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// pin-actions is a server-only module — widget + AnalyticsResultCard import
// from it. Stub savePin AND deletePin so the import chain resolves in jsdom.
vi.mock('@/app/(dashboard)/(features)/aion/actions/pin-actions', () => ({
  savePin: vi.fn(async () => ({ pinId: 'pin-ignored' })),
  deletePin: vi.fn(async () => undefined),
}));

// Phase 5.3 view-recording server action — stub so we can assert calls.
// vi.mock factories are hoisted above regular imports, so we use vi.hoisted
// to expose the spy to both the factory and the test body.
const { recordPinView } = vi.hoisted(() => ({
  recordPinView: vi.fn(async () => undefined),
}));
vi.mock('@/app/(dashboard)/(features)/aion/actions/pin-view-actions', () => ({
  recordPinView,
}));

import { PinnedAnswersWidget } from '../ui/PinnedAnswersWidget';
import type { LobbyPin } from '@/app/(dashboard)/(features)/aion/actions/pin-actions';
import { deletePin } from '@/app/(dashboard)/(features)/aion/actions/pin-actions';

// ─── IntersectionObserver stub ─────────────────────────────────────────────

type Observer = {
  observe: (el: Element) => void;
  unobserve: (el: Element) => void;
  disconnect: () => void;
  fire: (visible: boolean) => void;
};

const observers: Observer[] = [];

class StubIntersectionObserver implements Observer {
  private callback: IntersectionObserverCallback;
  private targets = new Set<Element>();
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    observers.push(this);
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
  fire(visible: boolean) {
    const entries = Array.from(this.targets).map(
      (target) => ({ isIntersecting: visible, target }) as IntersectionObserverEntry,
    );
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

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

const NOW = new Date('2026-04-14T12:00:00Z');

// 40 days ago for stale tests.
const daysAgo = (n: number): string =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

// ─── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  observers.length = 0;
  routerPush.mockClear();
  recordPinView.mockClear();
  (deletePin as unknown as ReturnType<typeof vi.fn>).mockClear();
  // Install the stub on the global.
  (globalThis as unknown as { IntersectionObserver: typeof StubIntersectionObserver })
    .IntersectionObserver = StubIntersectionObserver;
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('<PinnedAnswersWidget />', () => {
  it('renders nothing when no pins exist', () => {
    const { container } = render(<PinnedAnswersWidget pins={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a read-only card per pin', () => {
    render(
      <PinnedAnswersWidget
        pins={[pin(), pin({ pinId: 'pin-b', title: 'AR · 60+' })]}
        now={NOW}
      />,
    );
    // Read-only cards expose "Open in Aion" buttons in the header.
    const openBtns = screen.getAllByTestId('analytics-open-in-aion');
    expect(openBtns).toHaveLength(2);
    expect(screen.getByText('Your pins')).toBeTruthy();
  });

  it('routes to /aion?openPin=<id> on "Open in Aion" click', () => {
    render(<PinnedAnswersWidget pins={[pin({ pinId: 'pin-click' })]} now={NOW} />);
    fireEvent.click(screen.getByTestId('analytics-open-in-aion'));
    expect(routerPush).toHaveBeenCalledWith('/aion?openPin=pin-click');
  });

  it('falls back to "—" when a pin has no last_value.primary', () => {
    render(
      <PinnedAnswersWidget
        pins={[pin({ lastValue: { unit: 'currency' } })]}
        now={NOW}
      />,
    );
    const heroes = screen.getAllByTestId('analytics-hero-value');
    expect(heroes[0].textContent).toBe('—');
  });

  // ── Phase 5.3 ──

  it('renders the stale nudge when last_viewed_at is >30 days old', () => {
    render(
      <PinnedAnswersWidget
        pins={[
          pin({
            health: { lastViewedAt: daysAgo(40), lastError: null },
          }),
        ]}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('pinned-answer-stale-nudge')).toBeTruthy();
    expect(screen.getByText(/Haven't looked at this in a while/i)).toBeTruthy();
  });

  it('does not render the nudge for a freshly-viewed pin', () => {
    render(
      <PinnedAnswersWidget
        pins={[
          pin({
            health: { lastViewedAt: daysAgo(3), lastError: null },
          }),
        ]}
        now={NOW}
      />,
    );
    expect(screen.queryByTestId('pinned-answer-stale-nudge')).toBeNull();
  });

  it('renders the refresh-error chip when last_error is set', () => {
    render(
      <PinnedAnswersWidget
        pins={[
          pin({
            health: {
              lastViewedAt: daysAgo(3),
              lastError: { message: 'metric RPC timed out', at: NOW.toISOString() },
            },
          }),
        ]}
        now={NOW}
      />,
    );
    const chip = screen.getByTestId('pinned-answer-error-chip');
    expect(chip.textContent).toContain("Couldn't refresh");
    expect(chip.textContent).toContain('metric RPC timed out');
  });

  it('dismisses the nudge and records a view when Keep is clicked', () => {
    render(
      <PinnedAnswersWidget
        pins={[
          pin({
            pinId: 'pin-keep',
            health: { lastViewedAt: daysAgo(40), lastError: null },
          }),
        ]}
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByTestId('pinned-answer-keep'));
    expect(recordPinView).toHaveBeenCalledWith('pin-keep');
    expect(screen.queryByTestId('pinned-answer-stale-nudge')).toBeNull();
  });

  it('calls deletePin and filters the card out when Remove is clicked', async () => {
    render(
      <PinnedAnswersWidget
        pins={[
          pin({
            pinId: 'pin-rm',
            health: { lastViewedAt: daysAgo(40), lastError: null },
          }),
        ]}
        now={NOW}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('pinned-answer-remove'));
    });
    expect(deletePin).toHaveBeenCalledWith('pin-rm');
    // Pin was the only one — section should unmount on empty.
    expect(screen.queryByTestId('pinned-answers-widget')).toBeNull();
  });

  it('records a view after the dwell timer elapses on visibility', () => {
    vi.useFakeTimers();
    render(
      <PinnedAnswersWidget
        pins={[pin({ pinId: 'pin-view' })]}
        now={NOW}
      />,
    );
    // Simulate the element becoming visible.
    act(() => {
      observers[0]?.fire(true);
    });
    // Dwell timer hasn't fired yet.
    expect(recordPinView).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(recordPinView).toHaveBeenCalledWith('pin-view');
  });
});
