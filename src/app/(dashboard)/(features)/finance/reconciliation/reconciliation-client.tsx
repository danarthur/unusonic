/**
 * Reconciliation page client. Tab switcher over the four worksheets,
 * scalar QBO panel pinned at the top, CSV export per worksheet.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Button } from '@/shared/ui/button';
import { METRICS } from '@/shared/lib/metrics/registry';
import { isTableMetric } from '@/shared/lib/metrics/types';
import type { MetricResult } from '@/shared/lib/metrics/call';
import { QboSyncHealthPanel } from './components/QboSyncHealthPanel';
import { MetricTable } from './components/MetricTable';
import { exportMetricCsv } from './actions/export-csv';

interface ReconciliationClientProps {
  workspaceId: string;
  results: {
    syncHealth: MetricResult;
    variance: MetricResult;
    unreconciled: MetricResult;
    invoiceVariance: MetricResult;
    salesTax: MetricResult;
    form1099: MetricResult;
  };
  defaultPeriod: { start: string; end: string };
  defaultYear: number;
}

type TabKey = 'unreconciled' | 'invoice_variance' | 'sales_tax' | '1099';

const TABS: Array<{ key: TabKey; metricId: string; label: string }> = [
  { key: 'unreconciled', metricId: 'finance.unreconciled_payments', label: 'Unreconciled payments' },
  { key: 'invoice_variance', metricId: 'finance.invoice_variance', label: 'Invoice variance' },
  { key: 'sales_tax', metricId: 'finance.sales_tax_worksheet', label: 'Sales tax' },
  { key: '1099', metricId: 'finance.1099_worksheet', label: '1099 worksheet' },
];

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReconciliationClient({
  results,
  defaultPeriod,
  defaultYear,
}: ReconciliationClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('unreconciled');
  const [exporting, setExporting] = useState<TabKey | null>(null);

  const tabResult = (() => {
    switch (activeTab) {
      case 'unreconciled':
        return results.unreconciled;
      case 'invoice_variance':
        return results.invoiceVariance;
      case 'sales_tax':
        return results.salesTax;
      case '1099':
        return results.form1099;
    }
  })();

  const activeMetricId = TABS.find((t) => t.key === activeTab)!.metricId;
  const activeDefinition = METRICS[activeMetricId];

  async function handleExport() {
    if (!isTableMetric(activeDefinition)) return;
    setExporting(activeTab);
    const args: Record<string, unknown> =
      activeMetricId === 'finance.sales_tax_worksheet'
        ? { period_start: defaultPeriod.start, period_end: defaultPeriod.end }
        : activeMetricId === 'finance.1099_worksheet'
          ? { year: defaultYear }
          : {};
    const result = await exportMetricCsv(activeMetricId, args);
    setExporting(null);
    if (result.ok) {
      downloadCsv(result.csv, result.filename);
    } else {
      console.error('CSV export failed:', result.error);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <button
            onClick={() => router.push('/finance')}
            className="flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors w-fit"
          >
            <ArrowLeft className="size-3" strokeWidth={1.5} />
            Finance
          </button>
          <h1 className="text-2xl font-medium text-[var(--stage-text-primary)]">
            Reconciliation
          </h1>
          <p className="text-sm text-[var(--stage-text-secondary)]">
            Cross-check your books against QuickBooks. Sales tax and 1099
            worksheets for end-of-period filings.
          </p>
        </div>
      </div>

      {/* QBO sync health pinned at top */}
      <QboSyncHealthPanel health={results.syncHealth} variance={results.variance} />

      {/* Tab switcher */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1 border-b border-[var(--stage-border)] overflow-x-auto">
          {TABS.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2.5 text-sm transition-colors relative ${
                  isActive
                    ? 'text-[var(--stage-text-primary)]'
                    : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                }`}
              >
                {t.label}
                {isActive && (
                  <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[var(--stage-text-primary)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Active panel */}
        <StagePanel padding="none">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--stage-border)]">
            <div className="flex flex-col">
              <p className="text-sm font-medium text-[var(--stage-text-primary)]">
                {activeDefinition.title}
              </p>
              <p className="text-xs text-[var(--stage-text-tertiary)]">
                {activeDefinition.description}
              </p>
            </div>
            {isTableMetric(activeDefinition) && activeDefinition.exportable && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={exporting === activeTab}
                className="gap-1.5"
              >
                <Download className="size-3.5" strokeWidth={1.5} />
                {exporting === activeTab ? 'Exporting…' : 'Export CSV'}
              </Button>
            )}
          </div>

          {tabResult.ok && tabResult.kind === 'table' && isTableMetric(activeDefinition) ? (
            <MetricTable definition={activeDefinition} result={tabResult} />
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-[var(--stage-text-secondary)]">
                {tabResult.ok ? "Couldn't load this report. Refresh to try again." : tabResult.error}
              </p>
            </div>
          )}
        </StagePanel>
      </div>
    </div>
  );
}
