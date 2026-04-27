/**
 * Server-rendered admin telemetry dashboard layout. No client JS needed —
 * all five (well, six counting the deferred cost-per-seat placeholder)
 * cards render statically. Refresh by hitting reload.
 *
 * Stage Engineering: matte opaque surfaces, single light source, achromatic
 * accent, sentence case, no exclamation marks. Production vocabulary
 * ("show" not "event") doesn't apply much here — this is internal admin
 * telemetry copy, but the discipline still holds.
 */

import { cn } from '@/shared/lib/utils';
import { DismissRateTable, HitRateTable } from './MetricTables';
import type {
  DismissRateRow,
  HitRateRow,
  KillMetricRow,
  ToolDepthRow,
  ClickThroughRow,
  CostPerSeatRow,
} from './types';

type DashboardErrors = {
  dismiss: string | null;
  hit: string | null;
  tool: string | null;
  click: string | null;
  kill: string | null;
  cost: string | null;
};

interface TelemetryDashboardProps {
  dismissRate: DismissRateRow[];
  hitRate: HitRateRow[];
  toolDepth: ToolDepthRow | null;
  clickThrough: ClickThroughRow | null;
  killMetric: KillMetricRow[];
  costPerSeat: CostPerSeatRow[];
  generatedAt: string;
  errors: DashboardErrors;
}

export function TelemetryDashboard({
  dismissRate,
  hitRate,
  toolDepth,
  clickThrough,
  killMetric,
  costPerSeat,
  generatedAt,
  errors,
}: TelemetryDashboardProps) {
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10 space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="stage-label uppercase tracking-wide text-[var(--stage-text-tertiary)] text-[10px]">
            Internal admin
          </p>
          <h1 className="text-[20px] font-medium text-[var(--stage-text-primary)] mt-1">
            Aion telemetry
          </h1>
        </div>
        <div className="text-right text-[11px] text-[var(--stage-text-tertiary)]">
          <div>Last refreshed</div>
          <div className="font-mono">{formatTimestamp(generatedAt)}</div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <KillMetricCard rows={killMetric} error={errors.kill} />
        <ToolDepthCard data={toolDepth} error={errors.tool} />
        <ClickThroughCard data={clickThrough} error={errors.click} />
        <CostPerSeatCard rows={costPerSeat} error={errors.cost} />
        <DismissRateCard rows={dismissRate} error={errors.dismiss} />
        <HitRateCard rows={hitRate} error={errors.hit} />
      </div>

      <footer className="pt-6 border-t border-[var(--stage-edge-subtle)]">
        <p className="text-[11px] text-[var(--stage-text-tertiary)]">
          Cross-workspace aggregate — admin-only. Reads via service-role from
          ops.aion_events + cortex.aion_proactive_lines. No row leaves this
          surface that isn&apos;t already aggregate; per-user kill-metric stats
          stay scoped to the kill rule (≥{2} opens in any 7d window over 90d).
        </p>
      </footer>
    </div>
  );
}

// ─── Card frame ────────────────────────────────────────────────────────────

