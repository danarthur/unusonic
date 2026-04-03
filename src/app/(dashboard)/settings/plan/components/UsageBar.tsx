'use client';

import { motion } from 'framer-motion';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

interface UsageBarProps {
  current: number;
  limit: number | null;
  label: string;
}

function getBarColor(percentage: number): string {
  if (percentage >= 100) return 'oklch(0.65 0.18 20)';   // --unusonic-error
  if (percentage >= 80) return 'oklch(0.80 0.16 85)';    // --unusonic-warning
  return 'var(--stage-accent)';                           // achromatic white
}

export function UsageBar({ current, limit, label }: UsageBarProps) {
  if (limit === null) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--stage-text-secondary)]">{label}</span>
          <span className="text-sm font-medium tabular-nums text-[var(--stage-text-primary)]">
            {current} <span className="text-[var(--stage-text-secondary)] font-normal">(unlimited)</span>
          </span>
        </div>
      </div>
    );
  }

  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const barColor = getBarColor(percentage);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-[var(--stage-text-secondary)]">{label}</span>
        <span className="text-sm font-medium tabular-nums text-[var(--stage-text-primary)]">
          {current}/{limit}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--ctx-well, var(--stage-surface-nested))' }}
      >
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={STAGE_MEDIUM}
          style={{ background: barColor }}
        />
      </div>
    </div>
  );
}
