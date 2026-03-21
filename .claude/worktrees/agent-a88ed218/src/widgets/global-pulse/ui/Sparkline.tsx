'use client';

import React from 'react';

/**
 * Stroke-only micro sparkline (no chart lib). Design: opacity ~50%, thin stroke.
 * Values normalized to 0–1; path goes left-to-right.
 */
export function Sparkline({
  values,
  width = 32,
  height = 16,
  stroke = 'var(--color-neon-blue)',
  opacity = 0.5,
  className = '',
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  opacity?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = width - 2;
  const h = height - 2;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => {
    const x = 1 + i * step;
    const y = 1 + h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const d = points.length > 0 ? `M ${points.join(' L ')}` : 'M 0 0';
  return (
    <svg
      width={width}
      height={height}
      className={className}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity }}
      />
    </svg>
  );
}

/**
 * Mini bar strip for "next 7 days" load. Each bar height = relative count (0–1).
 */
export function MiniBarStrip({
  values,
  width = 32,
  height = 16,
  fill = 'var(--color-neon-blue)',
  opacity = 0.5,
  className = '',
}: {
  values: number[];
  width?: number;
  height?: number;
  fill?: string;
  opacity?: number;
  className?: string;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const barW = (width - 2) / values.length - 1;
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      {values.map((v, i) => {
        const barH = (v / max) * (height - 4);
        const x = 1 + i * (barW + 1);
        const y = height - 2 - barH;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={Math.max(barW, 2)}
            height={barH}
            fill={fill}
            style={{ opacity }}
            rx={1}
          />
        );
      })}
    </svg>
  );
}
