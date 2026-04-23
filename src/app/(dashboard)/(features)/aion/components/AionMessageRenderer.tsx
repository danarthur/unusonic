'use client';

import React from 'react';
import { useSession } from '@/shared/ui/providers/SessionContext';
import type { AionMessageContent } from '../lib/aion-chat-types';
import { DraftPreviewCard, type DraftEditedData } from './DraftPreviewCard';
import { ReplyPreviewCard } from './ReplyPreviewCard';
import { FollowupPreviewCard } from './FollowupPreviewCard';
import { NarrativePreviewCard } from './NarrativePreviewCard';
import { QueuePreviewCard } from './QueuePreviewCard';
import { LearnedSummaryCard } from './LearnedSummaryCard';
import { ScorecardCard } from './ScorecardCard';
import { ChartCard } from './ChartCard';
import { DataTableCard } from './DataTableCard';
import { AnalyticsResultCard } from './AnalyticsResultCard';
import { RefusalCard } from './RefusalCard';
import type { SuggestionChip } from '../lib/aion-chat-types';

interface AionMessageRendererProps {
  contents: AionMessageContent[];
  workspaceId?: string;
  onDraftEdited?: (data: DraftEditedData) => void;
}

/**
 * Renders structured Aion message content blocks.
 * Text and suggestion blocks are handled by ChatInterface directly.
 * This renderer handles the richer content types.
 */
export function AionMessageRenderer({ contents, workspaceId, onDraftEdited }: AionMessageRendererProps) {
  const { sendChatMessage } = useSession();
  const handleArgEdit = React.useCallback(
    (message: string) => {
      if (!workspaceId) return;
      void sendChatMessage({ text: message, workspaceId });
    },
    [sendChatMessage, workspaceId],
  );
  // Phase 3.4: refusal suggestion chips dispatch the chip's `value` as a new
  // user message, matching the existing `suggestions` content-type behavior.
  // No new pipeline — reuses the chat's standard user-turn path.
  const handleRefusalSuggestion = React.useCallback(
    (chip: SuggestionChip) => {
      if (!workspaceId) return;
      void sendChatMessage({ text: chip.value, workspaceId });
    },
    [sendChatMessage, workspaceId],
  );

  return (
    <>
      {contents.map((block, idx) => {
        switch (block.type) {
          case 'draft_preview':
            return (
              <DraftPreviewCard
                key={idx}
                text={block.text}
                draft={block.draft}
                dealId={block.dealId}
                dealTitle={block.dealTitle}
                channel={block.channel}
                onDraftEdited={onDraftEdited}
              />
            );
          case 'follow_up_queue':
            return (
              <QueuePreviewCard
                key={idx}
                text={block.text}
                items={block.items}
                workspaceId={workspaceId}
              />
            );
          case 'learned_summary':
            return (
              <LearnedSummaryCard
                key={idx}
                text={block.text}
                rules={block.rules}
              />
            );
          case 'scorecard':
            return (
              <ScorecardCard
                key={idx}
                title={block.title}
                metrics={block.metrics}
              />
            );
          case 'chart':
            return (
              <ChartCard
                key={idx}
                title={block.title}
                chartType={block.chartType}
                data={block.data}
                valuePrefix={block.valuePrefix}
                valueSuffix={block.valueSuffix}
              />
            );
          case 'data_table':
            return (
              <DataTableCard
                key={idx}
                title={block.title}
                columns={block.columns}
                rows={block.rows}
              />
            );
          case 'analytics_result':
            return (
              <AnalyticsResultCard
                key={idx}
                result={block}
                onArgEdit={handleArgEdit}
              />
            );
          case 'refusal':
            // Phase 3.4: sibling content type for out-of-registry questions.
            return (
              <RefusalCard
                key={idx}
                refusal={block}
                onSuggestionTap={handleRefusalSuggestion}
              />
            );
          // Phase 3 §3.5 — write-tool preview cards (diff-confirm-execute).
          case 'reply_preview':
            return (
              <ReplyPreviewCard
                key={idx}
                draftId={block.draftId}
                threadId={block.threadId}
                subject={block.subject}
                to={block.to}
                bodyText={block.bodyText}
              />
            );
          case 'followup_preview':
            return (
              <FollowupPreviewCard
                key={idx}
                draftId={block.draftId}
                dealId={block.dealId}
                scheduledFor={block.scheduledFor}
                channel={block.channel}
                draftBody={block.draftBody}
                remindOwnerFirst={block.remindOwnerFirst}
              />
            );
          case 'narrative_preview':
            return (
              <NarrativePreviewCard
                key={idx}
                draftId={block.draftId}
                previousNarrative={block.previousNarrative}
                newNarrative={block.newNarrative}
              />
            );
          // text and suggestions are handled by ChatInterface
          default:
            return null;
        }
      })}
    </>
  );
}
