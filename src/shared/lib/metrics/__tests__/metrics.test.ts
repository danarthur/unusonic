/**
 * Unit tests for the metric registry, argument validation, and callMetric.
 * Phase 1.2d acceptance tests + Phase 2.1 library manifest coverage.
 */
import { describe, it, expect, vi } from 'vitest';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { METRICS, METRIC_IDS, RELATED_METRICS, getRelatedMetricChips } from '../registry';
import {
  isScalarMetric,
  isTableMetric,
  isWidgetMetric,
  type MetricCapability,
} from '../types';
import { callMetric } from '../call';
import { getVisibleLibrary, getRoleDefaults } from '../library';

// ─── Registry sanity ────────────────────────────────────────────────────────

describe('registry sanity', () => {
  it.each(METRIC_IDS)('%s has a complete definition', (id) => {
    const def = METRICS[id];
    expect(def).toBeDefined();
    expect(def.id).toBe(id);
    expect(def.title.length).toBeGreaterThan(0);
    expect(def.description.length).toBeGreaterThan(0);
    // Widget-kind entries use the lobby. namespace; some are non-picker
    // surfaces (sheets, banners) and ship with intentionally empty empty-state
    // copy. RPC-backed metrics must always explain themselves.
    if (!isWidgetMetric(def)) {
      expect(def.emptyState.title.length).toBeGreaterThan(0);
      expect(def.emptyState.body.length).toBeGreaterThan(0);
      expect(def.requiredCapabilities.length).toBeGreaterThan(0);
    }
    expect(def.roles.length).toBeGreaterThan(0);

    if (isScalarMetric(def) || isTableMetric(def)) {
      expect(def.rpcName).toMatch(/^metric_/);
      // Phase 1.2 metrics live in `finance`; Phase 3.4 added `ops` (refusal rate).
      expect(['finance', 'ops']).toContain(def.rpcSchema);
    }
  });

  it.each(METRIC_IDS)('%s has the right shape for its kind', (id) => {
    const def = METRICS[id];
    if (isScalarMetric(def)) {
      expect(['currency', 'count', 'percent', 'duration', 'timestamp', 'ratio']).toContain(def.unit);
      expect(['positive', 'negative', 'neutral']).toContain(def.comparisonSentiment);
      expect(typeof def.hasSparkline).toBe('boolean');
    } else if (isTableMetric(def)) {
      expect(def.columns.length).toBeGreaterThan(0);
      for (const col of def.columns) {
        expect(col.key.length).toBeGreaterThan(0);
        expect(col.label.length).toBeGreaterThan(0);
      }
      expect(typeof def.exportable).toBe('boolean');
    } else if (isWidgetMetric(def)) {
      expect(def.widgetKey.length).toBeGreaterThan(0);
      expect(def.id.startsWith('lobby.')).toBe(true);
    }
  });

  it('exposes the Phase 1.2 + 3.4 + 4.2 + 5.4 RPC metrics', () => {
    const rpcIds = METRIC_IDS.filter((id) => !isWidgetMetric(METRICS[id])).sort();
    expect(rpcIds).toEqual([
      // Phase 1.2 — finance metrics.
      'finance.1099_worksheet',
      'finance.ar_aged_60plus',
      // Phase 4.2 — budget vs actual.
      'finance.budget_vs_actual',
      'finance.invoice_variance',
      'finance.qbo_sync_health',
      'finance.qbo_variance',
      // Phase 4.2 — revenue by lead source.
      'finance.revenue_by_lead_source',
      'finance.revenue_collected',
      // Phase 4.2 — revenue YoY.
      'finance.revenue_yoy',
      'finance.sales_tax_worksheet',
      'finance.unreconciled_payments',
      // Phase 3.4 — ops refusal-rate.
      'ops.aion_refusal_rate',
      // Phase 4.2 — crew utilization.
      'ops.crew_utilization',
      // Phase 5.4 — tour metrics.
      'ops.multi_stop_rollup',
      'ops.settlement_variance',
      'ops.vendor_payment_status',
    ]);
    // Phase 4.2 + 5.4 adds 6 metrics on top of Phase 1.2 (8) + Phase 3.4 (1) = 15.
    // One additional RPC metric (finance.revenue_yoy) is widget-backed; the widget
    // check treats it as an RPC metric because it has rpcName/rpcSchema.
    expect(rpcIds.length).toBe(16);
  });
});

