'use client';

/**
 * What is owed between us and this entity, at two depths.
 *
 * Replaces TradeLedger in the panel and FinancePanel on the page, which read
 * different things and disagreed. The panel's ledger also had its direction
 * label inverted -- it compared invoices billed to them against expenses owed
 * to them and then printed "We owe them" for the case where they owe us.
 *
 * Two positive numbers, never netted, each labelled from our side of the table.
 * A single signed figure is the thing to avoid: the same component would then
 * mean opposite things for a client and for a freelancer, with nothing on
 * screen to say which.
 *
 * @module widgets/network-detail/ui/EntityMoney
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { getEntityMoney, type EntityInvoice } from '@/features/network-data/api/get-entity-money';

export interface EntityMoneyProps {
  entityId: string;
  variant?: 'summary' | 'full';
}

function usd(amount: number, cents = false): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;
}

/**
 * One side of the ledger. Rendered only when non-zero: a row of zeroes reads as
 * a settled account, which is a claim we would rather make in words.
 */
function Side({ label, amount, tone }: { label: string; amount: number; tone?: 'warning' }) {
  if (amount <= 0) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="stage-label">{label}</span>
      <span
        className={cn(
          'font-[family-name:var(--stage-data-font)] text-[length:var(--stage-readout-sm-size)] tabular-nums',
          tone === 'warning'
            ? 'text-[var(--color-unusonic-warning)]'
            : 'text-[var(--stage-text-primary)]',
        )}
      >
        {usd(amount)}
      </span>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-tertiary)]',
  overdue: 'bg-[var(--color-unusonic-error)]/15 text-[var(--color-unusonic-error)]',
  sent: 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)]',
};

function InvoiceRow({ invoice }: { invoice: EntityInvoice }) {
  const status = invoice.status ?? 'draft';
  return (
    <li className="flex items-center gap-3 rounded-lg border border-[var(--stage-edge-subtle)] bg-[var(--ctx-card)] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="stage-readout-sm text-[var(--stage-text-primary)]">
          {usd(invoice.total_amount ?? 0, true)}
        </p>
        {invoice.due_date && (
          <p className="mt-0.5 text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
            Due {new Date(invoice.due_date).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
            })}
          </p>
        )}
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 stage-badge-text',
          STATUS_STYLE[status] ?? 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)]',
        )}
      >
        {status}
      </span>
    </li>
  );
}

/** Chrome differs by variant: a panel on the page, a divider in the peek. */
function shellClass(variant: 'summary' | 'full'): string {
  return cn(
    'space-y-2',
    variant === 'full'
      ? 'stage-panel rounded-2xl px-5 py-4'
      : 'border-t border-[var(--stage-edge-subtle)] pt-[var(--stage-padding)]',
  );
}

/** Every invoice, for the page. The panel shows the totals and defers. */
function InvoiceList({ invoices }: { invoices: EntityInvoice[] }) {
  if (invoices.length === 0) return null;
  return (
    <ul className="space-y-2 pt-2">
      {invoices.map((invoice) => (
        <InvoiceRow key={invoice.id} invoice={invoice} />
      ))}
    </ul>
  );
}

/** Nothing outstanding either way — said in words, not as a pair of zeroes. */
function SettledNote({ lifetimeBilled }: { lifetimeBilled: number }) {
  return (
    <p className="stage-label text-[var(--stage-text-secondary)]">
      Settled{lifetimeBilled > 0 ? ` · ${usd(lifetimeBilled)} billed to date` : ''}
    </p>
  );
}

export function EntityMoney({ entityId, variant = 'summary' }: EntityMoneyProps) {
  const { data, isPending } = useQuery({
    queryKey: ['entity-money', entityId],
    queryFn: () => getEntityMoney(entityId),
    staleTime: 60_000,
    enabled: Boolean(entityId),
  });

  if (isPending || !data) return null;

  const { theyOweUs, weOweThem, lifetimeBilled, invoices } = data;
  const settled = theyOweUs === 0 && weOweThem === 0;

  // Nothing has ever passed between us: say nothing rather than print zeroes.
  if (settled && lifetimeBilled === 0 && invoices.length === 0) return null;

  return (
    <section className={shellClass(variant)} data-surface={variant === 'full' ? 'surface' : 'elevated'}>
      <h3 className="flex items-center gap-2 stage-label text-[var(--stage-text-secondary)]">
        {variant === 'full' && <Receipt className="size-3.5" strokeWidth={1.5} />}
        Money
      </h3>

      <Side label="They owe us" amount={theyOweUs} tone="warning" />
      <Side label="We owe them" amount={weOweThem} tone="warning" />

      {settled && <SettledNote lifetimeBilled={lifetimeBilled} />}

      {variant === 'full' && <InvoiceList invoices={invoices} />}
    </section>
  );
}
