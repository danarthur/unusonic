'use client';

import { useState, useTransition } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent } from '@/shared/ui/popover';
import {
  snoozeFollowUp,
  dismissFollowUp,
} from '@/app/(dashboard)/(features)/productions/actions/follow-up-actions';
import type { OwedTodayItem } from '../api/get-owed-today';

const PRESETS: { label: string; days: number }[] = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
];

interface SnoozeMenuProps {
  item: OwedTodayItem;
  onSnoozed: () => void;
  onDecisionRequired: () => void;
}

export function SnoozeMenu({ item, onSnoozed, onDecisionRequired }: SnoozeMenuProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const requireDecision = item.snoozeCount >= 2;

  const handleSnooze = (days: number) => {
    startTransition(async () => {
      const result = await snoozeFollowUp(item.queueItemId, days);
      if (result.success) {
        toast.success(`Snoozed for ${days} day${days !== 1 ? 's' : ''}`);
        setOpen(false);
        onSnoozed();
      } else if (result.requireDecision) {
        toast.error(result.message);
        setOpen(false);
        onDecisionRequired();
      } else {
        toast.error(result.error ?? 'Failed to snooze');
      }
    });
  };

  const handleMarkDead = () => {
    startTransition(async () => {
      const result = await dismissFollowUp(item.queueItemId);
      if (result.success) {
        toast.success('Marked dead');
        setOpen(false);
        onSnoozed();
      } else {
        toast.error(result.error ?? 'Failed to dismiss');
      }
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
          aria-label="Snooze"
        >
          {requireDecision ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
          {requireDecision ? 'Decide' : 'Snooze'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        {requireDecision ? (
          <div className="space-y-2">
            <p className="stage-label">Snoozed twice already</p>
            <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
              Log what happened or mark this dead so the queue stays honest.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={handleMarkDead}
              className="block w-full min-h-11 rounded-lg border border-[oklch(1_0_0_/_0.08)] px-3 text-sm text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors disabled:opacity-50"
            >
              Mark dead
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                disabled={pending}
                onClick={() => handleSnooze(p.days)}
                className="block w-full text-left min-h-11 rounded-lg px-3 text-sm text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
            {item.snoozeCount === 1 ? (
              <p className="px-3 pt-2 text-[10px] text-[var(--stage-text-tertiary)] uppercase tracking-wider">
                One snooze used — next is your last
              </p>
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
