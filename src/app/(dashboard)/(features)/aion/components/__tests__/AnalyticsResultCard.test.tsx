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
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalyticsResultCard } from '../AnalyticsResultCard';
import type { AnalyticsResult } from '../../lib/aion-chat-types';

// Framer + sonner mocks keep the DOM deterministic.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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
