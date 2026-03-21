'use client';

import { cn } from '@/shared/lib/utils';
import type { NodeDetail } from '@/features/network-data';

interface TradeLedgerProps {
  details: NodeDetail;
}

export function TradeLedger({ details }: TradeLedgerProps) {
  const { inbound, outbound } = details.balance;
  const total = inbound + outbound;
  const inboundPct = total > 0 ? (inbound / total) * 100 : 0;
  const outboundPct = total > 0 ? (outbound / total) * 100 : 0;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium tracking-wide text-[var(--color-ink-muted)]">
        Ledger
      </h3>
      <div className="rounded-xl border border-[var(--color-mercury)] bg-white/5 p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-[var(--color-signal-success)]">In</span>
          <span className="font-mono text-[var(--color-ink)]">
            ${inbound.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-sm mb-3">
          <span className="text-[var(--color-signal-warning)]">Out</span>
          <span className="font-mono text-[var(--color-ink)]">
            ${outbound.toLocaleString()}
          </span>
        </div>
        <div className="h-2 flex rounded-full overflow-hidden bg-ink/10">
          <div
            className="bg-[var(--color-signal-success)]/70 transition-all duration-300"
            style={{ width: `${inboundPct}%` }}
          />
          <div
            className="bg-[var(--color-signal-warning)]/70 transition-all duration-300"
            style={{ width: `${outboundPct}%` }}
          />
        </div>
        <p className="text-xs text-[var(--color-ink-muted)] mt-2">
          {total === 0 ? (
            'No activity'
          ) : (
            <>
              {inbound >= outbound ? 'We owe them' : 'They owe us'}{' '}
              <span className="font-mono text-[var(--color-ink)]">
                ${Math.abs(inbound - outbound).toLocaleString()}
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
