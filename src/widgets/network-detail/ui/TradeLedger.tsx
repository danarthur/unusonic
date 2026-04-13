'use client';

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
      <h3 className="stage-label text-[var(--stage-text-secondary)]">
        Ledger
      </h3>
      <div className="flex justify-between text-[length:var(--stage-data-size)] mb-2">
        <span className="text-[var(--stage-text-secondary)]">In</span>
        <span className="font-mono tabular-nums text-[var(--stage-text-primary)]">
          ${inbound.toLocaleString()}
        </span>
      </div>
      <div className="flex justify-between text-[length:var(--stage-data-size)] mb-3">
        <span className="text-[var(--stage-text-secondary)]">Out</span>
        <span className="font-mono tabular-nums text-[var(--stage-text-primary)]">
          ${outbound.toLocaleString()}
        </span>
      </div>
      <div className="h-2 flex rounded-full overflow-hidden bg-[var(--stage-surface-elevated)]">
        <div
          className="bg-[var(--stage-text-primary)]/40"
          style={{ width: `${inboundPct}%` }}
        />
        <div
          className="bg-[var(--stage-text-primary)]/20"
          style={{ width: `${outboundPct}%` }}
        />
      </div>
      <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] mt-2">
        {total === 0 ? (
          'No activity'
        ) : (
          <>
            {inbound >= outbound ? 'We owe them' : 'They owe us'}{' '}
            <span className="font-mono tabular-nums text-[var(--stage-text-primary)]">
              ${Math.abs(inbound - outbound).toLocaleString()}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
