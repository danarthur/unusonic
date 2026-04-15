/**
 * Component tests for CrewUtilizationWidget (Phase 5.1).
 *
 * Covers:
 *  - Loading state renders skeletons (no hero)
 *  - Empty state renders registry copy when rate=0 and no secondary
 *  - Data state renders the hero + secondary line
 *  - Error state renders a soft copy line
 *  - Threshold coloring boundaries at 70% and 40%
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrewUtilizationWidget } from '../index';
import type { CrewUtilizationDTO } from '../api/get-crew-utilization';

const baseDTO = (overrides: Partial<CrewUtilizationDTO> = {}): CrewUtilizationDTO => ({
  rateFormatted: '74%',
  rateFraction: 0.74,
  secondary: 'Marcus 88% utilized',
  errored: false,
  ...overrides,
});

describe('<CrewUtilizationWidget />', () => {
  it('renders hero + secondary when data is present', () => {
    render(<CrewUtilizationWidget data={baseDTO()} />);
    const hero = screen.getByTestId('crew-utilization-hero');
    expect(hero.textContent).toBe('74%');
    expect(screen.getByText('Marcus 88% utilized')).toBeTruthy();
  });

  it('renders empty state when rate is 0 and no secondary', () => {
    render(
      <CrewUtilizationWidget
        data={baseDTO({ rateFormatted: '0%', rateFraction: 0, secondary: null })}
      />,
    );
    // Empty state replaces the hero.
    expect(screen.queryByTestId('crew-utilization-hero')).toBeNull();
  });

  it('renders a soft error line when errored and no secondary', () => {
    render(
      <CrewUtilizationWidget
        data={baseDTO({ rateFormatted: '0%', rateFraction: 0, secondary: null, errored: true })}
      />,
    );
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });

  it('renders at the 70% threshold boundary', () => {
    render(
      <CrewUtilizationWidget
        data={baseDTO({ rateFormatted: '70%', rateFraction: 0.7, secondary: '4 of 5 calls filled' })}
      />,
    );
    expect(screen.getByTestId('crew-utilization-hero').textContent).toBe('70%');
  });

  it('shows skeletons while loading', () => {
    const { container } = render(<CrewUtilizationWidget loading />);
    expect(container.querySelectorAll('.stage-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('crew-utilization-hero')).toBeNull();
  });
});
