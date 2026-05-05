/**
 * Admin preview — client portal invoice page.
 *
 * Read-only render of /client/invoice/[id] for admin QA.
 *
 * @module app/(dashboard)/(features)/preview/client/[entityId]/invoice/[invoiceId]/page
 */
import 'server-only';

import Link from 'next/link';

import { getSystemClient } from '@/shared/api/supabase/system';
import { verifyPreviewAccess } from '@/shared/lib/preview-access';
import { getClientPortalWorkspaceSummary } from '@/features/client-portal/api/get-workspace-summary';
import {
  ClientPortalFooter,
  ClientPortalHeader,
  ClientPortalShell,
} from '@/features/client-portal/ui';
import { PreviewBanner } from '@/features/client-portal/ui/preview-banner';

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string | null;
  total_amount: number | string;
  due_date: string | null;
  created_at: string | null;
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

export default async function PreviewClientInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ entityId: string; invoiceId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { entityId, invoiceId } = await params;
  const { from: fromDealId } = await searchParams;
  const entity = await verifyPreviewAccess(entityId);
  const exitHref = fromDealId
    ? `/productions?stream=active&selected=${fromDealId}`
    : '/productions';
  const homeHref = fromDealId
    ? `/preview/client/${entityId}?from=${fromDealId}`
    : `/preview/client/${entityId}`;

  const system = getSystemClient();
  const { data: invoiceData } = await system
    .schema('finance')
    .from('invoices')
    .select('id, invoice_number, status, total_amount, due_date, created_at, bill_to_entity_id, workspace_id')
    .eq('id', invoiceId)
    .eq('bill_to_entity_id', entityId)
    .eq('workspace_id', entity.ownerWorkspaceId)
    .maybeSingle();

  const invoice = invoiceData as InvoiceRow | null;
  const workspace = await getClientPortalWorkspaceSummary(entity.ownerWorkspaceId);

  return (
    <>
      <PreviewBanner clientName={entity.displayName} exitHref={exitHref} />
      <ClientPortalShell
        workspace={workspace}
        header={<ClientPortalHeader workspace={workspace} />}
        footer={<ClientPortalFooter />}
      >
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-14">
          <Link
            href={homeHref}
            className="text-xs uppercase tracking-[0.14em]"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
          >
            &larr; Home
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
              Invoice not found for this client.
            </p>
          )}
        </div>
      </ClientPortalShell>
    </>
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
