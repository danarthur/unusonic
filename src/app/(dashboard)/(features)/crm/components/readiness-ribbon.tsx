'use client';

import { motion } from 'framer-motion';
import { Users, Package, MapPin, Truck, UserCheck } from 'lucide-react';
import { STAGE_LIGHT, STAGE_STAGGER_CHILDREN } from '@/shared/lib/motion-constants';
import type { ReadinessData, ReadinessSignal, ReadinessStatus } from '../lib/compute-readiness';

// ── Color mapping ──

const STATUS_COLOR: Record<ReadinessStatus, string> = {
  green: 'var(--color-unusonic-success)',
  amber: 'var(--color-unusonic-warning)',
  red: 'var(--color-unusonic-error)',
  grey: 'var(--stage-text-tertiary)',
};

const STATUS_BG: Record<ReadinessStatus, string> = {
  green: 'color-mix(in oklch, var(--color-unusonic-success) 12%, transparent)',
  amber: 'color-mix(in oklch, var(--color-unusonic-warning) 12%, transparent)',
  red: 'color-mix(in oklch, var(--color-unusonic-error) 12%, transparent)',
  grey: 'color-mix(in oklch, var(--stage-text-tertiary) 8%, transparent)',
};

const STATUS_BORDER: Record<ReadinessStatus, string> = {
  green: 'color-mix(in oklch, var(--color-unusonic-success) 25%, transparent)',
  amber: 'color-mix(in oklch, var(--color-unusonic-warning) 25%, transparent)',
  red: 'color-mix(in oklch, var(--color-unusonic-error) 25%, transparent)',
  grey: 'color-mix(in oklch, var(--stage-text-tertiary) 15%, transparent)',
};

// ── Signal icons ──

const SIGNAL_ICON: Record<string, typeof Users> = {
  crew: Users,
  gear: Package,
  venue: MapPin,
  transport: Truck,
  client: UserCheck,
};

const SIGNAL_ORDER: (keyof ReadinessData)[] = ['crew', 'gear', 'venue', 'transport', 'client'];

// ── Full pill ──

function ReadinessPill({ signal, signalKey }: { signal: ReadinessSignal; signalKey: string }) {
  const Icon = SIGNAL_ICON[signalKey];
  const color = STATUS_COLOR[signal.status];
  const bg = STATUS_BG[signal.status];
  const border = STATUS_BORDER[signal.status];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={STAGE_LIGHT}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
      style={{
        backgroundColor: bg,
        border: `1px solid ${border}`,
      }}
    >
      {Icon && <Icon size={14} style={{ color }} aria-hidden />}
      <span
        className="text-[11px] font-medium tracking-tight leading-none"
        style={{ color: 'var(--stage-text-secondary)' }}
      >
        {signal.label}
      </span>
      {signal.fraction && (
        <span
          className="text-[10px] tabular-nums leading-none"
          style={{ color: 'var(--stage-text-tertiary)' }}
        >
          {signal.fraction}
        </span>
      )}
    </motion.div>
  );
}

// ── Mini dot ──

function ReadinessDot({ signal }: { signal: ReadinessSignal }) {
  const color = STATUS_COLOR[signal.status];
  const isGrey = signal.status === 'grey';

  return (
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0"
      style={{
        backgroundColor: color,
        opacity: isGrey ? 0.4 : 1,
      }}
      title={`${signal.label}: ${signal.status}${signal.fraction ? ` (${signal.fraction})` : ''}`}
    />
  );
}

// ── Public component ──

type ReadinessRibbonProps =
  | { readiness: ReadinessData; mini?: false }
  | { readiness: ReadinessData; mini: true };

export function ReadinessRibbon({ readiness, mini }: ReadinessRibbonProps) {
  if (mini) {
    return (
      <div className="flex items-center" style={{ gap: '3px' }}>
        {SIGNAL_ORDER.map((key) => (
          <ReadinessDot key={key} signal={readiness[key]} />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: STAGE_STAGGER_CHILDREN } },
      }}
      className="flex flex-wrap items-center"
      style={{ gap: '8px' }}
    >
      {SIGNAL_ORDER.map((key) => (
        <ReadinessPill key={key} signal={readiness[key]} signalKey={key} />
      ))}
    </motion.div>
  );
}
