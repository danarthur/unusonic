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
      <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-secondary)]">
        Ledger
      </h3>
      <div className="stage-panel rounded-2xl p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-[var(--color-unusonic-success)]">In</span>
          <span className="font-mono text-[var(--stage-text-primary)]">
            ${inbound.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-sm mb-3">
          <span className="text-[var(--color-unusonic-warning)]">Out</span>
          <span className="font-mono text-[var(--stage-text-primary)]">
            ${outbound.toLocaleString()}
          </span>
        </div>
        <div className="h-2 flex rounded-full overflow-hidden bg-[var(--stage-text-primary)]/10">
          <div
            className="bg-[var(--color-unusonic-success)]/70 transition-all duration-300"
            style={{ width: `${inboundPct}%` }}
          />
          <div
            className="bg-[var(--color-unusonic-warning)]/70 transition-all duration-300"
            style={{ width: `${outboundPct}%` }}
          />
        </div>
        <p className="text-xs text-[var(--stage-text-secondary)] mt-2">
          {total === 0 ? (
            'No activity'
          ) : (
            <>
              {inbound >= outbound ? 'We owe them' : 'They owe us'}{' '}
              <span className="font-mono text-[var(--stage-text-primary)]">
                ${Math.abs(inbound - outbound).toLocaleString()}
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