// ─── Library manifest coverage (Phase 2.1) ──────────────────────────────────

/** Widget folders excluded from library coverage. `__tests__` holds the
 * cross-widget empty-states pattern README added in Phase 2.5, not a widget. */
const WIDGET_EXCLUDES = new Set(['dashboard', 'shared', '__tests__']);

function listWidgetFolders(): string[] {
  const widgetsDir = join(process.cwd(), 'src', 'widgets');
  return readdirSync(widgetsDir).filter((name) => {
    if (WIDGET_EXCLUDES.has(name)) return false;
    const full = join(widgetsDir, name);
    return statSync(full).isDirectory();
  });
}

function widgetFolderFor(widgetKey: string): string {
  return join(process.cwd(), 'src', 'widgets', widgetKey);
}

describe('library manifest', () => {
  const widgetEntries = Object.values(METRICS).filter(isWidgetMetric);

  it('every widget-kind entry points at a real folder', () => {
    for (const def of widgetEntries) {
      const folder = widgetFolderFor(def.widgetKey);
      expect(existsSync(folder), `missing folder for ${def.id}: ${folder}`).toBe(true);
    }
  });

  it('every widget folder (minus dashboard/shared) has a registry entry', () => {
    const folders = listWidgetFolders();
    const entryKeys = new Set([
      // qbo-variance is an RPC-backed metric (finance.qbo_variance). It owns the
      // folder via its widgetKey property on the scalar entry.
      METRICS['finance.qbo_variance'].widgetKey,
      // aion-refusal-rate (Phase 3.4) is also an RPC-backed scalar with a widgetKey.
      METRICS['ops.aion_refusal_rate'].widgetKey,
      // Phase 4.2 — revenue-yoy and crew-utilization are RPC-backed scalars
      // with their own widget folders built by the Phase 5.1 parallel track.
      METRICS['finance.revenue_yoy'].widgetKey,
      METRICS['ops.crew_utilization'].widgetKey,
      ...widgetEntries.map((d) => d.widgetKey),
    ]);
    for (const folder of folders) {
      expect(entryKeys.has(folder), `no registry entry for src/widgets/${folder}`).toBe(true);
    }
  });
});

describe('getVisibleLibrary', () => {
  it('returns only cards whose capabilities are all held', () => {
    const caps = new Set<MetricCapability>(['finance:view']);
    const visible = getVisibleLibrary(caps);
    // Revenue collected requires finance:view only — must pass.
    expect(visible.some((m) => m.id === 'finance.revenue_collected')).toBe(true);
    // QBO variance requires finance:view + finance:reconcile — must NOT pass.
    expect(visible.some((m) => m.id === 'finance.qbo_variance')).toBe(false);
  });

  it('includes no-capability entries for any user', () => {
    const visible = getVisibleLibrary(new Set());
    expect(visible.some((m) => m.id === 'lobby.action_queue')).toBe(true);
    expect(visible.some((m) => m.id === 'lobby.network')).toBe(true);
  });

  it('adds gated cards only when both capabilities are held', () => {
    const full = new Set<MetricCapability>(['finance:view', 'finance:reconcile']);
    const visible = getVisibleLibrary(full);
    expect(visible.some((m) => m.id === 'finance.qbo_variance')).toBe(true);
    expect(visible.some((m) => m.id === 'finance.unreconciled_payments')).toBe(true);
  });
});

