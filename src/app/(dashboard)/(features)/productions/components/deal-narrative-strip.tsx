'use client';

/**
 * DealNarrativeStrip — renders the Aion-authored deal narrative below the
 * header strip on the deal page (Phase 3 §3.5 B5).
 *
 * Reads cortex.memory where source_type='narrative' + source_id=deal_id via
 * the getDealNarrative server action. One row per deal; updated by
 * update_narrative (Aion write tool) through confirmAndWriteAionNarrative.
 *
 * Client component — parents are already client (deal-lens / prism). Fetch
 * via the server action in a useEffect so data stays server-read (RLS-safe)
 * without forcing the parent chain back to the server-component world.
 *
 * Rendering rules:
 *   • No narrative yet → render nothing. Honest empty state — do not show an
 *     "Add narrative" CTA. Aion writes these; users don't.
 *   • Narrative present → muted prose block with a relative timestamp.
 */

import React, { useEffect, useState } from 'react';
import { getDealNarrative } from '../actions/get-deal-narrative';

type Narrative = {
  text: string;
  updatedAt: string;
  authoredBy: string | null;
};

interface DealNarrativeStripProps {
  dealId: string;
  className?: string;
}

export function DealNarrativeStrip({ dealId, className }: DealNarrativeStripProps) {
  const [narrative, setNarrative] = useState<Narrative | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getDealNarrative(dealId);
      if (!cancelled) setNarrative(result);
    })();
    return () => { cancelled = true; };
  }, [dealId]);

  if (!narrative) return null;

  return (
    <div
      className={[
        'flex flex-col gap-1.5 px-4 py-3',
        'bg-[var(--stage-surface-elevated,oklch(0.22_0_0))]',
        'border border-[oklch(1_0_0_/_0.06)]',
        className ?? '',
      ].filter(Boolean).join(' ')}
      style={{ borderRadius: 'var(--stage-radius-card, 10px)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)]">
          Narrative
        </span>
        <span className="text-[10px] text-[var(--stage-text-tertiary)]">·</span>
        <span className="text-[10px] text-[var(--stage-text-tertiary)]">
          Updated {formatRelative(narrative.updatedAt)}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--stage-text-secondary)] whitespace-pre-wrap">
        {narrative.text}
      </p>
    </div>
  );
}

function formatRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < 0) return 'just now';

  const mins = Math.round(delta / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.round(months / 12);
  return `${years}y ago`;
}
