/**
 * QBO sync worker — processes finance.sync_jobs queue.
 *
 * Called by a cron (Supabase Edge Function or Vercel Cron) every minute.
 * Reads up to N queued jobs, processes them one at a time per workspace
 * (concurrency limit = 1 per workspace to avoid Intuit rate limit collisions),
 * applies exponential backoff on failure, dead-letters after attempt 6.
 *
 * Backoff schedule: [1m, 5m, 30m, 2h, 12h] — total ~14h before dead letter.
 *
 * @module features/finance/qbo/worker
 */

import 'server-only';
import { getSystemClient } from '@/shared/api/supabase/system';
import { pushInvoiceToQbo } from './push-invoice';

const BACKOFF_SECONDS = [60, 300, 1800, 7200, 43200]; // 1m, 5m, 30m, 2h, 12h
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 10;

interface WorkerResult {
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
}

export async function processQboSyncJobs(): Promise<WorkerResult> {
  const system = getSystemClient();
  const result: WorkerResult = { processed: 0, succeeded: 0, failed: 0, deadLettered: 0 };

  // ── Fetch dispatchable jobs ────────────────────────────────────────────────
  // Only jobs that are queued/failed AND past their next_attempt_at.
  // Ordered by next_attempt_at ascending (oldest first).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs } = await (system as any)
    .schema('finance')
    .from('sync_jobs')
    .select('id, workspace_id, job_kind, local_id, state, attempt_number, depends_on_job_id')
    .in('state', ['queued', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (!jobs || jobs.length === 0) return result;

  // Track which workspaces have in-flight jobs (1 per workspace)
  const inFlightWorkspaces = new Set<string>();

  for (const job of jobs as any[]) {
    // Per-workspace concurrency: skip if another job for this workspace is in-flight
    if (inFlightWorkspaces.has(job.workspace_id)) continue;

    // Dependency check: skip if depends_on_job_id exists and that job hasn't succeeded
    if (job.depends_on_job_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: depJob } = await (system as any)
        .schema('finance')
        .from('sync_jobs')
        .select('state')
        .eq('id', job.depends_on_job_id)
        .maybeSingle();

      if (depJob?.state !== 'succeeded') continue;
    }

    inFlightWorkspaces.add(job.workspace_id);
    result.processed++;

    // Lease the job (optimistic lock)
    const leaseId = `worker-${Date.now()}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leased } = await (system as any)
      .schema('finance')
      .from('sync_jobs')
      .update({
        state: 'in_progress',
        leased_by: leaseId,
        leased_until: new Date(Date.now() + 120000).toISOString(), // 2 min lease
      })
      .eq('id', job.id)
      .in('state', ['queued', 'failed']) // CAS: only lease if still in expected state
      .select('id')
      .maybeSingle();

    if (!leased) {
      // Another worker got it
      inFlightWorkspaces.delete(job.workspace_id);
      continue;
    }

    // ── Execute the job ──────────────────────────────────────────────────────
    const attemptNumber = (job.attempt_number ?? 0) + 1;
    let jobResult: { success: boolean; error?: string; needsCustomerMapping?: boolean };

    try {
      switch (job.job_kind) {
        case 'push_invoice':
          jobResult = await pushInvoiceToQbo(job.workspace_id, job.local_id, attemptNumber);
          break;
        // Future: push_payment, void_invoice, refund_payment, push_customer, etc.
        default:
          jobResult = { success: false, error: `Unknown job kind: ${job.job_kind}` };
      }
    } catch (e) {
      jobResult = { success: false, error: e instanceof Error ? e.message : String(e) };
    }

    // ── Update job state ─────────────────────────────────────────────────────
    if (jobResult.success) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (system as any).schema('finance').from('sync_jobs').update({
        state: 'succeeded',
        attempt_number: attemptNumber,
        last_error: null,
        leased_by: null,
        leased_until: null,
      }).eq('id', job.id);
      result.succeeded++;
    } else if (jobResult.needsCustomerMapping) {
      // Park in pending_mapping — waits for user to map the customer manually
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (system as any).schema('finance').from('sync_jobs').update({
        state: 'pending_mapping',
        attempt_number: attemptNumber,
        last_error: jobResult.error ?? 'Needs customer mapping',
        leased_by: null,
        leased_until: null,
      }).eq('id', job.id);
      result.failed++;
    } else if (attemptNumber >= MAX_ATTEMPTS) {
      // Dead letter — persistent dashboard banner, admin email
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (system as any).schema('finance').from('sync_jobs').update({
        state: 'dead_letter',
        attempt_number: attemptNumber,
        last_error: jobResult.error ?? 'Max attempts exceeded',
        leased_by: null,
        leased_until: null,
      }).eq('id', job.id);
      result.deadLettered++;
    } else {
      // Failed — schedule retry with exponential backoff
      const backoffSec = BACKOFF_SECONDS[Math.min(attemptNumber - 1, BACKOFF_SECONDS.length - 1)];
      const nextAttemptAt = new Date(Date.now() + backoffSec * 1000).toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (system as any).schema('finance').from('sync_jobs').update({
        state: 'failed',
        attempt_number: attemptNumber,
        next_attempt_at: nextAttemptAt,
        last_error: jobResult.error,
        leased_by: null,
        leased_until: null,
      }).eq('id', job.id);
      result.failed++;
    }

    inFlightWorkspaces.delete(job.workspace_id);
  }

  return result;
}