describe('getRoleDefaults', () => {
  it('finance_admin sees finance cards but not touring-coordinator-only ones', () => {
    const caps = new Set<MetricCapability>([
      'finance:view',
      'finance:reconcile',
      'deals:read:global',
      'planning:view',
      'ros:view',
    ]);
    const adminCards = getRoleDefaults(caps, 'finance_admin');
    expect(adminCards.some((m) => m.id === 'finance.revenue_collected')).toBe(true);
    expect(adminCards.some((m) => m.id === 'finance.qbo_variance')).toBe(true);
    // Live-gig monitor is scoped to owner/pm/touring_coordinator — not finance_admin.
    expect(adminCards.some((m) => m.id === 'lobby.live_gig_monitor')).toBe(false);
  });

  it('employee persona only sees portal-appropriate cards', () => {
    const caps = new Set<MetricCapability>([
      'planning:view',
      'ros:view',
      'portal:own_schedule',
      'portal:own_profile',
      'portal:own_pay',
    ]);
    const employeeCards = getRoleDefaults(caps, 'employee');
    // Action queue is a cross-role card an employee does see.
    expect(employeeCards.some((m) => m.id === 'lobby.action_queue')).toBe(true);
    // Deal pipeline is owner/pm/finance_admin only.
    expect(employeeCards.some((m) => m.id === 'lobby.deal_pipeline')).toBe(false);
  });

  it('enforces capability filter before role filter', () => {
    // Owner persona but no finance capability — finance cards drop out.
    const caps = new Set<MetricCapability>(['planning:view']);
    const ownerCards = getRoleDefaults(caps, 'owner');
    expect(ownerCards.some((m) => m.id === 'finance.revenue_collected')).toBe(false);
  });
});

// ─── Phase 4.3 — related metrics / follow-ups ───────────────────────────────

describe('RELATED_METRICS graph', () => {
  it('every referenced metric id exists in the registry', () => {
    for (const [sourceId, relatedIds] of Object.entries(RELATED_METRICS)) {
      expect(METRICS[sourceId], `unknown source id '${sourceId}'`).toBeDefined();
      for (const relatedId of relatedIds) {
        expect(METRICS[relatedId], `'${sourceId}' → '${relatedId}' is not in the registry`).toBeDefined();
      }
    }
  });

  it('no metric includes itself as a follow-up', () => {
    for (const [sourceId, relatedIds] of Object.entries(RELATED_METRICS)) {
      expect(relatedIds).not.toContain(sourceId);
    }
  });

  it('cap follow-ups at 3 per entry', () => {
    for (const [sourceId, relatedIds] of Object.entries(RELATED_METRICS)) {
      expect(relatedIds.length, `'${sourceId}' has > 3 follow-ups`).toBeLessThanOrEqual(3);
    }
  });
});

describe('getRelatedMetricChips', () => {
  it('returns the registry-declared follow-ups for a known metric', () => {
    const caps = new Set<string>(['finance:view', 'finance:reconcile', 'deals:read:global']);
    const chips = getRelatedMetricChips('finance.revenue_collected', caps);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.length).toBeLessThanOrEqual(3);
    // Every chip should have a non-empty label + value.
    for (const chip of chips) {
      expect(chip.label.length).toBeGreaterThan(0);
      expect(chip.value).toContain('Show me ');
      expect(METRICS[chip.metricId]).toBeDefined();
    }
  });

  it('drops follow-ups the viewer lacks capability for', () => {
    // Only finance:view — no reconcile. qbo_variance requires both.
    const caps = new Set<string>(['finance:view']);
    const chips = getRelatedMetricChips('finance.ar_aged_60plus', caps);
    // finance.qbo_variance requires finance:reconcile — should be filtered.
    expect(chips.some((c) => c.metricId === 'finance.qbo_variance')).toBe(false);
  });

  it('returns empty array for unknown metric id', () => {
    expect(getRelatedMetricChips('finance.does_not_exist', new Set())).toEqual([]);
  });

  it('returns empty array for metrics with no declared follow-ups', () => {
    // ops.aion_refusal_rate currently has no follow-ups.
    expect(getRelatedMetricChips('ops.aion_refusal_rate', new Set(['workspace:owner']))).toEqual([]);
  });
});

