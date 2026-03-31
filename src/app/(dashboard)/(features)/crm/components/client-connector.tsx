'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Building2, ChevronRight, ExternalLink } from 'lucide-react';
import { OmniSearch } from '@/widgets/network-stream';
import { linkDealToClient } from '../actions/link-deal-client';
import { CreateClientDialog } from './create-client-dialog';
import { ClientSummaryCard } from './client-identity-card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import type { DealClientContext } from '../actions/get-deal-client';
import { toast } from 'sonner';

type ClientConnectorProps = {
  dealId: string;
  /** Current Network org id (for OmniSearch and relationship lookup). When null, "Add Client" is disabled or shows hint. */
  sourceOrgId: string | null;
  client: DealClientContext | null;
  onClientLinked: () => void;
  compact?: boolean;
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
}

/**
 * Client Pivot: bridges Deal Room to Network.
 * - Empty + sourceOrgId: "+ Add Client" → OmniSearch (filtered external orgs); "Create X" → Ghost Forge inline.
 * - Populated: Client card; click opens Network Detail Sheet (via URL ?nodeId=&kind=).
 */
export function ClientConnector({
  dealId,
  sourceOrgId,
  client,
  onClientLinked,
  compact = true,
}: ClientConnectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [omniOpen, setOmniOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgeInitialName, setForgeInitialName] = useState('');
  const [setupHintOpen, setSetupHintOpen] = useState(false);

  const handleSelectExisting = async (orgId: string) => {
    const result = await linkDealToClient(dealId, orgId, null);
    if (result.success) {
      toast.success('Client linked to this deal.');
      setOmniOpen(false);
      onClientLinked();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleOpenForge = (name: string) => {
    setForgeInitialName(name.trim());
    setOmniOpen(false);
    setForgeOpen(true);
  };

  const handleForgeSuccess = () => {
    setForgeOpen(false);
    setForgeInitialName('');
    onClientLinked();
    router.refresh();
  };

  // No client linked — always show "+ Add client" button
  if (!client) {
    const handleAddClientClick = () => {
      if (sourceOrgId) {
        setOmniOpen(true);
      } else {
        setSetupHintOpen(true);
      }
    };

    return (
      <>
        <button
          type="button"
          onClick={handleAddClientClick}
          className={cn(
            'w-full rounded-2xl border-2 border-dashed border-[oklch(1_0_0_/_0.15)]',
            'flex items-center gap-3 text-left transition-colors',
            'hover:border-[var(--stage-accent)]/40 hover:bg-[var(--stage-accent)]/5',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]',
            compact ? 'stage-panel-nested p-3' : 'stage-panel-nested p-4'
          )}
          aria-label="Add client"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--stage-accent)]/10 text-[var(--stage-accent)]">
            <Plus className="size-5" strokeWidth={1.5} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-[var(--stage-text-primary)] tracking-tight">Add client</p>
            <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">
              {sourceOrgId
                ? 'Search your Network or create a new client'
                : 'Set up your Network to add or link a client'}
            </p>
          </div>
        </button>

        {!sourceOrgId && (
          <Sheet open={setupHintOpen} onOpenChange={setSetupHintOpen}>
            <SheetContent
              side="center"
              className="flex w-full max-w-sm flex-col border-l border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] p-0"
            >
              <SheetHeader className="border-b border-[oklch(1_0_0_/_0.10)] px-6 py-5">
                <SheetTitle>
                  Add client
                </SheetTitle>
                <SheetClose />
              </SheetHeader>
              <SheetBody className="flex flex-col gap-4 px-6 py-5">
                <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed">
                  To add or link a client to this deal, set up your organization in Network first. Then you can search your rolodex or create new clients from here.
                </p>
                <Button asChild className="w-full rounded-xl bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] hover:bg-[var(--stage-accent)]/30">
                  <Link href="/network" className="inline-flex items-center justify-center gap-2">
                    Go to Network
                    <ExternalLink className="size-4" strokeWidth={1.5} />
                  </Link>
                </Button>
              </SheetBody>
            </SheetContent>
          </Sheet>
        )}

        {sourceOrgId && (
          <>
            <OmniSearch
              sourceOrgId={sourceOrgId}
              open={omniOpen}
              onOpenChange={setOmniOpen}
              onOpenForge={handleOpenForge}
              onSelectExisting={async (org) => handleSelectExisting(org.id)}
            />
            <CreateClientDialog
              open={forgeOpen}
              onOpenChange={setForgeOpen}
              initialName={forgeInitialName}
              sourceOrgId={sourceOrgId}
              dealId={dealId}
              onSuccess={handleForgeSuccess}
            />
          </>
        )}
      </>
    );
  }

  // Client linked: open Network Detail Sheet when we have relationshipId
  if (client.relationshipId) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('nodeId', client.relationshipId);
    params.set('kind', 'external_partner');
    const sheetHref = `/crm?${params.toString()}`;

    return (
      <a
        href={sheetHref}
        className={cn(
          'w-full text-left rounded-2xl border border-[oklch(1_0_0_/_0.10)] overflow-hidden transition-colors',
          'hover:bg-[var(--stage-surface-hover)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]',
          compact ? 'stage-panel p-3' : 'stage-panel p-4'
        )}
        aria-label={`Client: ${client.organization.name}. Open in Network`}
      >
        <div className="flex items-center gap-3">
          {client.organization.name ? (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] font-medium text-sm tracking-tight"
              aria-hidden
            >
              {initials(client.organization.name)}
            </div>
          ) : (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(1_0_0_/_0.05)] text-[var(--stage-text-secondary)]"
              aria-hidden
            >
              <Building2 className="size-5" strokeWidth={1.5} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
              {client.organization.name || 'Client'}
            </p>
            {client.mainContact && !compact && (
              <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">
                {[client.mainContact.first_name, client.mainContact.last_name].filter(Boolean).join(' ')}
                {client.mainContact.email ? ` · ${client.mainContact.email}` : ''}
              </p>
            )}
          </div>
          <ChevronRight className="size-4 text-[var(--stage-text-secondary)] shrink-0" strokeWidth={1.5} aria-hidden />
        </div>
      </a>
    );
  }

  // Client linked but no relationshipId (legacy): use existing ClientSummaryCard (drawer)
  return <ClientSummaryCard client={client} compact={compact} />;
}

