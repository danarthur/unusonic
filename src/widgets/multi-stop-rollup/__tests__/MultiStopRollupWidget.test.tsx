/**
 * Component tests for MultiStopRollupWidget (Phase 5.1).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MultiStopRollupWidget } from '../index';
import type { MultiStopRollupDTO } from '../api/get-multi-stop-rollup';

const dto = (overrides: Partial<MultiStopRollupDTO> = {}): MultiStopRollupDTO => ({
  notOnTour: false,
  rows: [
    { event_id: 'e1', label: 'Denver', dateFormatted: 'Apr 18', status: 'advanced' },
    { event_id: 'e2', label: 'Salt Lake City', dateFormatted: 'Apr 20', status: 'pending' },
    { event_id: 'e3', label: 'Portland', dateFormatted: 'Apr 22', status: 'load_in' },
  ],
  errored: false,
  ...overrides,
});

describe('<MultiStopRollupWidget />', () => {
  it('renders stops when a tour is active', () => {
    render(<MultiStopRollupWidget data={dto()} />);
    expect(screen.getByText('Denver')).toBeTruthy();
    expect(screen.getByText('Salt Lake City')).toBeTruthy();
    expect(screen.getByText('Portland')).toBeTruthy();
  });

  it('renders "Not on tour" empty state when notOnTour is true', () => {
    render(<MultiStopRollupWidget data={dto({ notOnTour: true, rows: [] })} />);
    expect(screen.getByText(/not on tour/i)).toBeTruthy();
  });

  it('renders registry empty state when rows are empty but tour is active', () => {
    render(<MultiStopRollupWidget data={dto({ rows: [] })} />);
    // Still falls through to the registry empty body path.
    expect(screen.queryByText('Denver')).toBeNull();
  });

  it('renders soft error when errored', () => {
    render(<MultiStopRollupWidget data={dto({ rows: [], errored: true, notOnTour: false })} />);
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });

  it('renders skeletons while loading', () => {
    const { container } = render(<MultiStopRollupWidget loading />);
    expect(container.querySelectorAll('.stage-skeleton').length).toBeGreaterThan(0);
  });
});
