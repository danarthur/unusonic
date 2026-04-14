'use client';

import React from 'react';
import type { AionMessageContent } from '../lib/aion-chat-types';
import { DraftPreviewCard, type DraftEditedData } from './DraftPreviewCard';
import { QueuePreviewCard } from './QueuePreviewCard';
import { LearnedSummaryCard } from './LearnedSummaryCard';
import { ScorecardCard } from './ScorecardCard';
import { ChartCard } from './ChartCard';
import { DataTableCard } from './DataTableCard';

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
          // text and suggestions are handled by ChatInterface
          default:
            return null;
        }
      })}
    </>
  );
}
