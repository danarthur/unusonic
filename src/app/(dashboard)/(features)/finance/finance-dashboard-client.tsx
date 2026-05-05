/**
 * Finance Dashboard Client Component
 *
 * Renders stats cards, aging buckets, filter chips, and the InvoiceListWidget.
 * All data is passed from the server component (page.tsx).
 *
 * @module app/(features)/finance/finance-dashboard-client
 */

'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText, ArrowRight, ListChecks } from 'lucide-react';
import { StagePanel, StageReadout } from '@/shared/ui/stage-panel';
import { Button } from '@/shared/ui/button';
import {
  InvoiceListWidget,
  type InvoiceStatusFilter,
} from '@/features/finance/ui/widgets/InvoiceListWidget';
import type { FinanceDashboardData } from './types';

// ---------------------------------------------------------------------------
// Currency formatting
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

const FILTERS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'draft', label: 'Draft' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FinanceDashboardClientProps {
  workspaceId: string;
  initialData: FinanceDashboardData;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinanceDashboardClient({
  workspaceId,
  initialData,
}: FinanceDashboardClientProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<InvoiceStatusFilter>('all');
  const { invoices, stats } = initialData;

  const handleDataChange = useCallback(() => {
    router.refresh();
  }, [router]);

  const hasInvoices = invoices.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-[var(--stage-text-primary)]">
            Finance
          </h1>
          <p className="mt-1 text-sm text-[var(--stage-text-secondary)]">
            Invoices, payments, and revenue
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/finance/reconciliation')}
            className="gap-2"
          >
            <ListChecks className="size-4" />
            Reconciliation
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/finance/invoices/new')}
            className="gap-2"
          >
            <Plus className="size-4" />
            New invoice
          </Button>
        </div>
      </div>

      {/* ── Stats cards ───────────────────────────���────────────── */}
      {hasInvoices && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StagePanel className="!p-4">
            <StageReadout
              label="Outstanding"
              value={formatCurrency(stats.outstandingTotal)}
              size="md"
            />
          </StagePanel>
          <StagePanel className="!p-4">
            <StageReadout
              label="Revenue this month"
              value={formatCurrency(stats.revenueThisMonth)}
              size="md"
            />
          </StagePanel>
          <StagePanel className="!p-4">
            <StageReadout
              label="Total invoices"
              value={String(invoices.length)}
              size="md"
            />
          </StagePanel>
          <StagePanel className="!p-4">
            <StageReadout
              label="Paid"
              value={String(stats.statusCounts['paid'] ?? 0)}
              size="md"
            />
          </StagePanel>
        </div>
      )}

      {/* ── Aging buckets ──────────────────────────────────────── */}
      {hasInvoices && stats.outstandingTotal > 0 && (
        <StagePanel className="!p-4">
          <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-3">
            Aging
          </h3>
          <div className="grid grid-cols-5 gap-3 text-center">
            {[
              { label: 'Current', value: stats.agingBuckets.current },
              { label: '1\u201330 days', value: stats.agingBuckets.days1to30 },
              { label: '31\u201360 days', value: stats.agingBuckets.days31to60 },
              { label: '61\u201390 days', value: stats.agingBuckets.days61to90 },
              { label: '90+ days', value: stats.agingBuckets.days90plus },
            ].map((bucket) => (
              <div key={bucket.label}>
                <p className="text-xs text-[var(--stage-text-tertiary)]">
                  {bucket.label}
                </p>
                <p className="mt-1 font-mono text-sm text-[var(--stage-text-primary)] tabular-nums">
                  {formatCurrency(bucket.value)}
                </p>
              </div>
            ))}
          </div>
        </StagePanel>
      )}

      {/* ── Filter chips ───���───────────────────────────────────── */}
      {hasInvoices && (
        <div className="flex items-center gap-2 overflow-x-auto">
          {FILTERS.map((f) => {
            const isActive = filter === f.value;
            const count =
              f.value === 'all'
                ? invoices.length
                : f.value === 'outstanding'
                  ? invoices.filter(
                      (i) =>
                        !['paid', 'void', 'draft'].includes(i.status) &&
                        i.balance_due > 0,
                    ).length
                  : f.value === 'overdue'
                    ? invoices.filter(
                        (i) => i.days_overdue > 0 && i.balance_due > 0,
                      ).length
                    : invoices.filter((i) => i.status === f.value).length;

            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--stage-surface-raised)] text-[var(--stage-text-primary)]'
                    : 'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                }`}
              >
                {f.label}
                {count > 0 && (
                  <span className="tabular-nums opacity-60">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Invoice list ───────────────────────────────────────── */}
      {hasInvoices ? (
        <InvoiceListWidget
          invoices={invoices}
          statusFilter={filter}
          onDataChange={handleDataChange}
        />
      ) : (
        <StagePanel className="!p-12 text-center">
          <FileText className="mx-auto size-10 text-[var(--stage-text-tertiary)] mb-4" />
          <h2 className="text-lg font-medium text-[var(--stage-text-primary)] mb-2">
            No invoices yet
          </h2>
          <p className="text-sm text-[var(--stage-text-secondary)] mb-6 max-w-sm mx-auto">
            Create your first invoice from an accepted proposal or start with a blank invoice.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/finance/invoices/new')}
              className="gap-2"
            >
              <Plus className="size-4" />
              Blank invoice
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/events')}
              className="gap-2"
            >
              Go to deals
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </StagePanel>
      )}
    </div>
  );
}
