/**
 * Connect Payouts (SignalPay)
 * Required for Autonomous tier: AI Agents need a wallet to bill per resolution.
 * @module app/(dashboard)/settings/connect-payouts
 */

import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Zap, ArrowLeft } from 'lucide-react';
import { TRANSACTION_FEE_BASIS } from '@/entities/billing/utils/calc';

export const metadata = {
  title: 'Connect Payouts | Signal',
  description: 'Enable SignalPay to unlock Autonomous AI Agents',
};

export const dynamic = 'force-dynamic';

export default async function ConnectPayoutsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="max-w-xl mx-auto p-6 space-y-8">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Settings
      </Link>

      <div className="liquid-panel p-8 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-xl bg-[color:var(--color-signal-success)/0.2] flex items-center justify-center">
            <Zap className="w-7 h-7 text-[var(--color-signal-success)]" />
          </div>
          <div>
            <h1 className="text-xl font-light text-ink tracking-tight">
              Connect Payouts (SignalPay)
            </h1>
            <p className="text-sm text-ink-muted mt-0.5">
              Required for Autonomous tier
            </p>
          </div>
        </div>

        <p className="text-sm text-ink-muted font-light mb-6">
          AI Agents cannot work for free. Enable SignalPay to unlock Digital Workers that act on your behalf.
          You are charged only when an agent resolves a task (~$1.00 per resolution).
        </p>

        <div className="p-4 rounded-xl bg-ink/[0.03] border border-[var(--glass-border)] mb-6">
          <p className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-2">
            Fee structure
          </p>
          <p className="text-sm text-ink">
            {(TRANSACTION_FEE_BASIS.rate * 100).toFixed(2)}% + ${TRANSACTION_FEE_BASIS.fixed.toFixed(2)} per transaction
          </p>
        </div>

        <p className="text-xs text-ink-muted/80">
          Connect your payout account to enable Autonomous agents. This page will integrate with Stripe Connect or your payment provider.
        </p>
      </div>
    </div>
  );
}