function Card({
  title,
  subtitle,
  children,
  error,
  flag,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  error?: string | null;
  flag?: 'attention' | null;
}) {
  return (
    <div
      className={cn(
        'rounded-[8px] border bg-[var(--stage-surface)]',
        'border-[var(--stage-edge-subtle)]',
        'p-5 flex flex-col min-h-[160px]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="stage-label uppercase tracking-wide text-[10px] text-[var(--stage-text-tertiary)]">
            {title}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-[var(--stage-text-tertiary)]">
              {subtitle}
            </p>
          )}
        </div>
        {flag === 'attention' && (
          <span
            className="text-[10px] uppercase tracking-wide text-[var(--stage-text-secondary)] bg-[oklch(1_0_0_/_0.06)] rounded px-1.5 py-0.5"
            aria-label="Attention threshold exceeded"
          >
            attention
          </span>
        )}
      </div>
      <div className="mt-3 flex-1">
        {error ? (
          <p className="text-[12px] text-[var(--stage-text-tertiary)] italic">
            metric unavailable — {error}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ─── Kill metric ───────────────────────────────────────────────────────────

function KillMetricCard({ rows, error }: { rows: KillMetricRow[]; error: string | null }) {
  const total = rows.length;
  return (
    <Card
      title="Brief-me kill metric"
      subtitle="users with ≥2 opens in any 7d window · 90d lookback"
      error={error}
    >
      <div className="flex items-baseline gap-3">
        <span className="text-[36px] tabular-nums text-[var(--stage-text-primary)] leading-none">
          {total}
        </span>
        <span className="text-[12px] text-[var(--stage-text-tertiary)]">
          {total === 1 ? 'qualifying user' : 'qualifying users'}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-[var(--stage-text-tertiary)]">
        {total === 0
          ? 'kill rule still untriggered — accumulating data'
          : 'Plan §3.9 U1 threshold: ≥30% of active owners'}
      </p>
    </Card>
  );
}

// ─── Tool depth ────────────────────────────────────────────────────────────

function ToolDepthCard({ data, error }: { data: ToolDepthRow | null; error: string | null }) {
  if (!data) {
    return (
      <Card title="Tool depth per turn" subtitle="7d window" error={error ?? 'no data'} >
        <div />
      </Card>
    );
  }
  return (
    <Card
      title="Tool depth per turn"
      subtitle="7d window · flag avg > 1.5"
      error={error}
      flag={data.threshold_exceeded ? 'attention' : null}
    >
      <div className="flex items-baseline gap-4">
        <span className="text-[28px] tabular-nums text-[var(--stage-text-primary)] leading-none">
          {Number(data.avg_depth).toFixed(2)}
        </span>
        <span className="text-[12px] text-[var(--stage-text-tertiary)]">avg</span>
        <span className="text-[16px] tabular-nums text-[var(--stage-text-secondary)] leading-none">
          {Number(data.p95_depth).toFixed(0)}
        </span>
        <span className="text-[12px] text-[var(--stage-text-tertiary)]">p95</span>
      </div>
      <p className="mt-2 text-[11px] text-[var(--stage-text-tertiary)]">
        {data.total_turns} {data.total_turns === 1 ? 'turn' : 'turns'} sampled
      </p>
    </Card>
  );
}

// ─── Click-through ─────────────────────────────────────────────────────────

function ClickThroughCard({ data, error }: { data: ClickThroughRow | null; error: string | null }) {
  if (!data) {
    return (
      <Card title="Pill click-through" subtitle="7d window" error={error ?? 'no data'} >
        <div />
      </Card>
    );
  }
  const pct = (Number(data.click_through_rate) * 100).toFixed(1);
  return (
    <Card title="Pill click-through" subtitle="7d window · clicks ÷ emits">
      <div className="flex items-baseline gap-3">
        <span className="text-[28px] tabular-nums text-[var(--stage-text-primary)] leading-none">
          {pct}%
        </span>
        <span className="text-[12px] text-[var(--stage-text-tertiary)]">
          {data.total_clicks} of {data.total_emits}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-[var(--stage-text-tertiary)]">
        {data.total_emits === 0
          ? 'no pills emitted in window — cron may be muted or in cold-start'
          : 'measures whether owners engage with what Aion surfaces'}
      </p>
    </Card>
  );
}

// ─── Cost per seat ─────────────────────────────────────────────────────────

function CostPerSeatCard({ rows, error }: { rows: CostPerSeatRow[]; error: string | null }) {
  if (rows.length === 0) {
    return (
      <Card title="Cost per seat" subtitle="30d window · LLM + embeddings" error={error}>
        <div className="flex items-baseline gap-3">
          <span className="text-[28px] tabular-nums text-[var(--stage-text-tertiary)] leading-none">$0.00</span>
          <span className="text-[12px] text-[var(--stage-text-tertiary)]">no traffic</span>
        </div>
        <p className="mt-2 text-[11px] text-[var(--stage-text-tertiary)]">
          accumulating — turns + embeddings populate once workspaces use Aion
        </p>
      </Card>
    );
  }
  const totalCost = rows.reduce((sum, r) => sum + Number(r.total_cost_usd ?? 0), 0);
  const totalSeats = rows.reduce((sum, r) => sum + Number(r.seat_count ?? 0), 0);
  const avgPerSeat = totalSeats > 0 ? totalCost / totalSeats : 0;
  return (
    <Card title="Cost per seat" subtitle="30d window · LLM + embeddings" error={error}>
      <div className="flex items-baseline gap-3">
        <span className="text-[28px] tabular-nums text-[var(--stage-text-primary)] leading-none">
          ${avgPerSeat.toFixed(2)}
        </span>
        <span className="text-[12px] text-[var(--stage-text-tertiary)]">avg</span>
      </div>
      <p className="mt-2 text-[11px] text-[var(--stage-text-tertiary)]">
        ${totalCost.toFixed(2)} total across {rows.length} {rows.length === 1 ? 'workspace' : 'workspaces'} · {totalSeats} {totalSeats === 1 ? 'seat' : 'seats'}
      </p>
    </Card>
  );
}

// ─── Dismiss rate / hit rate cards (tables extracted to MetricTables.tsx) ──

function DismissRateCard({ rows, error }: { rows: DismissRateRow[]; error: string | null }) {
  return (
    <Card
      title="Dismiss rate per signal"
      subtitle="30d window · not_useful only · flag > 35%"
      error={error}
      flag={rows.some((r) => r.above_threshold) ? 'attention' : null}
    >
      <DismissRateTable rows={rows} />
    </Card>
  );
}

function HitRateCard({ rows, error }: { rows: HitRateRow[]; error: string | null }) {
  return (
    <Card
      title="Hit rate per signal"
      subtitle="30d window · already_handled ÷ total"
      error={error}
    >
      <HitRateTable rows={rows} />
    </Card>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 19).replace('T', ' ') + 'Z';
  } catch {
    return iso;
  }
}
