'use client';

import { type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Pencil } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface HoloCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  /** Step number in the flow (1, 2, 3) for clear hierarchy. */
  step?: number;
  /** Primary CTA – subtle background emphasis (no permanent border). */
  variant?: 'default' | 'primary';
  /** Accent border on this card (e.g. when this card is hovered). */
  highlight?: boolean;
  /** Optional pulse on icon. */
  pulse?: boolean;
  /** Completed state: border + icon tint, still clickable to re-edit. */
  completed?: boolean;
  /** When completed, use this color for border/icon/edit (e.g. org brand color). Solid. Falls back to success. */
  completedColor?: string | null;
  className?: string;
}

/**
 * Liquid glass card for Genesis zero-state. Glass physics + step hierarchy.
 * When completed + completedColor: solid brand border/icon/edit. Else success green.
 */
export function HoloCard({ title, description, icon: Icon, onClick, step, variant = 'default', highlight, pulse, completed, completedColor, className }: HoloCardProps) {
  const useBrand = completed && completedColor?.trim();
  const accentColor = useBrand ? completedColor!.trim() : undefined;
  const borderStyle = completed
    ? useBrand
      ? undefined
      : 'border-[var(--color-signal-success)] border-2 shadow-[0_0_0_1px_var(--color-signal-success)/25]'
    : highlight
      ? 'border-[var(--color-silk)]/50 shadow-[0_4px_24px_-1px_oklch(0_0_0/0.2),0_0_0_1px_var(--color-silk)/30,inset_0_1px_0_0_var(--color-glass-highlight)]'
      : 'border-[var(--color-mercury)] hover:border-white/15';

  const completedStyle: React.CSSProperties | undefined = completed && useBrand
    ? {
        ['--completed-color' as string]: accentColor,
        borderColor: accentColor,
        borderWidth: 2,
      }
    : undefined;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      style={completed ? completedStyle : undefined}
      className={cn(
        'group relative flex w-full flex-col rounded-3xl text-left',
        'bg-[var(--color-glass-surface)] backdrop-blur-xl',
        'border transition-[border-color,box-shadow,background-color,color] duration-200 cursor-pointer',
        'shadow-[0_4px_24px_-1px_oklch(0_0_0/0.2),inset_0_1px_0_0_var(--color-glass-highlight)]',
        'text-[var(--color-ink-muted)]',
        'hover:bg-[var(--glass-bg-hover)] hover:text-[var(--color-ink)]',
        'hover:shadow-[0_20px_40px_-4px_oklch(0_0_0/0.25),inset_0_1px_0_0_oklch(1_0_0/0.08)]',
        completed && !useBrand && 'hover:shadow-[0_0_0_1px_var(--color-signal-success)/40,0_20px_40px_-4px_oklch(0_0_0/0.25),0_8px_24px_-4px_var(--color-signal-success)/20]',
        useBrand && '[border-color:var(--completed-color)] hover:shadow-[0_0_0_1px_var(--completed-color),0_20px_40px_-4px_oklch(0_0_0/0.25),0_8px_24px_-4px_var(--completed-color)/20]',
        borderStyle,
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-silk)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-canvas)]',
        className
      )}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    >
      <div className="flex h-full min-h-0 flex-col p-6 text-left">
        {step != null && (
          <span className="mb-4 block text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]/60">
            Step {step}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-row items-center gap-4">
          <div
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-solid backdrop-blur-sm transition-[border-color,background-color,box-shadow] duration-200',
              completed && !useBrand && 'border-[var(--color-signal-success)] bg-[var(--color-signal-success)]/15 shadow-[0_0_0_2px_var(--color-signal-success)/30] group-hover:border-[var(--color-signal-success)] group-hover:shadow-[0_0_0_3px_var(--color-signal-success)/40]',
              completed && useBrand && 'group-hover:shadow-[0_0_0_3px_var(--completed-color)/50]',
              !completed && 'border-[var(--color-mercury)] bg-white/5 group-hover:border-white/10 group-hover:bg-white/8',
              pulse && 'animate-pulse'
            )}
            style={
              completed && useBrand && accentColor
                ? {
                    borderColor: 'var(--completed-color)',
                    backgroundColor: 'color-mix(in srgb, var(--completed-color) 18%, transparent)',
                    boxShadow: '0 0 0 2px color-mix(in srgb, var(--completed-color) 35%, transparent)',
                  }
                : undefined
            }
          >
            <Icon
              className={cn(
                'size-6',
                completed && !useBrand && 'text-[var(--color-signal-success)]',
                !completed && 'text-[var(--color-ink-muted)] group-hover:text-[var(--color-silk)]'
              )}
              style={completed && useBrand && accentColor ? { color: accentColor } : undefined}
              strokeWidth={1.5}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium tracking-tight text-[var(--color-ink)] text-base leading-snug">
              {title}
            </p>
            <p className="text-sm font-light leading-relaxed text-[var(--color-ink-muted)]">
              {description}
            </p>
          </div>
        </div>
        {completed && (
          <span
            className={cn(
              'mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg py-1.5 pr-2 pl-2 -ml-2 text-xs font-medium uppercase tracking-widest transition-[transform,background-color,color] duration-200 hover:scale-[1.02]',
              useBrand ? 'hover:bg-[var(--completed-color)]/15' : 'text-[var(--color-signal-success)] hover:bg-[var(--color-signal-success)]/10'
            )}
            style={useBrand && accentColor ? { color: accentColor } : undefined}
          >
            <Pencil className="size-3.5 shrink-0" strokeWidth={2} />
            Edit
          </span>
        )}
      </div>
    </motion.button>
  );
}
