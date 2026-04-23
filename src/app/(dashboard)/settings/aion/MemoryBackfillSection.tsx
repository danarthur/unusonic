'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Database } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Button } from '@/shared/ui/button';
import {
  runMemoryBackfill,
  runMemoryAudit,
  type MemoryBackfillResult,
  type MemoryAuditResult,
} from './memory-backfill-action';
import type { BackfillResult, BackfillSourceTally } from '@/app/api/aion/lib/backfill-embeddings';
import type { FillAuditResult, FillAuditRow } from '@/app/api/aion/lib/audit-embeddings';

type SuccessResult = Extract<MemoryBackfillResult, { success: true }>;
type SuccessAudit = Extract<MemoryAuditResult, { success: true }>;

export function MemoryBackfillSection() {
  const [isPending, startTransition] = useTransition();
  const [isAuditing, startAuditTransition] = useTransition();
  const [last, setLast] = useState<SuccessResult | null>(null);
  const [audit, setAudit] = useState<SuccessAudit | null>(null);

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
              Re-embed every deal note, follow-up log, proposal, and catalog package in this workspace
              into <code className="text-[11px]">cortex.memory</code>. Idempotent by source id —
              safe to re-run. Failures are surfaced per source.
            </p>
          </div>

          {last && <BackfillReadout result={last.result} />}
          {audit && <AuditReadout result={audit.audit} />}

          <div className="flex items-center gap-2">
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
  return r.dealNotes.inserted + r.followUpLogs.inserted + r.proposals.inserted + r.catalogPackages.inserted;
}

function sumFailed(r: BackfillResult): number {
  return r.dealNotes.failed + r.followUpLogs.failed + r.proposals.failed + r.catalogPackages.failed;
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
