/**
 * CSV export server actions for Reconciliation tables.
 *
 * Each action re-runs the metric (so the export reflects current data, not the
 * snapshot the page was built with), formats columns per the registry's
 * column.format, and returns the CSV body. The client receives a string and
 * triggers a download via Blob.
 *
 * Vercel runtime cap is 30s. The metric RPCs cap at 500 rows so we don't hit
 * that ceiling on Phase 1 data shapes. Synthetic-volume testing per the v1.1
 * patches is a Phase 5 task.
 *
 * @module app/(features)/finance/reconciliation/actions/export-csv
 */
'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import { hasCapability } from '@/shared/lib/permissions';
import { callMetric, type MetricResult } from '@/shared/lib/metrics/call';
import { METRICS } from '@/shared/lib/metrics/registry';
import { isTableMetric } from '@/shared/lib/metrics/types';

/**
 * Cell formatting for CSV export.
 *
 * Currency is emitted as a raw decimal (1234.56), NOT a formatted string with
 * symbol or thousands separator — Excel and accounting software import this as
 * a number, which is what every CPA expects. The column header carries the unit.
 */
function formatCell(value: unknown, format?: string): string {
  if (value === null || value === undefined) return '';
  switch (format) {
    case 'currency':
      return Number(value).toFixed(2);
    case 'count':
      return String(Number(value));
    case 'percent':
      return `${(Number(value) * 100).toFixed(1)}%`;
    case 'date':
      try {
        const d = new Date(String(value));
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toISOString().slice(0, 10);
      } catch {
        return String(value);
      }
    default:
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      return String(value);
  }
}

/** RFC 4180-ish escape: wrap in quotes if the cell contains a quote, comma, or newline. */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function getWorkspaceId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get('workspace_id')?.value;
    if (fromCookie) return fromCookie;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    return membership?.workspace_id ?? null;
  } catch {
    return null;
  }
}

export type ExportResult =
  | { ok: true; filename: string; csv: string }
  | { ok: false; error: string };

/**
 * Export a table metric to CSV. The caller passes the metric ID and any args
 * the metric needs (year for 1099, period for sales tax, none for the others).
 */
export async function exportMetricCsv(
  metricId: string,
  args: Record<string, unknown> = {},
): Promise<ExportResult> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No workspace' };

  const allowed = await hasCapability(null, workspaceId, 'finance:reconcile');
  if (!allowed) return { ok: false, error: 'Not authorized' };

  const definition = METRICS[metricId];
  if (!definition || !isTableMetric(definition)) {
    return { ok: false, error: 'Not a table metric' };
  }
  if (!definition.exportable) {
    return { ok: false, error: 'Metric is not exportable' };
  }

  const result: MetricResult = await callMetric(workspaceId, metricId, args);
  if (!result.ok || result.kind !== 'table') {
    return { ok: false, error: result.ok ? 'Unexpected result kind' : result.error };
  }

  const headerRow = definition.columns.map((c) => csvCell(c.label)).join(',');
  const dataRows = result.rows.map((row) =>
    definition.columns
      .map((c) => csvCell(formatCell(row[c.key], c.format)))
      .join(','),
  );
  // \uFEFF BOM so Excel auto-detects UTF-8 (otherwise non-ASCII characters
  // like é, ñ, em-dash get mangled on Windows).
  const csv = '\uFEFF' + [headerRow, ...dataRows, ''].join('\r\n');

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${metricId.replace(/\./g, '_')}_${stamp}.csv`;

  return { ok: true, filename, csv };
}
