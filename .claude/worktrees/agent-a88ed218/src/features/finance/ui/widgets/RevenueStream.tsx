/**
 * Revenue Stream (Top Drivers) – Where is the money coming from?
 * Format: Item Name ......... $ Amount (top 3 items by revenue).
 * @module features/finance/ui/widgets/RevenueStream
 */

'use client';

import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { formatCurrency } from '../../model/types';
import type { TopRevenueItemDTO } from '../../model/types';

export interface RevenueStreamProps {
  topItems: TopRevenueItemDTO[];
  /** Max amount for bar scale (optional) */
  maxAmount?: number;
  className?: string;
}

export function RevenueStream({
  topItems,
  className,
}: RevenueStreamProps) {
  const displayItems = topItems.slice(0, 3);

  return (
    <LiquidPanel
      className={`flex flex-col gap-5 p-6 min-h-[200px] min-w-0 overflow-visible ${className ?? ''}`}
    >
      <div className="shrink-0 space-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
          Top Revenue Drivers
        </h2>
        <p className="text-xs text-ink-muted">
          Where is the money coming from?
        </p>
      </div>

      {displayItems.length === 0 ? (
        <p className="text-sm text-ink-muted shrink-0 pt-2">No line items yet</p>
      ) : (
        <ul className="space-y-5 shrink-0 pt-1">
          {displayItems.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 min-w-0"
            >
              <span
                className="text-sm text-ink truncate min-w-0 flex-1 leading-snug"
                title={item.description}
              >
                {item.description || 'Line item'}
              </span>
              <span className="font-mono text-sm font-medium text-ink shrink-0 tabular-nums">
                {formatCurrency(item.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </LiquidPanel>
  );
}
