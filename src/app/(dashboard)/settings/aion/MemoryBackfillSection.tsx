'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Database } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Button } from '@/shared/ui/button';
import {
  runMemoryBackfill,
  runMemoryAudit,
  estimateAiSummaryCost,
  runAiSummary,
  type MemoryBackfillResult,
  type MemoryAuditResult,
  type AiSummaryCostResult,
  type AiSummaryRunResult,
} from './memory-backfill-action';
import type { BackfillResult, BackfillSourceTally } from '@/app/api/aion/lib/backfill-embeddings';
import type { FillAuditResult, FillAuditRow } from '@/app/api/aion/lib/audit-embeddings';
import type { AiSummaryCostEstimate, AiSummaryBackfillResult } from '@/app/api/aion/lib/ai-summary-backfill';

type SuccessResult = Extract<MemoryBackfillResult, { success: true }>;
type SuccessAudit = Extract<MemoryAuditResult, { success: true }>;
type SuccessCost = Extract<AiSummaryCostResult, { success: true }>;
type SuccessRun = Extract<AiSummaryRunResult, { success: true }>;

const SUMMARY_CAP_PER_RUN = 200;

export function MemoryBackfillSection() {
  const [isPending, startTransition] = useTransition();
  const [isAuditing, startAuditTransition] = useTransition();
  const [isEstimating, startEstimateTransition] = useTransition();
  const [isSummarizing, startSummaryTransition] = useTransition();
  const [last, setLast] = useState<SuccessResult | null>(null);
  const [audit, setAudit] = useState<SuccessAudit | null>(null);
  const [costEstimate, setCostEstimate] = useState<SuccessCost | null>(null);
  const [lastSummary, setLastSummary] = useState<SuccessRun | null>(null);

  const handleClick = () => {
    startTransition(async () => {
      const res = await runMemoryBackfill();
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setLast(res);
      const total = sumInserted(res.result);
      const failed = sumFailed(res.result);
      if (failed === 0) {
        toast.success(`Backfill complete: ${total} rows embedded, no failures.`);
      } else {
        toast.warning(`Backfill done: ${total} embedded, ${failed} failed — see detail below.`);
      }
    });
  };

  const handleAuditClick = () => {
    startAuditTransition(async () => {
      const res = await runMemoryAudit();
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setAudit(res);
      const under80 = res.audit.rows.filter(
        (r) => r.fillRatio !== null && r.fillRatio < 0.8,
      );
      if (under80.length === 0) {
        toast.success('Audit: all audited source types at ≥80% fill.');
      } else {
        toast.warning(`Audit: ${under80.length} source type(s) below 80% fill.`);
      }
    });
  };

  const handleEstimateClick = () => {
    startEstimateTransition(async () => {
      const res = await estimateAiSummaryCost();
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setCostEstimate(res);
      if (res.estimate.messageCount === 0) {
        toast.info('No messages need ai_summary right now.');
      } else {
        toast.success(
          `${res.estimate.messageCount} messages queued — est. $${res.estimate.usd.toFixed(3)}.`,
        );
      }
    });
  };

  const handleSummarizeClick = () => {
    startSummaryTransition(async () => {
      const res = await runAiSummary(SUMMARY_CAP_PER_RUN);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setLastSummary(res);
      if (res.result.failed === 0) {
        toast.success(
          `ai_summary: ${res.result.summarized} summarized, ${res.result.skipped} skipped.`,
        );
      } else {
        toast.warning(
          `ai_summary: ${res.result.summarized} ok, ${res.result.failed} failed — see detail below.`,
        );
      }
    });
  };

  return (
    <StagePanel padding="md">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-[var(--ctx-card)] p-1.5">
          <Database className="h-4 w-4 text-[var(--stage-text-secondary)]" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="text-sm font-medium text-[var(--stage-text-primary)]">
              Memory backfill
            </h3>
            <p className="mt-1 text-xs text-[var(--stage-text-tertiary)]">
              Re-embed every deal note, follow-up log, proposal, catalog package, message,
              and activity chunk in this workspace into{' '}
              <code className="text-[11px]">cortex.memory</code>. Idempotent by source id —
              safe to re-run. ai_summary is a separate Haiku pass; cost estimate first,
              then run.
            </p>
          </div>

          {last && <BackfillReadout result={last.result} />}
          {audit && <AuditReadout result={audit.audit} />}
          {costEstimate && <CostEstimateReadout estimate={costEstimate.estimate} />}
          {lastSummary && <SummaryRunReadout result={lastSummary.result} />}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleClick} disabled={isPending}>
              {isPending ? 'Running backfill…' : 'Run backfill'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAuditClick}
              disabled={isAuditing}
            >
              {isAuditing ? 'Checking…' : 'Check fill rates'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleEstimateClick}
              disabled={isEstimating}
            >
              {isEstimating ? 'Estimating…' : 'Estimate ai_summary cost'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSummarizeClick}
              disabled={isSummarizing || !costEstimate || costEstimate.estimate.messageCount === 0}
            >
              {isSummarizing ? 'Summarizing…' : `Run ai_summary (${SUMMARY_CAP_PER_RUN} max)`}
            </Button>
          </div>
        </div>
      </div>
    </StagePanel>
  );
}

