'use client';

/**
 * Shared constants + reusable bits for the catalog edit page-client cluster.
 *
 * Extracted from page-client.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - CATEGORIES — package category select options.
 *   - inputClass / labelClass — the form's repeated Tailwind class strings.
 *   - HelpTooltip — the portaled help bubble used three times in the pricing
 *     fields (price / floor price / target cost). Each instance manages its
 *     own open state + position; the only difference between the three was
 *     copy + bubble width, so they collapse into one component.
 */

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import type { PackageCategory } from '@/features/sales/api/package-actions';

export const CATEGORIES: { value: PackageCategory; label: string }[] = [
  { value: 'package', label: 'Package (The Bundle)' },
  { value: 'service', label: 'Service (Labor/Time)' },
  { value: 'rental', label: 'Rental (Inventory)' },
  { value: 'talent', label: 'Talent (Performance)' },
  { value: 'retail_sale', label: 'Retail (Consumables)' },
  { value: 'fee', label: 'Fee (Digital/Admin)' },
];

export const inputClass =
  'w-full px-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]';

export const labelClass =
  'block text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1';

type HelpTooltipProps = {
  /** Accessible label for the trigger button. */
  ariaLabel: string;
  /** Bubble content. */
  children: React.ReactNode;
  /** Bubble width in px (used for off-screen flip math + Tailwind sizing). */
  widthPx?: number;
  /** Extra class names for the bubble (e.g. width override w-56 vs w-64). */
  bubbleClassName?: string;
};

/**
 * Portaled help bubble triggered by a small (?) icon. Hover/click both work;
 * mouse leave closes after a 120ms grace window so the user can move into
 * the bubble itself. Positioning flips below the trigger when the bubble
 * would clip the viewport top.
 */
export function HelpTooltip({ ariaLabel, children, widthPx = 260, bubbleClassName }: HelpTooltipProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const computePosition = () => {
    const el = triggerRef.current;
    if (!el || typeof document === 'undefined') return;
    const r = el.getBoundingClientRect();
    const w = widthPx;
    const h = 72;
    const left = Math.max(8, Math.min(r.left - w, r.right - w));
    const top = r.top - h - 8 < 8 ? r.bottom + 8 : Math.max(8, r.top - h - 8);
    setPosition({ top, left });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={computePosition}
        onMouseLeave={() => {
          closeTimeoutRef.current = setTimeout(() => setOpen(false), 120);
        }}
        onClick={(e) => {
          e.preventDefault();
          if (open) setOpen(false);
          else computePosition();
        }}
        className="inline-flex text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] cursor-help rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] p-0.5"
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        <HelpCircle size={14} strokeWidth={1.5} />
      </button>
      {typeof document !== 'undefined' &&
        open &&
        position &&
        createPortal(
          <div
            className={
              'fixed z-[9999] max-w-[calc(100vw-16px)] px-3 py-2.5 text-xs font-normal text-[var(--stage-text-secondary)] leading-relaxed rounded-[var(--stage-radius-nested)] border border-[oklch(1_0_0_/_0.08)] shadow-[0_8px_32px_-8px_oklch(0_0_0/0.35)] bg-[var(--stage-surface-raised)] ' +
              (bubbleClassName ?? 'w-64')
            }
            style={{ top: position.top, left: position.left }}
            role="tooltip"
            onMouseEnter={() => {
              if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
              }
              setOpen(true);
            }}
            onMouseLeave={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
