/**
 * Email Settings — custom sending domain configuration.
 */

import { redirect } from 'next/navigation';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { createClient } from '@/shared/api/supabase/server';
import { EmailDomainSettings } from './EmailDomainSettings';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Email | Settings | Unusonic',
};

export default async function EmailSettingsPage() {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) redirect('/login');

  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select(
      'sending_domain, resend_domain_id, sending_domain_status, sending_from_name, sending_from_localpart, dmarc_status'
    )
    .eq('id', workspaceId)
    .maybeSingle();

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Email</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Configure a custom sending domain so emails arrive from your brand.
        </p>
      </div>
      <EmailDomainSettings
        workspaceId={workspaceId}
        initialDomain={workspace?.sending_domain ?? null}
        initialStatus={workspace?.sending_domain_status ?? null}
        initialFromName={workspace?.sending_from_name ?? null}
        initialFromLocalpart={workspace?.sending_from_localpart ?? 'hello'}
        initialDmarcStatus={workspace?.dmarc_status ?? null}
      />
    </div>
  );
}
