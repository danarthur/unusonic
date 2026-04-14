/**
 * Generic table renderer for any TableMetricResult. Reads column hints from the
 * metric registry and formats cells per column.format. Stage Engineering chrome.
 */
'use client';

import { StagePanel } from '@/shared/ui/stage-panel';
import type { TableMetricDefinition } from '@/shared/lib/metrics/types';
import type { TableMetricResult } from '@/shared/lib/metrics/call';

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const COUNT = new Intl.NumberFormat('en-US');

function formatCell(value: unknown, format?: string): string {
  if (value === null || value === undefined) return '—';
  switch (format) {
    case 'currency':
      return USD.format(Number(value));
    case 'count':
      return COUNT.format(Number(value));
    case 'percent':
      return `${(Number(value) * 100).toFixed(1)}%`;
    case 'date':
      try {
        const d = new Date(String(value));
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      } catch {
        return String(value);
      }
    default:
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      return String(value);
  }
}

interface MetricTableProps {
  definition: TableMetricDefinition;
  result: TableMetricResult;
}

export function MetricTable({ definition, result }: MetricTableProps) {
  if (result.rows.length === 0) {
    return (
      <StagePanel nested padding="md" className="text-center">
        <p className="text-sm font-medium text-[var(--stage-text-primary)]">
          {definition.emptyState.title}
        </p>
        <p className="mt-1 text-xs text-[var(--stage-text-secondary)]">
          {definition.emptyState.body}
        </p>
      </StagePanel>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--stage-border)]">
            {definition.columns.map((col) => (
              <th
                key={col.key}
                className={`stage-label px-3 py-2 font-mono text-[var(--stage-text-tertiary)] ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, idx) => (
            <tr
              key={idx}
              className="border-b border-[var(--stage-border)] last:border-b-0 hover:bg-[var(--stage-surface-hover)]"
            >
              {definition.columns.map((col) => {
                const isNumeric = col.format === 'currency' || col.format === 'count' || col.format === 'percent';
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-2 ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${isNumeric ? 'tabular-nums' : ''} text-[var(--stage-text-primary)]`}
                  >
                    {formatCell(row[col.key], col.format)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