// ─── Arg validation ─────────────────────────────────────────────────────────

describe('argsSchema validation', () => {
  it('revenue_collected accepts valid period', () => {
    const def = METRICS['finance.revenue_collected'];
    const r = def.argsSchema.safeParse({ period_start: '2026-01-01', period_end: '2026-04-14' });
    expect(r.success).toBe(true);
  });

  it('revenue_collected rejects malformed date', () => {
    const def = METRICS['finance.revenue_collected'];
    const r = def.argsSchema.safeParse({ period_start: 'Jan 1', period_end: '2026-04-14' });
    expect(r.success).toBe(false);
  });

  it('revenue_collected accepts optional tz', () => {
    const def = METRICS['finance.revenue_collected'];
    const r = def.argsSchema.safeParse({
      period_start: '2026-01-01',
      period_end: '2026-04-14',
      tz: 'America/Los_Angeles',
    });
    expect(r.success).toBe(true);
  });

  it('1099_worksheet bounds year', () => {
    const def = METRICS['finance.1099_worksheet'];
    expect(def.argsSchema.safeParse({ year: 2026 }).success).toBe(true);
    expect(def.argsSchema.safeParse({ year: 1999 }).success).toBe(false);
    expect(def.argsSchema.safeParse({ year: 'twenty-six' }).success).toBe(false);
  });

  it('ar_aged_60plus accepts empty args', () => {
    const def = METRICS['finance.ar_aged_60plus'];
    expect(def.argsSchema.safeParse({}).success).toBe(true);
  });
});

// ─── callMetric: error paths ────────────────────────────────────────────────

describe('callMetric error paths', () => {
  it('returns ok:false for unknown metric id', async () => {
    const result = await callMetric('ws-1', 'finance.nonexistent_metric');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Unknown metric');
    }
  });

  it('returns ok:false on bad args', async () => {
    const result = await callMetric('ws-1', 'finance.revenue_collected', {
      period_start: 'not-a-date',
      period_end: '2026-04-14',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid args');
    }
  });
});

// ─── callMetric: scalar shaping ─────────────────────────────────────────────

