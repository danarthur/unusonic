/**
 * Component tests for RefusalCard (Phase 3.4).
 *
 * Covers:
 *  - Prose text renders
 *  - attemptedMetricTitle inline copy renders + chip fires onSuggestionTap
 *  - suggestions chips render + fire onSuggestionTap with the chip value
 *  - Warning stripe is applied (refusals are informational, not errors)
 *  - Defensive: card renders with no optional fields set
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RefusalCard } from '../RefusalCard';
import type { Refusal } from '../../lib/aion-chat-types';

const baseRefusal = (overrides: Partial<Refusal> = {}): Refusal => ({
  type: 'refusal',
  text: "I don't have a defined metric for that.",
  reason: 'metric_not_in_registry',
  ...overrides,
});

describe('<RefusalCard />', () => {
  it('renders the prose text and the warning stripe', () => {
    const { container } = render(<RefusalCard refusal={baseRefusal()} />);
    expect(screen.getByTestId('refusal-text').textContent).toContain(
      "I don't have a defined metric for that.",
    );
    // Warning stripe class applied via StagePanel stripe="warning".
    expect(container.querySelector('.stage-stripe-warning')).toBeTruthy();
  });

  it('renders the near-match line when attemptedMetricTitle is set', () => {
    render(
      <RefusalCard
        refusal={baseRefusal({
          attemptedMetricId: 'finance.revenue_collected',
          attemptedMetricTitle: 'Revenue collected',
        })}
      />,
    );
    expect(screen.getByTestId('refusal-attempted').textContent).toContain(
      'The closest I have is',
    );
    expect(screen.getByTestId('refusal-attempted').textContent).toContain(
      'Revenue collected',
    );
  });

  it('renders an attempted-metric chip that fires a call_metric retry', () => {
    const onTap = vi.fn();
    render(
      <RefusalCard
        refusal={baseRefusal({
          attemptedMetricId: 'finance.revenue_collected',
          attemptedMetricTitle: 'Revenue collected',
        })}
        onSuggestionTap={onTap}
      />,
    );
    const chip = screen.getByTestId('refusal-attempted-chip');
    expect(chip.textContent).toContain('Try Revenue collected');
    fireEvent.click(chip);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap.mock.calls[0][0]).toMatchObject({
      value: 'Run finance.revenue_collected',
    });
  });

  it('renders suggestion chips and dispatches the chip value on tap', () => {
    const onTap = vi.fn();
    render(
      <RefusalCard
        refusal={baseRefusal({
          suggestions: [
            { label: 'Revenue collected', value: 'Show me revenue collected' },
            { label: 'AR aged 60+ days', value: 'Show me AR aged 60 plus' },
          ],
        })}
        onSuggestionTap={onTap}
      />,
    );
    const chips = screen.getAllByTestId('refusal-suggestion-chip');
    expect(chips.length).toBe(2);
    fireEvent.click(chips[0]);
    expect(onTap).toHaveBeenCalledWith({
      label: 'Revenue collected',
      value: 'Show me revenue collected',
    });
  });

  it('omits the suggestions block when no suggestions + no attempted id', () => {
    render(<RefusalCard refusal={baseRefusal()} />);
    expect(screen.queryByTestId('refusal-suggestions')).toBeNull();
  });

  it('renders attempted id inline as fallback when title is not resolvable', () => {
    render(
      <RefusalCard
        refusal={baseRefusal({
          attemptedMetricId: 'unknown.metric.id',
        })}
      />,
    );
    expect(screen.getByTestId('refusal-attempted').textContent).toContain(
      'unknown.metric.id',
    );
  });
});
