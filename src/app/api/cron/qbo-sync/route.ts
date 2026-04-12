/**
 * QBO Sync Cron — processes the finance.sync_jobs queue.
 *
 * Called by Vercel Cron every minute. Protected by CRON_SECRET.
 * Dispatches to the QBO sync worker which processes up to 10 jobs
 * per invocation with per-workspace concurrency limits.
 *
 * @module app/api/cron/qbo-sync/route
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute max per Vercel Cron

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized invocations
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const { processQboSyncJobs } = await import('@/features/finance/qbo/worker');
    const result = await processQboSyncJobs();

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[qbo-sync cron] Worker failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
