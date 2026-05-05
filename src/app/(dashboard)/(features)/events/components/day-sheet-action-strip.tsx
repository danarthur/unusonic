'use client';

import { useState, useTransition } from 'react';
import { Eye, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { compileAndSendDaySheet } from '../actions/compile-and-send-day-sheet';
import { DaySheetPreview } from './day-sheet-preview';

type DaySheetActionStripProps = {
  eventId: string;
  dealId: string;
  crewCount: number;
  crewWithEmailCount: number;
};

export function DaySheetActionStrip({
  eventId,
  dealId,
  crewCount,
  crewWithEmailCount,
}: DaySheetActionStripProps) {
  const [isPending, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmingSend, setConfirmingSend] = useState(false);

  const handleSend = () => {
    if (crewWithEmailCount === 0) return;

    startTransition(async () => {
      const result = await compileAndSendDaySheet({ eventId, dealId });
      if (!result.success) {
        toast.error(result.error);
        setConfirmingSend(false);
        return;
      }
      // Partial-delivery case: some emails landed, some didn't. Surface the
      // failure in a warning-style toast so the PM can retry manually instead
      // of seeing a false-positive "all sent" confirmation.
      if (result.failedCount > 0) {
        const failedNames = result.failedRecipients.map((f) => f.name).join(', ');
        const description =
          `${result.sentCount} sent, ${result.failedCount} failed${
            result.skippedCount > 0 ? `, ${result.skippedCount} skipped` : ''
          }${failedNames ? ` — failed: ${failedNames}` : ''}`;
        toast.warning('Day sheet partially sent', { description });
        setConfirmingSend(false);
        return;
      }
      const parts = [`Day sheet sent to ${result.sentCount} crew`];
      if (result.skippedCount > 0) {
        parts.push(`${result.skippedCount} skipped (no email): ${result.skippedNames.join(', ')}`);
      }
      toast.success(parts.join('. '));
      setConfirmingSend(false);
    });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Mail size={16} strokeWidth={1.5} className="shrink-0" style={{ color: 'var(--stage-text-secondary)' }} aria-hidden />
          <p className="stage-readout">
            Day sheet
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <p className="stage-label" style={{ color: 'var(--stage-text-tertiary)' }}>
            {crewWithEmailCount} of {crewCount} crew have email
          </p>
          <button
            onClick={() => setPreviewOpen(true)}
            className="stage-btn text-xs px-3 py-1.5"
            style={{ color: 'var(--stage-text-secondary)' }}
          >
            <Eye size={14} strokeWidth={1.5} className="inline mr-1" />
            Preview
          </button>
          {confirmingSend ? (
            <div className="flex items-center gap-2">
              <span className="stage-label">Send to {crewWithEmailCount} crew?</span>
              <button className="stage-btn stage-btn-primary text-xs px-3 py-1.5" onClick={handleSend} disabled={isPending}>
                {isPending ? 'Sending\u2026' : 'Send'}
              </button>
              <button className="stage-btn stage-btn-secondary text-xs px-3 py-1.5" onClick={() => setConfirmingSend(false)}>Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingSend(true)}
              disabled={isPending || crewWithEmailCount === 0}
              className="stage-btn stage-btn-primary text-xs px-3 py-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              Send
            </button>
          )}
        </div>
      </div>

      {previewOpen && (
        <DaySheetPreview
          onClose={() => setPreviewOpen(false)}
          eventId={eventId}
          dealId={dealId}
        />
      )}
    </>
  );
}
