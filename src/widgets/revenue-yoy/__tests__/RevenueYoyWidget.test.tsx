/**
 * Component tests for RevenueYoyWidget (Phase 5.1).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevenueYoyWidget } from '../index';
import type { RevenueYoyDTO } from '../api/get-revenue-yoy';

const baseDTO = (overrides: Partial<RevenueYoyDTO> = {}): RevenueYoyDTO => ({
  revenueFormatted: '$12.4K',
  revenueValue: 12400,
  secondary: 'vs $9.8K in 2025',
  comparisonDelta: '+$2,600',
  comparisonDirection: 'up',
  comparisonLabel: 'vs 2025',
  errored: false,
  ...overrides,
});

describe('<RevenueYoyWidget />', () => {
  it('renders hero + delta when data is present', () => {
    render(<RevenueYoyWidget data={baseDTO()} />);
    expect(screen.getByTestId('revenue-yoy-hero').textContent).toBe('$12.4K');
    expect(screen.getByTestId('revenue-yoy-delta').textContent).toContain('+$2,600');
  });

  it('renders empty state when revenue is 0 and no secondary', () => {
    render(
      <RevenueYoyWidget
        data={baseDTO({
          revenueFormatted: '$0',
          revenueValue: 0,
          secondary: null,
          comparisonDelta: null,
          comparisonDirection: null,
          comparisonLabel: null,
        })}
      />,
    );
    expect(screen.queryByTestId('revenue-yoy-hero')).toBeNull();
  });

  it('shows soft error when errored and no secondary', () => {
    render(
      <RevenueYoyWidget
        data={baseDTO({
          revenueFormatted: '$0',
          revenueValue: 0,
          secondary: null,
          errored: true,
          comparisonDelta: null,
          comparisonDirection: null,
          comparisonLabel: null,
        })}
      />,
    );
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });

  it('renders skeletons while loading', () => {
    const { container } = render(<RevenueYoyWidget loading />);
    expect(container.querySelectorAll('.stage-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('revenue-yoy-hero')).toBeNull();
  });

  it('omits the delta when comparison is missing', () => {
    render(
      <RevenueYoyWidget
        data={baseDTO({ comparisonDelta: null, comparisonDirection: null })}
      />,
    );
    expect(screen.queryByTestId('revenue-yoy-delta')).toBeNull();
  });
});
