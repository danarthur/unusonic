/**
 * Client portal invoice stub.
 *
 * Route: /client/invoice/[id]
 *
 * Phase 0.5 scope: read-only summary inside ClientPortalShell. Payment
 * flow still lives under /i/[token] (legacy public route) once that
 * route is reconnected — see the pre-existing issues section of the
 * 2026-04-10 session doc.
 *
 * @module app/(client-portal)/client/invoice/[id]/page
 */
import 'server-only';

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getSystemClient } from '@/shared/api/supabase/system';
import { getClientPortalContext } from '@/shared/lib/client-portal';
import { getClientPortalWorkspaceSummary } from '@/features/client-portal/api/get-workspace-summary';
import {
  ClientPortalFooter,
  ClientPortalHeader,
  ClientPortalShell,
} from '@/features/client-portal/ui';

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string | null;
  total_amount: number | string;
  due_date: string | null;
  created_at: string | null;
  bill_to_entity_id: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(input: string | null): string {
  if (!input) return 'TBD';
  return new Date(input).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function ClientInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getClientPortalContext();
  if (context.kind === 'none' || !context.activeEntity) {
    // notFound() instead of `return null` so a client hitting the page without
    // a portal session gets a real 404 (logged in Vercel + Sentry) instead of
    // a blank screen we can't trace.
    notFound();
  }

  const workspaceId = context.activeEntity.ownerWorkspaceId;
  const supabase = getSystemClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crossSchema = supabase;

  // finance.invoices ownership is enforced via bill_to_entity_id, which
  // must match the client portal session's active entity — this is the
  // isolation boundary that keeps one client from guessing another's
  // invoice id and reading it.
  const { data: invoiceData } = await crossSchema
    .schema('finance')
    .from('invoices')
    .select('id, invoice_number, status, total_amount, due_date, created_at, bill_to_entity_id, workspace_id')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .eq('bill_to_entity_id', context.activeEntity.id)
    .maybeSingle();

  const invoice = invoiceData as InvoiceRow | null;
  const workspace = await getClientPortalWorkspaceSummary(workspaceId);

  return (
    <ClientPortalShell
      workspace={workspace}
      header={<ClientPortalHeader workspace={workspace} />}
      footer={<ClientPortalFooter />}
    >
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-14">
        <Link
          href="/client/home"
          className="text-xs uppercase tracking-[0.14em]"
          style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
        >
          ← Home
        </Link>

        <h1
          className="text-3xl font-medium tracking-tight"
          style={{
            color: 'var(--portal-text, var(--stage-text-primary))',
            fontFamily: 'var(--portal-font-heading, var(--font-sans))',
          }}
        >
          {invoice?.invoice_number ? `Invoice ${invoice.invoice_number}` : 'Invoice'}
        </h1>

        {invoice ? (
          <dl
            className="flex flex-col gap-3 rounded-[var(--portal-card-radius,12px)] p-5"
            style={{
              backgroundColor: 'var(--portal-surface, var(--stage-surface))',
              border: '1px solid var(--portal-border-subtle, var(--stage-border))',
            }}
          >
            <Row label="Amount" value={formatCurrency(Number(invoice.total_amount) || 0)} strong />
            <Row label="Status" value={invoice.status ?? 'draft'} />
            <Row label="Due" value={formatDate(invoice.due_date)} />
            <Row label="Issued" value={formatDate(invoice.created_at)} />
          </dl>
        ) : (
          <p
            className="text-sm"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
          >
            This invoice isn&rsquo;t available yet. Check back after your coordinator has sent it, or tap them on the home page.
          </p>
        )}
      </div>
    </ClientPortalShell>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt
        className="text-xs uppercase tracking-[0.12em]"
        style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
      >
        {label}
      </dt>
      <dd
        className={strong ? 'text-lg font-medium' : 'text-sm'}
        style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}
      >
        {value}
      </dd>
    </div>
  );
}