describe('callMetric scalar shaping', () => {
  function makeMockClient(rpcReturn: { data?: unknown; error?: { message: string } | null }) {
    return {
      schema: () => ({
        rpc: vi.fn().mockResolvedValue(rpcReturn),
      }),
    } as unknown as Parameters<typeof callMetric>[3] extends { client?: infer C } ? C : never;
  }

  it('formats currency under $10K with full precision', async () => {
    const client = makeMockClient({
      data: [
        {
          primary_value: 1234.56,
          secondary_text: '3 payments',
          comparison_value: 1000,
          comparison_label: 'vs prior 30 days',
          sparkline_values: null,
        },
      ],
      error: null,
    });
    const result = await callMetric(
      'ws-1',
      'finance.revenue_collected',
      { period_start: '2026-04-01', period_end: '2026-04-30' },
      { client },
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'scalar') {
      expect(result.value.primary).toBe(1234.56);
      expect(result.value.primaryFormatted).toBe('$1,234.56');
      expect(result.value.unit).toBe('currency');
      expect(result.value.secondary).toBe('3 payments');
      expect(result.comparison?.value).toBe(1000);
      expect(result.comparison?.delta).toBe('+$234.56');
      expect(result.comparison?.direction).toBe('up');
      expect(result.comparison?.sentiment).toBe('positive');
      expect(result.comparison?.label).toBe('vs prior 30 days');
    }
  });

  it('formats currency over $10K compactly', async () => {
    const client = makeMockClient({
      data: [
        {
          primary_value: 128400,
          secondary_text: null,
          comparison_value: null,
          comparison_label: null,
          sparkline_values: null,
        },
      ],
      error: null,
    });
    const result = await callMetric(
      'ws-1',
      'finance.revenue_collected',
      { period_start: '2026-04-01', period_end: '2026-04-30', compare: false },
      { client },
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'scalar') {
      expect(result.value.primaryFormatted).toBe('$128.4K');
      expect(result.comparison).toBeUndefined();
    }
  });

  it('emits down/negative-sentiment comparison', async () => {
    const client = makeMockClient({
      data: [
        {
          primary_value: 5000,
          secondary_text: '2 invoices',
          comparison_value: 8000,
          comparison_label: 'vs prior 30 days',
          sparkline_values: null,
        },
      ],
      error: null,
    });
    const result = await callMetric('ws-1', 'finance.ar_aged_60plus', {}, { client });
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'scalar') {
      // Note: ar_aged_60plus has no comparison from the RPC currently, but if it did,
      // sentiment should propagate. Direction should be 'down' and sentiment 'negative'.
      // This test just confirms shaping works when comparison is present.
      expect(result.comparison?.direction).toBe('down');
      expect(result.comparison?.delta).toBe('-$3,000.00');
      expect(result.comparison?.sentiment).toBe('negative');
    }
  });

  it('treats empty rpc data as zero values', async () => {
    const client = makeMockClient({ data: [], error: null });
    const result = await callMetric('ws-1', 'finance.ar_aged_60plus', {}, { client });
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'scalar') {
      expect(result.value.primary).toBe(0);
      expect(result.value.primaryFormatted).toBe('$0.00');
    }
  });

  it('passes through count formatting', async () => {
    const client = makeMockClient({
      data: [
        {
          primary_value: 12,
          secondary_text: 'Last sync 2026-04-14 12:00 UTC',
          comparison_value: null,
          comparison_label: null,
          sparkline_values: null,
        },
      ],
      error: null,
    });
    const result = await callMetric('ws-1', 'finance.qbo_variance', {}, { client });
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'scalar') {
      expect(result.value.unit).toBe('count');
      expect(result.value.primaryFormatted).toBe('12');
    }
  });
});

// ─── callMetric: table shaping ──────────────────────────────────────────────

describe('callMetric table shaping', () => {
  function makeMockClient(rpcReturn: { data?: unknown; error?: { message: string } | null }) {
    return {
      schema: () => ({
        rpc: vi.fn().mockResolvedValue(rpcReturn),
      }),
    } as unknown as Parameters<typeof callMetric>[3] extends { client?: infer C } ? C : never;
  }

  it('returns rows as-is for table metrics', async () => {
    const rows = [
      { vendor_id: 'a', vendor_name: 'Acme', total_paid: 1200, bill_count: 3, meets_1099_threshold: true },
      { vendor_id: 'b', vendor_name: 'Beta', total_paid: 400, bill_count: 1, meets_1099_threshold: false },
    ];
    const client = makeMockClient({ data: rows, error: null });
    const result = await callMetric('ws-1', 'finance.1099_worksheet', { year: 2026 }, { client });
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'table') {
      expect(result.rows).toEqual(rows);
      expect(result.metricId).toBe('finance.1099_worksheet');
    }
  });

  it('returns empty rows when rpc has no data', async () => {
    const client = makeMockClient({ data: null, error: null });
    const result = await callMetric('ws-1', 'finance.1099_worksheet', { year: 2026 }, { client });
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'table') {
      expect(result.rows).toEqual([]);
    }
  });

  it('propagates rpc errors', async () => {
    const client = makeMockClient({ data: null, error: { message: 'permission denied' } });
    const result = await callMetric('ws-1', 'finance.1099_worksheet', { year: 2026 }, { client });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('permission denied');
    }
  });
});
