'use client';

import { motion } from 'framer-motion';
import { X, ExternalLink, Zap } from 'lucide-react';
import Link from 'next/link';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { AionInsight } from '@/app/(dashboard)/(features)/aion/actions/aion-insight-actions';

const URGENCY_STRIPE: Record<string, string> = {
  critical: 'stage-stripe-error',
  high: 'stage-stripe-warning',
  medium: 'stage-stripe-accent',
  low: 'stage-stripe-neutral',
};

interface InsightRowProps {
  insight: AionInsight;
  onAction: (insight: AionInsight) => void;
  onDismiss: (id: string) => void;
}

export function InsightRow({ insight, onAction, onDismiss }: InsightRowProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, overflow: 'hidden' }}
      transition={STAGE_LIGHT}
      className={cn(
        'flex items-center gap-2 py-1.5 pl-2 rounded-sm',
        URGENCY_STRIPE[insight.urgency] ?? 'stage-stripe-neutral',
      )}
    >
      {/* Title — truncated single line */}
      <button
        type="button"
        onClick={() => onAction(insight)}
        className="flex-1 min-w-0 text-left group"
      >
        <span className="stage-readout-sm text-[var(--stage-text-primary)] truncate block group-hover:text-[var(--stage-accent)] transition-colors">
          {insight.title}
        </span>
      </button>

      {/* Action button */}
      {insight.suggestedAction && (
        <button
          type="button"
          onClick={() => onAction(insight)}
          className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors whitespace-nowrap"
        >
          <Zap className="w-3 h-3" strokeWidth={1.5} />
          Go
        </button>
      )}

      {/* Deep link to entity page */}
      {insight.href && (
        <Link
          href={insight.href}
          className="shrink-0 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          title="Open deal"
        >
          <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      )}

      {/* Dismiss */}
      <button
        type="button"
        onClick={() => onDismiss(insight.id)}
        className="shrink-0 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
        title="Dismiss"
      >
        <X className="w-3 h-3" strokeWidth={1.5} />
      </button>
    </motion.div>
  );
}