function BackfillReadout({ result }: { result: BackfillResult }) {
  return (
    <div className="space-y-2 rounded-md border border-[var(--stage-border)] bg-[var(--ctx-well)] p-2.5 text-xs">
      <TallyRow label="Deal notes" tally={result.dealNotes} />
      <TallyRow label="Follow-ups" tally={result.followUpLogs} />
      <TallyRow label="Proposals" tally={result.proposals} />
      <TallyRow label="Catalog" tally={result.catalogPackages} />
      <TallyRow label="Messages" tally={result.messages} />
      <TallyRow label="Activity chunks" tally={result.activityChunks} />
      {result.firstFailures.length > 0 && (
        <details className="mt-2 pt-2 border-t border-[var(--stage-border)]">
          <summary className="cursor-pointer text-[var(--stage-text-secondary)]">
            {result.firstFailures.length} sampled failure{result.firstFailures.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-1.5 space-y-1 text-[11px] text-[var(--stage-text-tertiary)]">
            {result.firstFailures.map((f, i) => (
              <li key={i} className="font-mono">
                [{f.sourceType}/{f.stage}] {f.message.slice(0, 140)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function TallyRow({ label, tally }: { label: string; tally: BackfillSourceTally }) {
  const dim = tally.attempted === 0;
  return (
    <div className={`flex items-center justify-between ${dim ? 'opacity-60' : ''}`}>
      <span className="text-[var(--stage-text-secondary)]">{label}</span>
      <span className="font-mono text-[var(--stage-text-tertiary)]">
        {tally.inserted} inserted · {tally.skipped} skipped · {tally.failed} failed ({tally.attempted} total)
      </span>
    </div>
  );
}

function sumInserted(r: BackfillResult): number {
  return r.dealNotes.inserted + r.followUpLogs.inserted + r.proposals.inserted
    + r.catalogPackages.inserted + r.messages.inserted + r.activityChunks.inserted;
}

function sumFailed(r: BackfillResult): number {
  return r.dealNotes.failed + r.followUpLogs.failed + r.proposals.failed
    + r.catalogPackages.failed + r.messages.failed + r.activityChunks.failed;
}

function AuditReadout({ result }: { result: FillAuditResult }) {
  return (
    <div className="space-y-2 rounded-md border border-[var(--stage-border)] bg-[var(--ctx-well)] p-2.5 text-xs">
      <div className="flex items-center justify-between pb-1.5 border-b border-[var(--stage-border)]">
        <span className="text-[var(--stage-text-secondary)]">Fill rate audit</span>
        <span className="font-mono text-[10px] text-[var(--stage-text-tertiary)]">
          {new Date(result.auditedAt).toLocaleTimeString()}
        </span>
      </div>
      {result.rows.map((row) => (
        <AuditRow key={row.sourceType} row={row} />
      ))}
    </div>
  );
}

function AuditRow({ row }: { row: FillAuditRow }) {
  const noBaseline = row.expectedMin === null;
  const belowTarget = row.fillRatio !== null && row.fillRatio < 0.8;
  const label = row.sourceType.replace(/_/g, ' ');
  return (
    <div className={`flex items-center justify-between ${noBaseline ? 'opacity-60' : ''}`}>
      <span className="text-[var(--stage-text-secondary)]">{label}</span>
      <span className="font-mono text-[var(--stage-text-tertiary)]">
        {row.rowCount}
        {row.expectedMin !== null ? ` / ${row.expectedMin}` : ' / —'}
        {row.fillRatio !== null && (
          <span
            style={belowTarget ? { color: 'var(--color-unusonic-error)' } : undefined}
            className={belowTarget ? '' : 'text-[var(--stage-text-secondary)]'}
          >
            {' · '}
            {Math.round(row.fillRatio * 100)}%
          </span>
        )}
      </span>
    </div>
  );
}

function CostEstimateReadout({ estimate }: { estimate: AiSummaryCostEstimate }) {
  return (
    <div className="space-y-1.5 rounded-md border border-[var(--stage-border)] bg-[var(--ctx-well)] p-2.5 text-xs">
      <div className="flex items-center justify-between pb-1.5 border-b border-[var(--stage-border)]">
        <span className="text-[var(--stage-text-secondary)]">ai_summary cost estimate</span>
        <span className="font-mono text-[var(--stage-text-primary)]">
          ${estimate.usd.toFixed(3)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[var(--stage-text-secondary)]">messages needing summary</span>
        <span className="font-mono text-[var(--stage-text-tertiary)]">{estimate.messageCount}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[var(--stage-text-secondary)]">avg body length</span>
        <span className="font-mono text-[var(--stage-text-tertiary)]">{estimate.avgBodyChars} chars</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[var(--stage-text-secondary)]">Haiku tokens</span>
        <span className="font-mono text-[var(--stage-text-tertiary)]">
          {estimate.inputTokens.toLocaleString()} in · {estimate.outputTokens.toLocaleString()} out
        </span>
      </div>
    </div>
  );
}

function SummaryRunReadout({ result }: { result: AiSummaryBackfillResult }) {
  return (
    <div className="space-y-1.5 rounded-md border border-[var(--stage-border)] bg-[var(--ctx-well)] p-2.5 text-xs">
      <div className="flex items-center justify-between pb-1.5 border-b border-[var(--stage-border)]">
        <span className="text-[var(--stage-text-secondary)]">ai_summary backfill</span>
        <span className="font-mono text-[var(--stage-text-tertiary)]">{result.attempted} attempted</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[var(--stage-text-secondary)]">summarized</span>
        <span className="font-mono text-[var(--stage-text-tertiary)]">{result.summarized}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[var(--stage-text-secondary)]">skipped</span>
        <span className="font-mono text-[var(--stage-text-tertiary)]">{result.skipped}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[var(--stage-text-secondary)]">failed</span>
        <span className="font-mono text-[var(--stage-text-tertiary)]">{result.failed}</span>
      </div>
      {result.sampleFailures.length > 0 && (
        <details className="mt-1 pt-1 border-t border-[var(--stage-border)]">
          <summary className="cursor-pointer text-[var(--stage-text-tertiary)]">
            {result.sampleFailures.length} sample failure{result.sampleFailures.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-1 space-y-1 text-[11px] text-[var(--stage-text-tertiary)]">
            {result.sampleFailures.map((f, i) => (
              <li key={i} className="font-mono">
                [{f.messageId.slice(0, 8)}] {f.error.slice(0, 140)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
