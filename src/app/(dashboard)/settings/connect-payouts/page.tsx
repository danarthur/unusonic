/**
 * Connect Payouts (UnusonicPay)
 * Required for Autonomous tier: AI Agents need a wallet to bill per resolution.
 * @module app/(dashboard)/settings/connect-payouts
 */

import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { Zap } from 'lucide-react';
import { TRANSACTION_FEE_BASIS } from '@/entities/billing/utils/calc';

export const metadata = {
  title: 'Connect Payouts | Unusonic',
  description: 'Enable UnusonicPay to unlock Autonomous AI Agents',
};

export const dynamic = 'force-dynamic';

export default async function ConnectPayoutsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="stage-panel p-8 rounded-2xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-xl bg-[color:var(--color-unusonic-success)/0.2] flex items-center justify-center">
            <Zap className="w-7 h-7 text-[var(--color-unusonic-success)]" />
          </div>
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-[var(--stage-text-primary)]">
              Connect Payouts (UnusonicPay)
            </h1>
            <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5">
              Required for Autonomous tier
            </p>
          </div>
        </div>

        <p className="text-sm text-[var(--stage-text-secondary)] font-light mb-6">
          AI Agents cannot work for free. Enable UnusonicPay to unlock Digital Workers that act on your behalf.
          You are charged only when an agent resolves a task (~$1.00 per resolution).
        </p>

        <div className="stage-panel p-4 rounded-xl mb-6">
          <p className="text-[11px] font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider mb-2">
            Fee structure
          </p>
          <p className="text-sm text-[var(--stage-text-primary)]">
            {(TRANSACTION_FEE_BASIS.rate * 100).toFixed(2)}% + ${TRANSACTION_FEE_BASIS.fixed.toFixed(2)} per transaction
          </p>
        </div>

        <p className="text-xs text-[var(--stage-text-secondary)]/80">
          Connect your payout account to enable Autonomous agents. This page will integrate with Stripe Connect or your payment provider.
        </p>
      </div>
    </div>
  );
}
