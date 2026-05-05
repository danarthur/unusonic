'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Sheet, SheetContent } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { logFollowUpAction } from '@/app/(dashboard)/(features)/events/actions/follow-up-actions';
import type { OwedTodayItem } from '../api/get-owed-today';

type Channel = 'call' | 'sms' | 'email' | 'in_person';
type Outcome = 'reached' | 'left_message' | 'no_answer' | 'done';

const CHANNEL_LABELS: Record<Channel, string> = {
  call: 'Call',
  sms: 'Text',
  email: 'Email',
  in_person: 'In person',
};

const OUTCOME_LABELS: Record<Outcome, string> = {
  reached: 'Talked to them',
  left_message: 'Left a message',
  no_answer: 'No answer',
  done: 'Done',
};

const SUMMARY: Record<Outcome, string> = {
  reached: 'Reached the client',
  left_message: 'Left a voicemail/message',
  no_answer: 'No answer',
  done: 'Handled',
};

function toActionType(channel: Channel): 'call_logged' | 'sms_sent' | 'email_sent' | 'note_added' {
  if (channel === 'call') return 'call_logged';
  if (channel === 'sms') return 'sms_sent';
  if (channel === 'email') return 'email_sent';
  return 'note_added';
}

function toLogChannel(channel: Channel): 'call' | 'sms' | 'email' | 'manual' {
  if (channel === 'in_person') return 'manual';
  return channel;
}

interface LogOutcomeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: OwedTodayItem;
  onLogged: () => void;
  initialChannel?: Channel;
}

export function LogOutcomeSheet({
  open,
  onOpenChange,
  item,
  onLogged,
  initialChannel,
}: LogOutcomeSheetProps) {
  const [channel, setChannel] = useState<Channel>(
    initialChannel ?? (item.suggestedChannel === 'manual' ? 'in_person' : (item.suggestedChannel as Channel) ?? 'call'),
  );
  const [outcome, setOutcome] = useState<Outcome>('reached');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    const actionType = toActionType(channel);
    const logChannel = toLogChannel(channel);
    const summary = note.trim() || SUMMARY[outcome];

    startTransition(async () => {
      const result = await logFollowUpAction(
        item.dealId,
        actionType,
        logChannel,
        summary,
        note.trim() || undefined,
      );
      if (result.success) {
        toast.success('Logged');
        onOpenChange(false);
        setNote('');
        setOutcome('reached');
        onLogged();
      } else {
        toast.error('error' in result ? result.error : 'Failed to log');
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent ariaLabel={`Log outcome for ${item.clientName ?? item.dealTitle}`} className="p-6">
        <div className="space-y-5">
          <div>
            <p className="stage-label">Log outcome</p>
            <p className="stage-readout-md mt-0.5 truncate">{item.clientName ?? item.dealTitle}</p>
          </div>

          <div>
            <p className="stage-label mb-2">Channel</p>
            <div className="grid grid-cols-2 gap-2">
              {(['call', 'sms', 'email', 'in_person'] as Channel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                    channel === c
                      ? 'border-[var(--stage-text-primary)] text-[var(--stage-text-primary)]'
                      : 'border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                  }`}
                >
                  {CHANNEL_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="stage-label mb-2">Outcome</p>
            <div className="grid grid-cols-2 gap-2">
              {(['reached', 'left_message', 'no_answer', 'done'] as Outcome[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(o)}
                  className={`min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                    outcome === o
                      ? 'border-[var(--stage-text-primary)] text-[var(--stage-text-primary)]'
                      : 'border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
                  }`}
                >
                  {OUTCOME_LABELS[o]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="stage-label mb-2">Note (optional)</p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="One line about what happened…"
              className="w-full min-h-11 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)] px-3 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus:border-[var(--stage-text-secondary)] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={pending}>
              {pending ? 'Logging…' : 'Save'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
