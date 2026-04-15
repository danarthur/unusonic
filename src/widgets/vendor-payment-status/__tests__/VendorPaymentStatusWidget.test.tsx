/**
 * Component tests for VendorPaymentStatusWidget (Phase 5.1).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VendorPaymentStatusWidget } from '../index';
import type { VendorPaymentStatusDTO } from '../api/get-vendor-payment-status';

const dto = (overrides: Partial<VendorPaymentStatusDTO> = {}): VendorPaymentStatusDTO => ({
  rows: [
    {
      vendor_id: 'v1',
      vendor_name: 'Elite Staging Co.',
      outstanding: 12500,
      outstandingFormatted: '$12,500',
      overdueCount: 2,
    },
    {
      vendor_id: 'v2',
      vendor_name: 'Rolling Thunder Trucking',
      outstanding: 4200,
      outstandingFormatted: '$4,200',
      overdueCount: 0,
    },
  ],
  errored: false,
  ...overrides,
});

describe('<VendorPaymentStatusWidget />', () => {
  it('renders vendor rows when data is present', () => {
    render(<VendorPaymentStatusWidget data={dto()} />);
    expect(screen.getByText('Elite Staging Co.')).toBeTruthy();
    expect(screen.getByText(/2 overdue/)).toBeTruthy();
  });

  it('renders empty state when there are no rows', () => {
    render(<VendorPaymentStatusWidget data={dto({ rows: [] })} />);
    expect(screen.queryByText('Elite Staging Co.')).toBeNull();
  });

  it('renders soft error when errored', () => {
    render(<VendorPaymentStatusWidget data={dto({ rows: [], errored: true })} />);
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });

  it('renders skeletons while loading', () => {
    const { container } = render(<VendorPaymentStatusWidget loading />);
    expect(container.querySelectorAll('.stage-skeleton').length).toBeGreaterThan(0);
  });
});
