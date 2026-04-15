/**
 * Empty-state coverage for RevenueTrendWidget — Phase 2.5.
 *
 * Registry copy says "Revenue trend appears once you have at least two months
 * of paid invoices." The widget enforces this threshold: fewer than 2 months
 * with revenue > 0 is treated as empty.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevenueTrendWidget } from '../ui/RevenueTrendWidget';
import { METRICS } from '@/shared/lib/metrics/registry';

const EMPTY_COPY = METRICS['lobby.revenue_trend'].emptyState.body;

describe('<RevenueTrendWidget />', () => {
  it('renders registry empty copy when months list is empty', () => {
    render(<RevenueTrendWidget data={{ months: [] }} loading={false} />);
    expect(screen.getByText(EMPTY_COPY)).toBeTruthy();
  });

  it('renders registry empty copy when only one month has revenue', () => {
    render(
      <RevenueTrendWidget
        data={{ months: [{ label: 'Jan', revenue: 12_000 }] }}
        loading={false}
      />,
    );
    expect(screen.getByText(EMPTY_COPY)).toBeTruthy();
  });

  it('does NOT render empty copy when loading', () => {
    render(<RevenueTrendWidget data={{ months: [] }} loading={true} />);
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });

  it('does NOT render empty copy once two months have revenue', () => {
    render(
      <RevenueTrendWidget
        data={{
          months: [
            { label: 'Jan', revenue: 10_000 },
            { label: 'Feb', revenue: 14_000 },
          ],
        }}
        loading={false}
      />,
    );
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });
});
