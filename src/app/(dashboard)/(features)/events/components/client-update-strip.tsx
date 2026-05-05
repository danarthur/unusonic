'use client';

import { useState, useTransition } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { sendClientUpdate } from '../actions/send-client-update';

type ClientUpdateStripProps = {
  eventId: string;
  dealId: string;
  clientName: string | null;
};

export function ClientUpdateStrip({
  eventId,
  dealId,
  clientName,
}: ClientUpdateStripProps) {
  const [isPending, startTransition] = useTransition();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [confirmingSend, setConfirmingSend] = useState(false);

  const handleSend = () => {
    startTransition(async () => {
      const result = await sendClientUpdate({
        eventId,
        dealId,
        personalNote: note.trim() || null,
      });
      if (result.success) {
        toast.success(`Update sent to ${result.sentTo}`);
        setNote('');
        setNoteOpen(false);
        setConfirmingSend(false);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 8px)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Send size={16} strokeWidth={1.5} className="shrink-0" style={{ color: 'var(--stage-text-secondary)' }} aria-hidden />
          <p className="stage-readout">
            Client update
          </p>
          {clientName && (
            <span className="stage-label truncate" style={{ color: 'var(--stage-text-tertiary)' }}>
              to {clientName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className="stage-btn text-xs px-3 py-1.5"
            style={{ color: 'var(--stage-text-secondary)' }}
          >
            <MessageSquare size={14} strokeWidth={1.5} className="inline mr-1" />
            {noteOpen ? 'Hide note' : 'Add note'}
          </button>
          {confirmingSend ? (
            <div className="flex items-center gap-2">
              <span className="stage-label">{clientName ? `Send update to ${clientName}?` : 'Send update to client?'}</span>
              <button className="stage-btn stage-btn-primary text-xs px-3 py-1.5" onClick={handleSend} disabled={isPending}>
                {isPending ? 'Sending\u2026' : 'Send'}
              </button>
              <button className="stage-btn stage-btn-secondary text-xs px-3 py-1.5" onClick={() => setConfirmingSend(false)}>Cancel</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingSend(true)}
              disabled={isPending}
              className="stage-btn stage-btn-primary text-xs px-3 py-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {isPending ? 'Sending\u2026' : 'Send update'}
            </button>
          )}
        </div>
      </div>

      {noteOpen && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Personal note to include in the update..."
          maxLength={2000}
          rows={2}
          className="w-full bg-[var(--ctx-well,var(--stage-surface))] border border-[oklch(1_0_0_/_0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:border-[var(--stage-accent)] resize-none tracking-tight"
          style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
        />
      )}
    </div>
  );
}
