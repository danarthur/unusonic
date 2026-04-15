/**
 * Component tests for SettlementTrackingWidget (Phase 5.1).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettlementTrackingWidget } from '../index';
import type { SettlementTrackingDTO } from '../api/get-settlement-tracking';

const dto = (overrides: Partial<SettlementTrackingDTO> = {}): SettlementTrackingDTO => ({
  rows: [
    {
      event_id: 'e1',
      event_title: 'Denver — Red Rocks',
      expected: 10000,
      expectedFormatted: '$10,000',
      actual: 8500,
      actualFormatted: '$8,500',
      variance: -1500,
      variancePct: '-15%',
    },
    {
      event_id: 'e2',
      event_title: 'Austin — ACL',
      expected: 8000,
      expectedFormatted: '$8,000',
      actual: 9200,
      actualFormatted: '$9,200',
      variance: 1200,
      variancePct: '+15%',
    },
  ],
  errored: false,
  ...overrides,
});

describe('<SettlementTrackingWidget />', () => {
  it('renders rows when data is present', () => {
    render(<SettlementTrackingWidget data={dto()} />);
    expect(screen.getByText('Denver — Red Rocks')).toBeTruthy();
    expect(screen.getByText('Austin — ACL')).toBeTruthy();
  });

  it('renders empty state when there are no rows', () => {
    render(<SettlementTrackingWidget data={dto({ rows: [] })} />);
    expect(screen.queryByText('Denver — Red Rocks')).toBeNull();
    // Empty-state copy renders from the registry body.
    expect(screen.getByText(/appears here once tour shows/i)).toBeTruthy();
  });

  it('renders soft error when errored', () => {
    render(<SettlementTrackingWidget data={dto({ rows: [], errored: true })} />);
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });

  it('renders skeletons while loading', () => {
    const { container } = render(<SettlementTrackingWidget loading />);
    expect(container.querySelectorAll('.stage-skeleton').length).toBeGreaterThan(0);
  });
});
