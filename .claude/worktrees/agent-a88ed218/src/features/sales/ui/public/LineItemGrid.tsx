'use client';

import { motion } from 'framer-motion';
import type { PublicProposalItem } from '../../model/public-proposal';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface LineItemGridProps {
  items: PublicProposalItem[];
  className?: string;
}

function formatPrice(unitPrice: string | number, quantity: number): string {
  const total = parseFloat(String(unitPrice)) * quantity;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(total);
}

export function LineItemGrid({ items, className }: LineItemGridProps) {
  if (!items.length) return null;

  const isSingle = items.length === 1;

  return (
    <div
      className={cn(
        'grid',
        isSingle ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        className
      )}
    >
      {items.map((item, i) => {
        const imageUrl = item.packageImageUrl ?? null;

        return (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: i * 0.04 }}
            className={cn(
              'group rounded-2xl overflow-hidden',
              'bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)]',
              'liquid-levitation liquid-panel-hover',
              'transition-all duration-300',
              isSingle && 'max-h-[320px] sm:max-h-[360px] flex flex-col'
            )}
          >
            {imageUrl ? (
              <div
                className={cn(
                  'relative bg-[var(--muted)] overflow-hidden shrink-0',
                  isSingle ? 'aspect-[4/3] max-h-[180px] sm:max-h-[200px]' : 'aspect-[4/3] sm:aspect-square'
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
            ) : (
              <div
                className={cn(
                  'relative bg-[var(--muted)] flex items-center justify-center shrink-0',
                  isSingle ? 'aspect-[4/3] max-h-[180px] sm:max-h-[200px]' : 'aspect-[4/3] sm:aspect-square'
                )}
              >
                <span className="text-3xl font-light text-ink-muted/50 select-none">
                  {item.name.charAt(0)}
                </span>
              </div>
            )}
            <div className="p-4 sm:p-5 flex flex-col gap-2">
              <h3 className="font-medium text-ink tracking-tight text-base leading-snug">
                {item.name}
              </h3>
              {item.description ? (
                <p className="text-sm text-ink-muted line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              ) : null}
              <div className="mt-auto pt-2 flex items-baseline justify-between gap-2">
                <p className="text-xs text-ink-muted">
                  {item.quantity} ×{' '}
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }).format(parseFloat(String(item.unit_price ?? 0)))}
                </p>
                <p className="text-base font-semibold text-ink tabular-nums">
                  {formatPrice(item.unit_price, item.quantity ?? 1)}
                </p>
              </div>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}
