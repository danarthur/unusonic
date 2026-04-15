/**
 * Empty-state coverage for FinancialPulseWidget — Phase 2.5.
 *
 * Empty when all three counters are zero: revenue, outstanding, overdue.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FinancialPulseWidget } from '../ui/FinancialPulseWidget';
import { METRICS } from '@/shared/lib/metrics/registry';
import type { FinancialPulseDTO } from '@/widgets/dashboard/api';

const EMPTY_COPY = METRICS['lobby.financial_pulse'].emptyState.body;

const EMPTY: FinancialPulseDTO = {
  revenueThisMonth: 0,
  revenueLastMonth: 0,
  revenueDelta: 0,
  outstandingTotal: 0,
  outstandingCount: 0,
  overdueTotal: 0,
  overdueCount: 0,
};

const POPULATED: FinancialPulseDTO = {
  ...EMPTY,
  revenueThisMonth: 1_200_000,
  revenueDelta: 12,
  outstandingTotal: 400_000,
  outstandingCount: 3,
};

describe('<FinancialPulseWidget />', () => {
  it('renders registry empty copy when data is undefined', () => {
    render(<FinancialPulseWidget loading={false} />);
    expect(screen.getByText(EMPTY_COPY)).toBeTruthy();
  });

  it('renders registry empty copy when every counter is zero', () => {
    render(<FinancialPulseWidget data={EMPTY} loading={false} />);
    expect(screen.getByText(EMPTY_COPY)).toBeTruthy();
  });

  it('does NOT render empty copy when loading', () => {
    render(<FinancialPulseWidget data={EMPTY} loading={true} />);
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });

  it('does NOT render empty copy when data has revenue', () => {
    render(<FinancialPulseWidget data={POPULATED} loading={false} />);
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });
});
