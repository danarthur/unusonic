/**
 * Empty-state coverage for ActionQueueWidget — Phase 2.5.
 *
 * Asserts the registry-owned empty copy renders when the data array is empty,
 * loading takes precedence over empty, and the copy is absent when data has
 * content.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActionQueueWidget } from '../ui/ActionQueueWidget';
import { METRICS } from '@/shared/lib/metrics/registry';
import type { ActionItem } from '@/widgets/dashboard/api';

const EMPTY_COPY = METRICS['lobby.action_queue'].emptyState.body;

const sampleAction: ActionItem = {
  id: 'a1',
  type: 'follow_up',
  priority: 'today',
  title: 'Follow up with Villa Azul',
  detail: 'Proposal sent 3 days ago',
  actionUrl: '/crm/deal-1',
  actionLabel: 'Open',
};

describe('<ActionQueueWidget />', () => {
  it('renders the registry empty copy when data is empty', () => {
    render(<ActionQueueWidget data={[]} loading={false} />);
    expect(screen.getByText(EMPTY_COPY)).toBeTruthy();
  });

  it('does NOT render empty copy when loading', () => {
    render(<ActionQueueWidget data={[]} loading={true} />);
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });

  it('does NOT render empty copy when data has items', () => {
    render(<ActionQueueWidget data={[sampleAction]} loading={false} />);
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
    expect(screen.getByText(sampleAction.title)).toBeTruthy();
  });
});
