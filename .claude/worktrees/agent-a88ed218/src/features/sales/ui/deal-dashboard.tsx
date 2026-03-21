'use client';

import React from 'react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { PipelineTracker } from './pipeline-tracker';
import { ProposalBuilder } from './proposal-builder';
import type { DealRoomDTO } from '../model/types';
import { cn } from '@/shared/lib/utils';

export interface DealDashboardProps {
  data: DealRoomDTO;
  className?: string;
}

export function DealDashboard({ data, className }: DealDashboardProps) {
  const { gig, pipeline, contract, stats } = data;

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Top: Pipeline */}
      <LiquidPanel className="p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-4">
          Deal pipeline
        </h2>
        <PipelineTracker
          currentStage={pipeline.currentStage}
          stages={pipeline.stages}
        />
      </LiquidPanel>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        {/* Left: Proposal Builder */}
        <div className="min-h-0">
          {data.dealId ? (
            <ProposalBuilder
              dealId={data.dealId}
              workspaceId={gig.workspaceId}
              initialProposal={data.activeProposal}
              clientEmail={gig.clientEmail}
            />
          ) : (
            <LiquidPanel className="p-6">
              <p className="text-sm text-ink-muted">No deal linked to this event. Link from CRM to edit the proposal.</p>
            </LiquidPanel>
          )}
        </div>

        {/* Right: Deal Info — Client Card + Contract Status Card */}
        <div className="flex flex-col gap-6">
          {/* Client Card */}
          <LiquidPanel className="p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-4">
              Client
            </h2>
            <div className="space-y-2">
              <p className="text-lg font-medium text-ink tracking-tight">
                {gig.clientName ?? '—'}
              </p>
              {gig.clientEmail && (
                <a
                  href={`mailto:${gig.clientEmail}`}
                  className="text-sm text-ink-muted hover:text-ink transition-colors"
                >
                  {gig.clientEmail}
                </a>
              )}
            </div>
          </LiquidPanel>

          {/* Contract Status Card */}
          <LiquidPanel className="p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-4">
              Contract
            </h2>
            {contract ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize',
                      contract.status === 'signed' &&
                        'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                      (contract.status === 'draft' || contract.status === 'sent') &&
                        'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    )}
                  >
                    {contract.status}
                  </span>
                </div>
                {contract.signedAt && (
                  <p className="text-sm text-ink-muted">
                    Signed {new Date(contract.signedAt).toLocaleDateString()}
                  </p>
                )}
                {contract.pdfUrl && (
                  <a
                    href={contract.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-ink hover:underline"
                  >
                    View PDF
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No contract yet</p>
            )}
          </LiquidPanel>

          {/* Optional: Deal stats */}
          <LiquidPanel className="p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-4">
              Deal stats
            </h2>
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-ink-muted uppercase tracking-wide">Total value</p>
                <p className="text-xl font-semibold text-ink tabular-nums">
                  ${stats.totalValue.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted uppercase tracking-wide">Probability</p>
                <p className="text-xl font-semibold text-ink tabular-nums">
                  {Math.round(stats.probability * 100)}%
                </p>
              </div>
            </div>
          </LiquidPanel>
        </div>
      </div>
    </div>
  );
}
