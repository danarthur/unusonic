'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';
import type { ChartDataPoint } from '../lib/aion-chat-types';

// ---------------------------------------------------------------------------
// Semantic color map for chart segments
// ---------------------------------------------------------------------------
const SEGMENT_COLORS = [
  'var(--stage-accent)',
  'oklch(0.65 0 0)',
  'oklch(0.45 0 0)',
  'oklch(0.35 0 0)',
  'var(--color-unusonic-info)',
  'var(--color-unusonic-success)',
  'var(--color-unusonic-warning)',
];

function resolveColor(point: ChartDataPoint, index: number): string {
  if (point.color) {
    const map: Record<string, string> = {
      success: 'var(--color-unusonic-success)',
      warning: 'var(--color-unusonic-warning)',
      error: 'var(--color-unusonic-error)',
      info: 'var(--color-unusonic-info)',
      accent: 'var(--stage-accent)',
    };
    return map[point.color] ?? point.color;
  }
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}

// ---------------------------------------------------------------------------
// ChartCard
// ---------------------------------------------------------------------------

export type AionChartType = 'bar' | 'line' | 'area' | 'donut';

interface ChartCardProps {
  title?: string;
  chartType: AionChartType;
  data: ChartDataPoint[];
  valuePrefix?: string;
  valueSuffix?: string;
  /** When true, omits the outer StagePanel chrome so callers can nest inside their own panel. */
  bare?: boolean;
}

export function ChartCard({ title, chartType, data, valuePrefix = '', valueSuffix = '', bare = false }: ChartCardProps) {
  const body = (
    <>
      {title ? (
        <p className="stage-label font-mono select-none">
          {title}
        </p>
      ) : null}
      {chartType === 'bar' && <BarChart data={data} valuePrefix={valuePrefix} valueSuffix={valueSuffix} />}
      {(chartType === 'line' || chartType === 'area') && <LineChart data={data} filled={chartType === 'area'} />}
      {chartType === 'donut' && <DonutChart data={data} valuePrefix={valuePrefix} valueSuffix={valueSuffix} />}
    </>
  );

  if (bare) {
    return <div className="flex flex-col gap-3">{body}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      <StagePanel elevated className="p-4 flex flex-col gap-3">
        {body}
      </StagePanel>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart — horizontal bars
// ---------------------------------------------------------------------------

function BarChart({ data, valuePrefix, valueSuffix }: { data: ChartDataPoint[]; valuePrefix: string; valueSuffix: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex flex-col gap-2">
      {data.map((point, i) => {
        const pct = (point.value / max) * 100;
        return (
          <div key={point.label} className="flex items-center gap-3">
            <span className="text-xs text-[var(--stage-text-secondary)] w-20 shrink-0 truncate text-right">
              {point.label}
            </span>
            <div className="flex-1 h-5 bg-[oklch(1_0_0_/_0.03)] rounded-[3px] overflow-hidden relative">
              <motion.div
                className="h-full rounded-[3px]"
                style={{ background: resolveColor(point, i) }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={STAGE_LIGHT}
              />
            </div>
            <span className="text-xs text-[var(--stage-text-tertiary)] tabular-nums w-16 shrink-0">
              {valuePrefix}{typeof point.value === 'number' ? point.value.toLocaleString() : point.value}{valueSuffix}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line chart — SVG sparkline at full width
// ---------------------------------------------------------------------------

function LineChart({ data, filled = false }: { data: ChartDataPoint[]; filled?: boolean }) {
  const width = 400;
  const height = 80;
  const padding = 8;

  const { pathD, areaD } = useMemo(() => {
    if (data.length < 2) return { pathD: '', areaD: '' };
    const vals = data.map((d) => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const w = width - padding * 2;
    const h = height - padding * 2;
    const step = w / (data.length - 1);
    const points = vals.map((v, i) => {
      const x = padding + i * step;
      const y = padding + h - ((v - min) / range) * h;
      return `${x},${y}`;
    });
    const line = `M ${points.join(' L ')}`;
    const first = points[0].split(',');
    const last = points[points.length - 1].split(',');
    const area = `${line} L ${last[0]},${padding + h} L ${first[0]},${padding + h} Z`;
    return { pathD: line, areaD: area };
  }, [data]);

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" aria-hidden>
        {filled ? (
          <motion.path
            d={areaD}
            fill="var(--stage-accent)"
            style={{ opacity: 0.12 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.12 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        ) : null}
        <motion.path
          d={pathD}
          fill="none"
          stroke="var(--stage-accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.7 }}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </svg>
      <div className="flex justify-between px-2">
        {data.map((point) => (
          <span key={point.label} className="text-label text-[var(--stage-text-tertiary)] tabular-nums">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut chart — SVG ring segments
// ---------------------------------------------------------------------------

function DonutChart({ data, valuePrefix, valueSuffix }: { data: ChartDataPoint[]; valuePrefix: string; valueSuffix: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const r = 60;
  const stroke = 16;
  const circumference = 2 * Math.PI * r;
  const size = (r + stroke) * 2;

  let offset = 0;
  const segments = data.map((point, i) => {
    const share = point.value / total;
    const length = share * circumference;
    const seg = { ...point, length, offset, color: resolveColor(point, i) };
    offset += length;
    return seg;
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={120} height={120} aria-hidden>
        {segments.map((seg) => (
          <motion.circle
            key={seg.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeDasharray={`${seg.length} ${circumference - seg.length}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="round"
            style={{ opacity: 0.85 }}
            initial={{ strokeDasharray: `0 ${circumference}` }}
            animate={{ strokeDasharray: `${seg.length} ${circumference - seg.length}` }}
            transition={STAGE_LIGHT}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="text-sm font-medium tabular-nums"
          fill="var(--stage-text-primary)"
        >
          {valuePrefix}{total.toLocaleString()}{valueSuffix}
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-col gap-1.5">
        {data.map((point, i) => (
          <div key={point.label} className="flex items-center gap-2">
            <span
              className="block w-2 h-2 rounded-full shrink-0"
              style={{ background: resolveColor(point, i) }}
            />
            <span className="text-xs text-[var(--stage-text-secondary)]">{point.label}</span>
            <span className="text-xs text-[var(--stage-text-tertiary)] tabular-nums ml-auto">
              {valuePrefix}{point.value.toLocaleString()}{valueSuffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
