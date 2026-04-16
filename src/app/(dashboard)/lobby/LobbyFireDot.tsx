'use client';

/**
 * LobbyFireDot — the quiet-when-healthy, loud-when-burning urgency indicator.
 *
 * Renders nothing when there are zero alerts. When alerts exist, shows a
 * small colored dot + count next to the view title in LobbyHeader. Clicking
 * opens a popover with the full triage list — direct links into the deal
 * or event that needs attention, dismiss-on-hover to clear stale items.
 *
 * This is Mike's "stage manager" model: the dashboard doesn't perform
 * urgency at you; it stays quiet until something actually needs a hand.
 * When you click the dot, you get a focused triage. Cards below own their
 * own per-domain notifications; the fire-dot is the cross-cutting signal.
 *
 * @module app/(dashboard)/lobby/LobbyFireDot
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { STAGE_STAGGER_CHILDREN } from '@/shared/lib/motion-constants';
import type { UrgencyAlert } from '@/widgets/dashboard/api/get-urgency-alerts';
import { AlertRow } from '@/widgets/urgency-strip/ui/AlertRow';

export interface LobbyFireDotProps {
  alerts: UrgencyAlert[];
}

export function LobbyFireDot({ alerts }: LobbyFireDotProps) {
  const [open, setOpen] = React.useState(false);
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const visible = React.useMemo(
    () => alerts.filter((a) => !dismissedIds.has(a.id)),
    [alerts, dismissedIds],
  );

  const dismiss = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  // Once every alert has been resolved or dismissed, close the popover so
  // the user doesn't stare at an empty panel after clearing the last row.
  React.useEffect(() => {
    if (open && visible.length === 0) setOpen(false);
  }, [open, visible.length]);

  if (visible.length === 0) return null;

  const hasCritical = visible.some((a) => a.severity === 'critical');
  const count = visible.length;
  const display = count > 9 ? '9+' : String(count);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${count} ${count === 1 ? 'item needs' : 'items need'} attention`}
          className={cn(
            'inline-flex items-center gap-1.5 h-6 px-1.5 rounded-full',
            'text-[11px] font-medium tabular-nums',
            'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
            hasCritical
              ? 'bg-[oklch(0.65_0.22_25/0.12)] text-[var(--color-unusonic-error,oklch(0.70_0.18_25))] hover:bg-[oklch(0.65_0.22_25/0.18)]'
              : 'bg-[oklch(0.78_0.14_60/0.10)] text-[var(--color-unusonic-warning,oklch(0.78_0.14_60))] hover:bg-[oklch(0.78_0.14_60/0.16)]',
            open && 'ring-1 ring-[var(--stage-accent)]/30',
          )}
          data-testid="lobby-fire-dot"
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              hasCritical
                ? 'bg-[var(--color-unusonic-error,oklch(0.70_0.18_25))]'
                : 'bg-[var(--color-unusonic-warning,oklch(0.78_0.14_60))]',
            )}
            aria-hidden
          />
          <span>{display}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[420px] p-0"
        data-surface="dropdown"
        data-testid="lobby-fire-dot-popover"
      >
        <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
          <p className="stage-label text-[var(--stage-text-tertiary)]">
            Needs attention
          </p>
          <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
            {count}
          </span>
        </div>
        <div className="border-t border-[var(--stage-edge-subtle)]" aria-hidden />
        <AnimatePresence>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: { staggerChildren: STAGE_STAGGER_CHILDREN },
              },
              hidden: {},
            }}
            className="flex flex-col gap-0.5 p-2 max-h-[320px] overflow-y-auto"
          >
            {visible.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onDismiss={dismiss}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
