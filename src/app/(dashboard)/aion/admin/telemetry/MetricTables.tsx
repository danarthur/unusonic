/**
 * Per-signal_type metric tables for the admin telemetry dashboard.
 * Extracted from TelemetryDashboard so that file stays under the file-length
 * lint cap; pure presentation, no client JS.
 */

import { cn } from '@/shared/lib/utils';
import type { DismissRateRow, HitRateRow } from './types';

export function DismissRateTable({ rows }: { rows: DismissRateRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[12px] text-[var(--stage-text-tertiary)]">
        no signal emissions yet in window
      </p>
    );
  }
  return (
    <table className="w-full text-[12px] tabular-nums">
      <thead>
        <tr className="text-[var(--stage-text-tertiary)] text-[10px] uppercase tracking-wide">
          <th className="text-left font-normal py-1">signal</th>
          <th className="text-right font-normal py-1">emits</th>
          <th className="text-right font-normal py-1">not relevant</th>
          <th className="text-right font-normal py-1">rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.signal_type} className="text-[var(--stage-text-secondary)]">
            <td className="text-left py-1 truncate max-w-[140px]">{row.signal_type}</td>
            <td className="text-right py-1">{row.total_emitted}</td>
            <td className="text-right py-1">{row.not_useful_count}</td>
            <td
              className={cn(
                'text-right py-1',
                row.above_threshold && 'text-[var(--stage-text-primary)] font-medium',
              )}
            >
              {(Number(row.not_useful_rate) * 100).toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HitRateTable({ rows }: { rows: HitRateRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[12px] text-[var(--stage-text-tertiary)]">
        no signal emissions yet in window
      </p>
    );
  }
  return (
    <table className="w-full text-[12px] tabular-nums">
      <thead>
        <tr className="text-[var(--stage-text-tertiary)] text-[10px] uppercase tracking-wide">
          <th className="text-left font-normal py-1">signal</th>
          <th className="text-right font-normal py-1">emits</th>
          <th className="text-right font-normal py-1">handled</th>
          <th className="text-right font-normal py-1">hit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.signal_type} className="text-[var(--stage-text-secondary)]">
            <td className="text-left py-1 truncate max-w-[140px]">{row.signal_type}</td>
            <td className="text-right py-1">{row.total_emitted}</td>
            <td className="text-right py-1">{row.already_handled_count}</td>
            <td
              className={cn(
                'text-right py-1',
                row.meets_min_sample && 'text-[var(--stage-text-primary)] font-medium',
              )}
            >
              {(Number(row.hit_rate) * 100).toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
