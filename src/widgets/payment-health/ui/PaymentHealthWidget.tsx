'use client';

/**
 * Payment Health widget — lobby bento cell.
 * Shows overdue count, total at-risk amount, and next upcoming payment.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Clock } from 'lucide-react';
import { Finance } from '@/shared/ui/icons';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { WidgetShell } from '@/widgets/shared';
import { getPaymentHealthMetrics, type PaymentHealthMetrics } from '../api/get-payment-health';
import { METRICS } from '@/shared/lib/metrics/registry';

const META = METRICS['lobby.payment_health'];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PaymentHealthWidget() {
  const [metrics, setMetrics] = useState<PaymentHealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPaymentHealthMetrics().then((m) => {
      setMetrics(m);
      setLoading(false);
    });
  }, []);

  const hasOverdue = metrics ? metrics.overdueCount > 0 : false;
  const hasUpcoming = metrics ? !!metrics.nextPayment : false;
  const isEmpty = !hasOverdue && !hasUpcoming;

  return (
    <WidgetShell
      icon={Finance}
      label={META.title}
      loading={loading}
      empty={!loading && isEmpty}
      emptyMessage={META.emptyState.body}
    >
    {!metrics ? null : <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-3 py-1"
    >
      {/* Overdue block */}
      {hasOverdue && (
        <div className="flex items-center gap-3">
          <div
            className="size-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'color-mix(in oklch, var(--color-unusonic-error) 12%, transparent)',
            }}
          >
            <AlertTriangle className="size-3.5" style={{ color: 'var(--color-unusonic-error)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight tabular-nums">
              {metrics.overdueCount} overdue
            </p>
            <p className="text-field-label text-[var(--stage-text-secondary)]/50 tabular-nums">
              {formatCurrency(metrics.overdueAmount)} at risk
            </p>
          </div>
        </div>
      )}

      {/* Next upcoming */}
      {hasUpcoming && metrics.nextPayment && (
        <div className="flex items-center gap-3">
          <div
            className="size-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'color-mix(in oklch, var(--color-neon-amber) 12%, transparent)',
            }}
          >
            <Clock className="size-3.5" style={{ color: 'var(--color-neon-amber)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
              {metrics.nextPayment.dealTitle}
            </p>
            <p className="text-field-label text-[var(--stage-text-secondary)]/50 tabular-nums">
              {metrics.nextPayment.amount ? formatCurrency(metrics.nextPayment.amount) : 'Payment'} · {formatShortDate(metrics.nextPayment.dueDate)}
            </p>
          </div>
        </div>
      )}
    </motion.div>}
    </WidgetShell>
  );
}
