'use client';

import React, { useState, useRef } from 'react';
import { MessageSquare, Mail, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';
import { normalizedEditDistance, classifyEdit } from '@/shared/lib/edit-distance';
import { logFollowUpAction } from '@/app/(dashboard)/(features)/events/actions/follow-up-actions';

export type DraftEditedData = {
  dealId: string;
  dealTitle: string;
  original: string;
  edited: string;
  channel: 'sms' | 'email';
  classification: 'approved_unchanged' | 'light_edit' | 'heavy_edit';
  distance: number;
};

interface DraftPreviewCardProps {
  text: string;
  draft: string;
  dealId: string;
  dealTitle: string;
  channel: 'sms' | 'email';
  onDraftEdited?: (data: DraftEditedData) => void;
}

export function DraftPreviewCard({ text, draft: initialDraft, dealId, dealTitle, channel: initialChannel, onDraftEdited }: DraftPreviewCardProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [channel, setChannel] = useState(initialChannel);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const originalRef = useRef(initialDraft);

  const trackAndLog = async (actionType: string) => {
    const distance = normalizedEditDistance(originalRef.current, draft);
    const classification = classifyEdit(distance);
    await logFollowUpAction(dealId, actionType, channel, `Draft ${actionType} from Aion chat`, draft, {
      draftOriginal: originalRef.current,
      editClassification: classification,
      editDistance: distance,
    });
  };

  const handleSendText = async () => {
    const body = encodeURIComponent(draft);
    window.open(`sms:?&body=${body}`, '_blank');
    await trackAndLog('sms_sent');
    onDraftEdited?.({
      dealId,
      dealTitle,
      original: originalRef.current,
      edited: draft,
      channel,
      classification: classifyEdit(normalizedEditDistance(originalRef.current, draft)),
      distance: normalizedEditDistance(originalRef.current, draft),
    });
    setSent(true);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    await trackAndLog(channel === 'sms' ? 'sms_sent' : 'email_sent');
    onDraftEdited?.({
      dealId,
      dealTitle,
      original: originalRef.current,
      edited: draft,
      channel,
      classification: classifyEdit(normalizedEditDistance(originalRef.current, draft)),
      distance: normalizedEditDistance(originalRef.current, draft),
    });
  };

  if (sent) {
    return (
      <StagePanel elevated className="p-4">
        <p className="text-xs text-[var(--stage-text-secondary)]">
          Draft sent for {dealTitle}.
        </p>
      </StagePanel>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      <StagePanel elevated className="p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
            Draft for: {dealTitle}
          </span>
          {/* Channel toggle */}
          <div className="flex items-center gap-1">
            {(['sms', 'email'] as const).map((ch) => {
              const Icon = ch === 'sms' ? MessageSquare : Mail;
              const isActive = channel === ch;
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannel(ch)}
                  className={cn(
                    'p-1.5 transition-colors',
                    isActive
                      ? 'text-[var(--stage-text-primary)] bg-[var(--stage-accent-muted)]'
                      : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
                  )}
                  style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  aria-label={ch}
                >
                  <Icon size={13} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Editable draft */}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          className="w-full resize-none bg-[var(--ctx-well)] text-[var(--stage-text-primary)] leading-relaxed p-3 outline-none border border-[oklch(1_0_0_/_0.08)] focus-visible:border-[var(--stage-accent)] focus-visible:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)]"
          style={{
            fontSize: 'var(--stage-input-font-size, 13px)',
            borderRadius: 'var(--stage-radius-input, 6px)',
          }}
        />

        {/* Actions */}
        <div className="flex items-center gap-2">
          {channel === 'sms' && (
            <button
              type="button"
              onClick={handleSendText}
              className="stage-btn stage-btn-primary text-xs inline-flex items-center gap-1.5"
            >
              <MessageSquare size={12} />
              Send via text
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="stage-btn stage-btn-secondary text-xs inline-flex items-center gap-1.5"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </StagePanel>
    </motion.div>
  );
}
