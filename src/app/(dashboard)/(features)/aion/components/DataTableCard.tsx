'use client';

import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';
import type { DataTableColumn } from '../lib/aion-chat-types';

const MAX_VISIBLE_ROWS = 10;

interface DataTableCardProps {
  title: string;
  columns: DataTableColumn[];
  rows: Record<string, string | number>[];
}

export function DataTableCard({ title, columns, rows }: DataTableCardProps) {
  const visibleRows = rows.slice(0, MAX_VISIBLE_ROWS);
  const overflow = rows.length - MAX_VISIBLE_ROWS;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      <StagePanel elevated className="p-4 flex flex-col gap-3">
        <p className="stage-label font-mono select-none">
          {title}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'stage-label font-mono text-[var(--stage-text-tertiary)] pb-2 pr-3 last:pr-0',
                      col.align === 'right' ? 'text-right' : 'text-left',
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-[oklch(1_0_0_/_0.04)] last:border-b-0">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'py-2 pr-3 last:pr-0 text-[var(--stage-text-primary)]',
                        col.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                      )}
                    >
                      {row[col.key] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {overflow > 0 && (
          <p className="text-xs text-[var(--stage-text-tertiary)]">
            and {overflow} more...
          </p>
        )}
      </StagePanel>
    </motion.div>
  );
}
