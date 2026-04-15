/**
 * Component tests for AnalyticsResultCard (Phase 3.1).
 *
 * Covers the locked renderer contract in
 * docs/reference/pages/reports-analytics-result-design.md §2–§3:
 *  - Hero value size + tabular-nums
 *  - Comparison sentiment color
 *  - Sparkline hidden when chart is present
 *  - Empty / error states
 *  - Non-editable pills visually distinct
 *  - Pill click emits a synthetic [arg-edit] message
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Framer + sonner mocks keep the DOM deterministic.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// pin-actions is a server-only module — mock before importing the card.
const hoistedPin = vi.hoisted(() => ({
  savePinMock: vi.fn(async (_input: unknown) => ({ pinId: 'pin-new' })),
}));
const savePinMock = hoistedPin.savePinMock;
vi.mock('../../actions/pin-actions', () => ({
  savePin: hoistedPin.savePinMock,
}));

import { AnalyticsResultCard } from '../AnalyticsResultCard';
import type { AnalyticsResult } from '../../lib/aion-chat-types';

const baseResult = (overrides: Partial<AnalyticsResult> = {}): AnalyticsResult => ({
  type: 'analytics_result',
  text: '',
  metricId: 'finance.revenue_collected',
  title: 'Revenue collected',
  args: { period_start: '2026-01-01', period_end: '2026-04-14' },
  value: { primary: '$128,400', unit: 'currency' },
  pills: [
    {
      key: 'period',
      label: '2026-01-01 → 2026-04-14',
      value: { period_start: '2026-01-01', period_end: '2026-04-14' },
      editable: true,
      choiceSetKey: 'period',
    },
  ],
  pinnable: true,
  freshness: { computedAt: new Date().toISOString(), cadence: 'hourly' },
  ...overrides,
});

describe('<AnalyticsResultCard />', () => {
  it('renders the primary value in the hero slot with tabular-nums', () => {
    render(<AnalyticsResultCard result={baseResult()} />);
    const hero = screen.getByTestId('analytics-hero-value');
    expect(hero.textContent).toBe('$128,400');
    expect(hero.className).toContain('tabular-nums');
    expect(hero.className).toContain('text-3xl');
  });

  it('renders comparison delta with the sentiment exposed', () => {
    render(
      <AnalyticsResultCard
        result={baseResult({
          comparison: {
            label: 'vs last quarter',
            delta: '+12.4%',
            direction: 'up',
            sentiment: 'positive',
          },
        })}
      />,
    );
    const delta = screen.getByTestId('analytics-comparison-delta');
    expect(delta.textContent).toContain('+12.4%');
    expect(delta.getAttribute('data-sentiment')).toBe('positive');
  });

  it('hides the sparkline when a chart payload is present', () => {
    render(
      <AnalyticsResultCard
        result={baseResult({
          sparkline: [1, 2, 3, 4, 5, 6, 7, 8],
          chart: {
            chartType: 'area',
            data: [
              { label: 'A', value: 1 },
              { label: 'B', value: 2 },
            ],
          },
        })}
      />,
    );
    // The sparkline lives in the value row (sibling of the hero number).
    // When a chart is present the value row must contain no svg at all —
    // trend/icon svgs live elsewhere (comparison row has no TrendingUp for
    // this case since there's no comparison) and the chart's svg lives in
    // a nested StagePanel sibling.
    const hero = screen.getByTestId('analytics-hero-value');
    const valueRow = hero.parentElement!;
    expect(valueRow.querySelector('svg')).toBeNull();
  });

  it('renders the sparkline when no chart is present and length >= 7', () => {
    const { container } = render(
      <AnalyticsResultCard
        result={baseResult({ sparkline: [1, 2, 3, 4, 5, 6, 7, 8] })}
      />,
    );
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('drops the sparkline silently when length < 7', () => {
    const { container } = render(
      <AnalyticsResultCard result={baseResult({ sparkline: [1, 2, 3] })} />,
    );
    // No svg from sparkline; icons in pills/header may still render, but the value row has none.
    const valueRow = screen.getByTestId('analytics-hero-value').parentElement!;
    expect(valueRow.querySelector('svg')).toBeNull();
  });

  it('renders the empty-state block when result.empty is set', () => {
    render(
      <AnalyticsResultCard
        result={baseResult({
          empty: {
            title: 'No payments yet',
            body: 'Payments received in this period will roll up here.',
          },
        })}
      />,
    );
    expect(screen.getByText('No payments yet')).toBeTruthy();
    expect(screen.getByText(/Payments received/)).toBeTruthy();
    // Hero value must NOT render in empty state.
    expect(screen.queryByTestId('analytics-hero-value')).toBeNull();
  });

  it('renders the error state with an error stripe', () => {
    const { container } = render(
      <AnalyticsResultCard
        result={baseResult({ error: { message: 'Could not compute that.' } })}
      />,
    );
    expect(screen.getByText('Could not compute that.')).toBeTruthy();
    // The stripe applies a stage-stripe-error class on the StagePanel.
    expect(container.querySelector('.stage-stripe-error')).toBeTruthy();
  });

  it('non-editable pills are visually distinct (no chevron, opacity-70)', () => {
    render(
      <AnalyticsResultCard
        result={baseResult({
          pills: [
            {
              key: 'workspace_id',
              label: 'Workspace: acme',
              value: 'acme',
              editable: false,
            },
          ],
        })}
      />,
    );
    const locked = screen.getByTestId('analytics-pill-locked');
    expect(locked.className).toContain('opacity-70');
    expect(locked.className).toContain('cursor-default');
  });

  it('unsupported-editable pills render as disabled with a tooltip', () => {
    render(
      <AnalyticsResultCard
        result={baseResult({
          pills: [
            {
              key: 'client_id',
              label: 'Live Nation',
              value: 'abc',
              editable: true,
              choiceSetKey: 'client',
            },
          ],
        })}
      />,
    );
    const unsupported = screen.getByTestId('analytics-pill-unsupported');
    expect(unsupported.getAttribute('title')).toBe('Not editable in this release');
    expect(unsupported.className).toContain('opacity-70');
  });

  it('pill click dispatches a synthetic [arg-edit] message through onArgEdit', () => {
    const onArgEdit = vi.fn();
    render(<AnalyticsResultCard result={baseResult()} onArgEdit={onArgEdit} />);

    // Open the period pill.
    const pill = screen.getByTestId('analytics-pill-editable');
    fireEvent.click(pill);

    // Pick "Last 30 days".
    const choice = screen.getByText('Last 30 days');
    fireEvent.click(choice);

    expect(onArgEdit).toHaveBeenCalledTimes(1);
    const message = onArgEdit.mock.calls[0][0] as string;
    expect(message.startsWith('[arg-edit] finance.revenue_collected period=')).toBe(true);
    // Payload JSON carries both period_start + period_end.
    const payload = JSON.parse(message.slice(message.indexOf('period=') + 7));
    expect(payload.period_start).toBeDefined();
    expect(payload.period_end).toBeDefined();
  });
});

// =============================================================================
// Phase 3.2 — Pin button + confirm row + read-only mode
// =============================================================================

describe('<AnalyticsResultCard /> — pin button (Phase 3.2)', () => {
  it('hides the Pin button when pinEnabled is false', () => {
    render(<AnalyticsResultCard result={baseResult({ pinEnabled: false })} />);
    expect(screen.queryByTestId('analytics-pin-button')).toBeNull();
  });

  it('hides the Pin button when pinnable is false', () => {
    render(
      <AnalyticsResultCard
        result={baseResult({ pinEnabled: true, pinnable: false })}
      />,
    );
    expect(screen.queryByTestId('analytics-pin-button')).toBeNull();
  });

  it('renders the Pin button when pinEnabled and pinnable are both true', () => {
    render(<AnalyticsResultCard result={baseResult({ pinEnabled: true })} />);
    const btn = screen.getByTestId('analytics-pin-button');
    expect(btn.getAttribute('aria-label')).toBe('Pin to Lobby');
    expect(btn.getAttribute('data-pin-state')).toBe('unpinned');
  });

  it('switches to "Update pin" label when pinId is set on the result', () => {
    render(
      <AnalyticsResultCard
        result={baseResult({ pinEnabled: true, pinId: 'pin-existing' })}
      />,
    );
    const btn = screen.getByTestId('analytics-pin-button');
    expect(btn.getAttribute('aria-label')).toBe('Update pin');
    expect(btn.getAttribute('data-pin-state')).toBe('pinned');
  });

  it('reveals the confirm row on Pin click', () => {
    render(<AnalyticsResultCard result={baseResult({ pinEnabled: true })} />);
    fireEvent.click(screen.getByTestId('analytics-pin-button'));
    expect(screen.getByTestId('analytics-pin-confirm')).toBeTruthy();
    expect(screen.getByTestId('analytics-pin-cancel')).toBeTruthy();
    expect(screen.getByTestId('analytics-pin-confirm-btn')).toBeTruthy();
  });

  it('calls savePin with mapped title/cadence/initial value on confirm', async () => {
    savePinMock.mockClear();
    render(<AnalyticsResultCard result={baseResult({ pinEnabled: true })} />);
    fireEvent.click(screen.getByTestId('analytics-pin-button'));
    fireEvent.click(screen.getByTestId('analytics-pin-confirm-btn'));
    await waitFor(() => expect(savePinMock).toHaveBeenCalledTimes(1));
    const firstCall = savePinMock.mock.calls[0] as unknown[];
    const input = firstCall[0] as {
      title: string;
      metricId: string;
      cadence: string;
      initialValue: { primary: string };
    };
    expect(input.title).toBe('Revenue collected');
    expect(input.metricId).toBe('finance.revenue_collected');
    expect(input.cadence).toBe('hourly');
    expect(input.initialValue.primary).toBe('$128,400');
  });

  it('in read-only mode renders "Open in Aion" and hides the Pin button', () => {
    render(
      <AnalyticsResultCard
        result={baseResult({ pinEnabled: true, pinId: 'pin-1' })}
        readOnly
      />,
    );
    expect(screen.queryByTestId('analytics-pin-button')).toBeNull();
    expect(screen.getByTestId('analytics-open-in-aion')).toBeTruthy();
  });

  it('in read-only mode hides the pills row', () => {
    render(
      <AnalyticsResultCard
        result={baseResult({ pinEnabled: true, pinId: 'pin-1' })}
        readOnly
      />,
    );
    expect(screen.queryByTestId('analytics-pill-editable')).toBeNull();
  });

  it('fires onOpenInAion when the read-only "Open in Aion" button is clicked', () => {
    const onOpen = vi.fn();
    render(
      <AnalyticsResultCard
        result={baseResult({ pinEnabled: true, pinId: 'pin-1' })}
        readOnly
        onOpenInAion={onOpen}
      />,
    );
    fireEvent.click(screen.getByTestId('analytics-open-in-aion'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
