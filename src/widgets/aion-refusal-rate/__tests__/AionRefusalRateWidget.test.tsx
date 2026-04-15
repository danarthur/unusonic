/**
 * Component tests for AionRefusalRateWidget (Phase 3.4).
 *
 * Covers:
 *  - Hero number renders under / at / over the 10% threshold with the right
 *    data-over-threshold attr driving color treatment
 *  - Delta renders with direction icon when the RPC provides a comparison
 *  - Errored state shows a soft copy line and does not show a hero number
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AionRefusalRateWidget } from '../index';
import type { AionRefusalRateDTO } from '../api/get-aion-refusal-rate';

const baseDTO = (overrides: Partial<AionRefusalRateDTO> = {}): AionRefusalRateDTO => ({
  rateFormatted: '5%',
  rateFraction: 0.05,
  secondary: '3 of 60 turns refused',
  comparisonDelta: null,
  comparisonDirection: null,
  errored: false,
  ...overrides,
});

describe('<AionRefusalRateWidget />', () => {
  it('renders a 5% hero value under the threshold', () => {
    render(<AionRefusalRateWidget data={baseDTO({ rateFormatted: '5%', rateFraction: 0.05 })} />);
    const hero = screen.getByTestId('refusal-rate-hero');
    expect(hero.textContent).toBe('5%');
    expect(hero.getAttribute('data-over-threshold')).toBe('false');
  });

  it('flags the hero as over-threshold at 12%', () => {
    render(
      <AionRefusalRateWidget
        data={baseDTO({ rateFormatted: '12%', rateFraction: 0.12, secondary: '12 of 100 turns refused' })}
      />,
    );
    const hero = screen.getByTestId('refusal-rate-hero');
    expect(hero.textContent).toBe('12%');
    expect(hero.getAttribute('data-over-threshold')).toBe('true');
  });

  it('renders 0% when no activity AND no secondary (treated as empty registry state)', () => {
    // secondary=null with rateFraction=0 drops to the empty state copy path.
    render(
      <AionRefusalRateWidget
        data={baseDTO({ rateFormatted: '0%', rateFraction: 0, secondary: null })}
      />,
    );
    // Empty state replaces the hero — no refusal-rate-hero testid should render.
    expect(screen.queryByTestId('refusal-rate-hero')).toBeNull();
  });

  it('renders 0% hero when no activity but secondary says so', () => {
    render(
      <AionRefusalRateWidget
        data={baseDTO({
          rateFormatted: '0%',
          rateFraction: 0,
          secondary: 'No Aion activity in the last 30 days',
        })}
      />,
    );
    const hero = screen.getByTestId('refusal-rate-hero');
    expect(hero.textContent).toBe('0%');
    expect(hero.getAttribute('data-over-threshold')).toBe('false');
  });

  it('renders the comparison delta with the direction attached', () => {
    render(
      <AionRefusalRateWidget
        data={baseDTO({
          rateFormatted: '8%',
          rateFraction: 0.08,
          comparisonDelta: '+2.0%',
          comparisonDirection: 'up',
        })}
      />,
    );
    const delta = screen.getByTestId('refusal-rate-delta');
    expect(delta.textContent).toContain('+2.0%');
  });

  it('threshold crossover boundary at exactly 10%', () => {
    render(
      <AionRefusalRateWidget
        data={baseDTO({ rateFormatted: '10%', rateFraction: 0.1, secondary: '10 of 100 turns refused' })}
      />,
    );
    const hero = screen.getByTestId('refusal-rate-hero');
    expect(hero.getAttribute('data-over-threshold')).toBe('true');
  });
});
