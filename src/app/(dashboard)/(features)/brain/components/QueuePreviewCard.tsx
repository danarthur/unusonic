'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';
import { useSession } from '@/shared/ui/providers/SessionContext';
import type { QueuePreviewItem } from '../lib/aion-chat-types';

interface QueuePreviewCardProps {
  text: string;
  items: QueuePreviewItem[];
  workspaceId?: string;
}

export function QueuePreviewCard({ text, items, workspaceId }: QueuePreviewCardProps) {
  const { sendChatMessage } = useSession();

  const handleDraft = (item: QueuePreviewItem) => {
    if (!workspaceId) return;
    sendChatMessage({
      text: `Draft a follow-up for the ${item.dealTitle} deal.`,
      workspaceId,
    });
  };

  const handleSkip = (item: QueuePreviewItem) => {
    if (!workspaceId) return;
    sendChatMessage({
      text: `Skip the ${item.dealTitle} deal for now.`,
      workspaceId,
    });
  };

  if (items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      <StagePanel elevated className="p-4 flex flex-col gap-1">
        {items.map((item, idx) => (
          <div
            key={item.dealId}
            className="flex items-center justify-between py-2.5"
            style={{
              borderBottom: idx < items.length - 1 ? '1px solid var(--stage-edge-subtle)' : 'none',
            }}
          >
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                {item.dealTitle}
              </span>
              <span className="text-xs text-[var(--stage-text-secondary)]">
                {item.reason}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-3">
              <button
                type="button"
                onClick={() => handleDraft(item)}
                className="stage-btn stage-btn-primary text-xs"
              >
                Draft
              </button>
              <button
                type="button"
                onClick={() => handleSkip(item)}
                className="stage-btn stage-btn-ghost text-xs"
              >
                Skip
              </button>
            </div>
          </div>
        ))}
      </StagePanel>
    </motion.div>
  );
}
