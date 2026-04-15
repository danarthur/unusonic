/**
 * Unit tests for the Phase 3.1 call_metric tool factory + invokeCallMetric
 * shaping helper.
 *
 * Verifies:
 *  - Valid scalar id → analytics_result block with pills + freshness
 *  - Valid table id → data_table fallback
 *  - Unknown id → error text (Phase 3.4 upgrades to refusal)
 *  - Bad args → error surfaces validation message
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// The route/tool imports `callMetric` from shared/lib/metrics/call, which in turn
// imports the server supabase client. Mock the client at its source so the
// test doesn't require a real supabase instance. Mock is module-scope, then
// per-test we override the client via the `opts.client` injection path used by
// the metrics tests themselves.
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    schema: () => ({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) }),
  }),
}));

import { invokeCallMetric } from '../analytics';
import * as callModule from '@/shared/lib/metrics/call';

function mockScalarCall(result: Parameters<typeof callModule.callMetric>[1] extends string ? unknown : unknown) {
  return result;
}

describe('invokeCallMetric — scalar path', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an analytics_result block for a valid scalar id', async () => {
    const spy = vi.spyOn(callModule, 'callMetric').mockResolvedValue({
      ok: true,
      kind: 'scalar',
      metricId: 'finance.revenue_collected',
      args: { period_start: '2026-01-01', period_end: '2026-04-14', compare: true },
      value: {
        primary: 128400,
        primaryFormatted: '$128.4K',
        unit: 'currency',
        secondary: '3 payments',
      },
      comparison: {
        value: 114000,
        delta: '+$14.4K',
        direction: 'up',
        sentiment: 'positive',
        label: 'vs prior 30 days',
      },
      sparkline: [1, 2, 3, 4, 5, 6, 7],
      computedAt: new Date().toISOString(),
    });

    const result = await invokeCallMetric('ws-1', 'finance.revenue_collected', {
      period_start: '2026-01-01',
      period_end: '2026-04-14',
    });

    expect(spy).toHaveBeenCalled();
    expect(result.kind).toBe('analytics_result');
    if (result.kind === 'analytics_result') {
      expect(result.block.type).toBe('analytics_result');
      expect(result.block.metricId).toBe('finance.revenue_collected');
      expect(result.block.title).toBe('Revenue collected');
      expect(result.block.value.primary).toBe('$128.4K');
      expect(result.block.comparison?.sentiment).toBe('positive');
      // Period pills collapse to a single editable pill.
      const period = result.block.pills.find((p) => p.key === 'period');
      expect(period).toBeDefined();
      expect(period?.editable).toBe(true);
      expect(period?.choiceSetKey).toBe('period');
      // Internal `compare` arg must NOT render as a pill.
      expect(result.block.pills.find((p) => p.key === 'compare')).toBeUndefined();
      expect(result.block.freshness.cadence).toBe('hourly');
    }
  });
});

describe('invokeCallMetric — table path', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a data_table fallback for a valid table id', async () => {
    vi.spyOn(callModule, 'callMetric').mockResolvedValue({
      ok: true,
      kind: 'table',
      metricId: 'finance.unreconciled_payments',
      args: {},
      rows: [
        {
          invoice_number: 'INV-001',
          amount: 500,
          method: 'stripe',
          received_at: '2026-04-10',
          qbo_sync_status: 'failed',
          qbo_last_error: 'Auth',
        },
      ],
      computedAt: new Date().toISOString(),
    });

    const result = await invokeCallMetric('ws-1', 'finance.unreconciled_payments', {});
    expect(result.kind).toBe('data_table');
    if (result.kind === 'data_table' && result.block) {
      expect(result.block.type).toBe('data_table');
      expect(result.block.title).toBe('Unreconciled payments');
      expect(result.block.columns.length).toBeGreaterThan(0);
      expect(result.block.rows.length).toBe(1);
      expect(result.block.rows[0].invoice_number).toBe('INV-001');
      expect(result.block.rows[0].amount).toBe(500);
    }
  });
});

describe('invokeCallMetric — error paths', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces an error for an unknown metric id (Phase 3.4 upgrades to refusal)', async () => {
    const result = await invokeCallMetric('ws-1', 'finance.does_not_exist', {});
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain("Unknown metric");
    }
  });

  it('surfaces the validation error for malformed args', async () => {
    // callMetric itself runs the Zod schema before any RPC — no mock needed.
    const result = await invokeCallMetric('ws-1', 'finance.revenue_collected', {
      period_start: 'not-a-date',
      period_end: '2026-04-14',
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('Invalid args');
    }
  });
});
