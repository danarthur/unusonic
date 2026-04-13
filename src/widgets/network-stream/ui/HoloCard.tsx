'use client';

import { type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Pencil } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

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
      : 'border-[var(--color-unusonic-success)] border-2 shadow-[0_0_0_1px_var(--color-unusonic-success)/25]'
    : highlight
      ? 'border-[var(--stage-accent)]/50 shadow-[0_4px_24px_-1px_oklch(0_0_0/0.2),0_0_0_1px_var(--stage-accent)/30,inset_0_1px_0_0_oklch(1_0_0_/_0.10)]'
      : 'border-[var(--stage-edge-subtle)] hover:border-[var(--stage-edge-subtle)]';

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
        'group relative flex w-full flex-col rounded-[var(--stage-radius-panel)] text-left',
        'bg-[var(--stage-surface-raised)]',
        'border transition-[border-color,box-shadow,background-color,color] duration-[80ms] cursor-pointer',
        'shadow-[0_4px_24px_-1px_oklch(0_0_0/0.2),inset_0_1px_0_0_oklch(1_0_0_/_0.10)]',
        'text-[var(--stage-text-secondary)]',
        'stage-hover overflow-hidden hover:text-[var(--stage-text-primary)]',
        'hover:shadow-[0_20px_40px_-4px_oklch(0_0_0/0.25),inset_0_1px_0_0_oklch(1_0_0/0.08)]',
        completed && !useBrand && 'hover:shadow-[0_0_0_1px_var(--color-unusonic-success)/40,0_20px_40px_-4px_oklch(0_0_0/0.25),0_8px_24px_-4px_var(--color-unusonic-success)/20]',
        useBrand && '[border-color:var(--completed-color)] hover:shadow-[0_0_0_1px_var(--completed-color),0_20px_40px_-4px_oklch(0_0_0/0.25),0_8px_24px_-4px_var(--completed-color)/20]',
        borderStyle,
        variant === 'primary' && 'bg-[var(--stage-accent-muted)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]',
        className
      )}
      transition={STAGE_LIGHT}
    >
      <div className="flex h-full min-h-0 flex-col p-6 text-left">
        {step != null && (
          <span className="mb-4 block stage-label text-[var(--stage-text-tertiary)]">
            Step {step}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-row items-center gap-4">
          <div
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-solid transition-[border-color,background-color,box-shadow] duration-[80ms]',
              completed && !useBrand && 'border-[var(--color-unusonic-success)] bg-[var(--color-unusonic-success)]/15 shadow-[0_0_0_2px_var(--color-unusonic-success)/30] group-hover:border-[var(--color-unusonic-success)] group-hover:shadow-[0_0_0_3px_var(--color-unusonic-success)/40]',
              completed && useBrand && 'group-hover:shadow-[0_0_0_3px_var(--completed-color)/50]',
              !completed && 'border-[var(--stage-edge-subtle)] bg-[var(--stage-accent-muted)] group-hover:border-[var(--stage-edge-subtle)] group-hover:bg-[var(--stage-accent-muted)]',
              pulse && 'stage-skeleton'
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
                completed && !useBrand && 'text-[var(--color-unusonic-success)]',
                !completed && 'text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-accent)]'
              )}
              style={completed && useBrand && accentColor ? { color: accentColor } : undefined}
              strokeWidth={1.5}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium tracking-tight text-[var(--stage-text-primary)] text-[length:var(--stage-data-size)] leading-snug">
              {title}
            </p>
            <p className="text-[length:var(--stage-readout-sm-size)] font-normal leading-relaxed text-[var(--stage-text-secondary)]">
              {description}
            </p>
          </div>
        </div>
        {completed && (
          <span
            className={cn(
              'mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg py-1.5 pr-2 pl-2 -ml-2 stage-badge-text transition-[background-color,color] duration-[80ms]',
              useBrand ? 'hover:bg-[var(--completed-color)]/15' : 'text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/10'
            )}
            style={useBrand && accentColor ? { color: accentColor } : undefined}
          >
            <Pencil className="size-3.5 shrink-0" strokeWidth={1.5} />
            Edit
          </span>
        )}
      </div>
    </motion.button>
  );
}
