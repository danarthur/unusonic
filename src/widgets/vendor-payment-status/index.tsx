'use client';

/**
 * Vendor payment status widget — lobby bento cell.
 *
 * Phase 5.1 (touring coordinator). Top 3 vendors with outstanding balances.
 * Empty state copy comes from the registry entry (`lobby.vendor_payment_status`).
 *
 * @module widgets/vendor-payment-status
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';
import type { VendorPaymentStatusDTO, VendorRow } from './api/get-vendor-payment-status';

export const widgetKey = 'vendor-payment-status' as const;

interface VendorPaymentStatusWidgetProps {
  data?: VendorPaymentStatusDTO | null;
  loading?: boolean;
}

const METRIC = METRICS['lobby.vendor_payment_status'];
const TITLE = METRIC?.title ?? 'Vendor payments';
const EMPTY_BODY = METRIC?.emptyState.body ?? 'All vendors paid up.';

function Row({ row }: { row: VendorRow }) {
  const hasOverdue = row.overdueCount > 0;
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span
        className="truncate text-[var(--stage-text-primary)]"
        title={row.vendor_name}
      >
        {row.vendor_name || 'Unknown vendor'}
      </span>
      <span className="tabular-nums shrink-0 text-[var(--stage-text-secondary)]">
        {row.outstandingFormatted}
        {hasOverdue && (
          <span
            className="ml-2"
            style={{ color: 'var(--color-unusonic-warning)' }}
          >
            {row.overdueCount} overdue
          </span>
        )}
      </span>
    </div>
  );
}

export function VendorPaymentStatusWidget({ data, loading }: VendorPaymentStatusWidgetProps) {
  const showEmpty = !loading && (!data || data.rows.length === 0);

  return (
    <WidgetShell
      icon={Wallet}
      label={TITLE}
      loading={loading}
      empty={showEmpty && !data?.errored}
      emptyMessage={EMPTY_BODY}
      emptyIcon={Wallet}
      skeletonRows={3}
    >
      {data && !showEmpty && (
        <motion.div
          className="flex flex-col gap-1 h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={STAGE_LIGHT}
        >
          {data.rows.map((row) => (
            <Row key={row.vendor_id || row.vendor_name} row={row} />
          ))}
        </motion.div>
      )}
      {data?.errored && showEmpty && (
        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
          Vendor data is unavailable right now.
        </p>
      )}
    </WidgetShell>
  );
}
