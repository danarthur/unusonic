'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Wallet, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';

type LedgerLensProps = {
  eventId: string;
  eventTitle: string | null;
};

/** Phase 3: Particle Stream — "Label - Amount - Date/Status". Replace with real transactions when finance API is wired. */
const PLACEHOLDER_PARTICLES = [
  { id: '1', label: 'Deposit Paid', inbound: true, amount: '$5,000', dateOrStatus: 'Jan 12' },
  { id: '2', label: 'Vendor Payment (Tent)', inbound: false, amount: '$1,200', dateOrStatus: 'Pending' },
] as const;

export function LedgerLens({ eventId, eventTitle }: LedgerLensProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SIGNAL_PHYSICS}
      className="flex flex-col gap-6"
    >
      {/* Phase 3: Waterfall card — Top: Total Revenue (Green), Middle: Estimated Cost (Red/Muted), Bottom: Projected Margin (Gold) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <LiquidPanel className="p-6 rounded-[28px] border-l-4 border-l-[var(--color-signal-success)]">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">Total revenue</p>
          <p className="text-xl font-semibold text-[var(--color-signal-success)] tracking-tight tabular-nums">—</p>
        </LiquidPanel>
        <LiquidPanel className="p-6 rounded-[28px] border-l-4 border-l-[var(--color-signal-error)]">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">Estimated cost</p>
          <p className="text-xl font-semibold text-ink-muted tracking-tight tabular-nums">—</p>
        </LiquidPanel>
        <LiquidPanel className="p-6 rounded-[28px] border-l-4 border-l-[var(--color-signal-warning)]">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted mb-1">Projected margin</p>
          <p className="text-xl font-semibold text-[var(--color-signal-warning)] tracking-tight tabular-nums">—</p>
        </LiquidPanel>
      </div>

      {/* Phase 3: Particle Stream — "Label - Amount - Date/Status" */}
      <LiquidPanel className="p-6 rounded-[28px] border-l-4 border-l-[var(--color-neon-rose)]">
        <h2 className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-4">
          Transaction stream
        </h2>
        <ul className="space-y-2">
          {PLACEHOLDER_PARTICLES.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 py-2 border-b border-[var(--glass-border)] last:border-0 text-sm"
            >
              {p.inbound ? (
                <ArrowDownRight size={16} className="shrink-0 text-[var(--color-signal-success)]" aria-hidden />
              ) : (
                <ArrowUpRight size={16} className="shrink-0 text-ink-muted" aria-hidden />
              )}
              <span className="text-ink">{p.label}</span>
              <span className="tabular-nums text-ink-muted">— {p.amount}</span>
              <span className="ml-auto text-ink-muted text-xs">{p.dateOrStatus}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-muted mt-4">
          Open finance for full P&amp;L and invoices.
        </p>
      </LiquidPanel>

      <Link
        href={`/events/${eventId}/finance`}
        className="inline-flex items-center gap-2 px-4 py-3 rounded-full border border-[var(--glass-border)] text-ceramic font-medium text-sm hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
      >
        <Wallet size={18} aria-hidden />
        Open finance
      </Link>
    </motion.div>
  );
}
