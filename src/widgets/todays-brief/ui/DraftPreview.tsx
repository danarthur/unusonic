'use client';

import { useRef, useEffect } from 'react';

interface DraftPreviewProps {
  draft: string;
  subject?: string;
  channel: 'sms' | 'email';
  recipientEmail?: string;
  recipientName?: string;
  dealTitle?: string;
  onDraftChange: (draft: string) => void;
  onSubjectChange: (subject: string) => void;
}

export function DraftPreview({
  draft,
  subject,
  channel,
  recipientEmail,
  recipientName,
  dealTitle,
  onDraftChange,
  onSubjectChange,
}: DraftPreviewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  return (
    <div className="flex flex-col gap-4">
      {/* Deal context */}
      {dealTitle && (
        <p className="stage-label text-[var(--stage-text-tertiary)]">
          Re: {dealTitle}
        </p>
      )}

      {/* Recipient */}
      {(recipientName || recipientEmail) && (
        <div className="flex items-center gap-2">
          <span className="stage-label text-[var(--stage-text-tertiary)]">To</span>
          <span className="text-xs text-[var(--stage-text-secondary)]">
            {recipientName}{recipientEmail ? ` (${recipientEmail})` : ''}
          </span>
        </div>
      )}

      {/* Subject line (email only) */}
      {channel === 'email' && (
        <div className="flex flex-col gap-1">
          <label className="stage-label text-[var(--stage-text-tertiary)]">Subject</label>
          <input
            type="text"
            value={subject ?? ''}
            onChange={(e) => onSubjectChange(e.target.value)}
            className="text-sm text-[var(--stage-text-primary)] bg-transparent border-b border-[var(--stage-edge-subtle)] py-1 outline-none focus-visible:border-[var(--stage-accent)] transition-colors"
          />
        </div>
      )}

      {/* Draft body */}
      <div className="flex flex-col gap-1">
        <label className="stage-label text-[var(--stage-text-tertiary)]">Message</label>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          rows={4}
          className="text-sm text-[var(--stage-text-primary)] bg-transparent border-b border-[var(--stage-edge-subtle)] py-2 outline-none focus-visible:border-[var(--stage-accent)] transition-colors resize-none leading-relaxed"
        />
        {channel === 'sms' && (
          <span className="text-[10px] text-[var(--stage-text-tertiary)] self-end">
            {draft.length} chars
          </span>
        )}
      </div>
    </div>
  );
}
