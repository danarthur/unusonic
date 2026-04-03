'use client';

import { useState, useTransition } from 'react';
import { Eye, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { StagePanel } from '@/shared/ui/stage-panel';
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

  const handleSend = () => {
    if (crewWithEmailCount === 0) return;

    const confirmed = window.confirm(
      `Send day sheet to ${crewWithEmailCount} crew member${crewWithEmailCount !== 1 ? 's' : ''}?`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await compileAndSendDaySheet({ eventId, dealId });
      if (result.success) {
        const parts = [`Day sheet sent to ${result.sentCount} crew`];
        if (result.skippedCount > 0) {
          parts.push(`${result.skippedCount} skipped (no email): ${result.skippedNames.join(', ')}`);
        }
        toast.success(parts.join('. '));
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Mail size={16} strokeWidth={1.5} className="shrink-0" style={{ color: 'var(--stage-text-secondary)' }} aria-hidden />
            <p className="text-sm font-medium tracking-tight" style={{ color: 'var(--stage-text-primary)' }}>
              Day sheet
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <p className="text-xs tracking-tight" style={{ color: 'var(--stage-text-tertiary)' }}>
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
            <button
              onClick={handleSend}
              disabled={isPending || crewWithEmailCount === 0}
              className="stage-btn stage-btn-primary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPending ? 'Sending\u2026' : 'Send'}
            </button>
          </div>
        </div>
      </StagePanel>

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
