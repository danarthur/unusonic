/**
 * Public DNS-help page — recipient lands here from a handoff email/SMS.
 * No auth required. Token resolves to a redacted view of the handoff.
 *
 * Design doc: docs/reference/byo-rescue-flow-design.md
 */

import { notFound } from 'next/navigation';
import { getDnsHandoffPublicView } from '@/features/org-management/api/dns-handoff-public';
import { DnsHelpPageClient } from './DnsHelpPageClient';
import { DnsHelpExpiredOrRevoked } from './DnsHelpExpiredOrRevoked';

export const dynamic = 'force-dynamic';

export default async function DnsHelpPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getDnsHandoffPublicView(token);

  if (result.kind === 'not_found') notFound();
  if (result.kind === 'expired') return <DnsHelpExpiredOrRevoked kind="expired" />;
  if (result.kind === 'revoked') return <DnsHelpExpiredOrRevoked kind="revoked" />;

  return <DnsHelpPageClient view={result.view} />;
}
