/**
 * Public Invoice Viewer (Client Payment Portal)
 * Route: /i/[token] – no auth, no AppShell. Fetches by invoice token.
 */

import { notFound } from 'next/navigation';
import { getPublicInvoice } from '@/features/finance/api/get-public-invoice';
import { PublicInvoiceView } from '@/features/finance/ui/public/PublicInvoiceView';

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const data = await getPublicInvoice(token);

  if (!data) {
    notFound();
  }

  return <PublicInvoiceView data={data} token={token} />;
}
