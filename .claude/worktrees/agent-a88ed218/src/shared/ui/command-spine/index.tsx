'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import {
  LayoutGrid,
  MessageSquare,
  CalendarDays,
  FolderKanban,
  Wallet,
  FileText,
  Receipt,
  LayoutList,
  Network,
  Building2,
  Loader2,
} from 'lucide-react';
import { searchGlobal, type SearchGlobalResult } from '@/shared/actions/search-global';
import { useCommandPaletteOrg } from '@/shared/ui/providers/CommandPaletteContext';

/** Minimal org shape for command palette network search (injected from app/feature layer). */
export interface CommandSpineNetworkOrg {
  id: string;
  name: string;
}

export interface CommandSpineNetworkProps {
  searchNetworkOrgs: (orgId: string, query: string) => Promise<CommandSpineNetworkOrg[]>;
  summonPartner: (orgId: string, partnerId: string, role: string) => Promise<{ ok: boolean; error?: string }>;
}

const STATIC_NAV = [
  { label: 'Overview', href: '/', icon: LayoutGrid },
  { label: 'Brain', href: '/brain', icon: MessageSquare },
  { label: 'Calendar', href: '/calendar', icon: CalendarDays },
  { label: 'Production (CRM)', href: '/crm', icon: FolderKanban },
  { label: 'Finance', href: '/finance', icon: Wallet },
  { label: 'Network', href: '/network', icon: Network },
] as const;

function extractGigIdFromPath(pathname: string): string | null {
  const crmMatch = pathname.match(/^\/crm\/([a-zA-Z0-9_-]+)/);
  if (crmMatch) return crmMatch[1];
  const eventsMatch = pathname.match(/^\/events\/([a-zA-Z0-9_-]+)/);
  if (eventsMatch) return eventsMatch[1];
  return null;
}

export interface CommandSpineProps {
  /** When provided, enables Network group (search orgs, add to Inner Circle). Injected from app layer. */
  network?: CommandSpineNetworkProps;
}

export function CommandSpine({ network }: CommandSpineProps = {}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchGlobalResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [networkOrgs, setNetworkOrgs] = useState<CommandSpineNetworkOrg[]>([]);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkPendingId, setNetworkPendingId] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const gigId = extractGigIdFromPath(pathname ?? '');
  const currentOrgId = useCommandPaletteOrg();
  const isOnNetwork = pathname === '/network';

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        if (!open) {
          setSearch('');
          setSearchResults(null);
          setNetworkOrgs([]);
        }
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open]);

  const runSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const results = await searchGlobal(q);
      setSearchResults(results);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (search.length < 2) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(() => runSearch(search), 150);
    return () => clearTimeout(t);
  }, [search, runSearch]);

  const runNetworkSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (!network || !currentOrgId || q.length < 1) {
      setNetworkOrgs([]);
      return;
    }
    setNetworkLoading(true);
    try {
      const results = await network.searchNetworkOrgs(currentOrgId, q);
      setNetworkOrgs(results);
    } finally {
      setNetworkLoading(false);
    }
  }, [network, currentOrgId]);

  useEffect(() => {
    if (!isOnNetwork || !currentOrgId) {
      setNetworkOrgs([]);
      return;
    }
    const t = setTimeout(() => runNetworkSearch(search), 150);
    return () => clearTimeout(t);
  }, [isOnNetwork, currentOrgId, search, runNetworkSearch]);

  const handleSelect = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  const handleAddPartner = useCallback(async (org: CommandSpineNetworkOrg) => {
    if (!network || !currentOrgId) return;
    setNetworkPendingId(org.id);
    try {
      const result = await network.summonPartner(currentOrgId, org.id, 'partner');
      if (result.ok) {
        setOpen(false);
        setSearch('');
        setNetworkOrgs([]);
        router.refresh();
      }
    } finally {
      setNetworkPendingId(null);
    }
  }, [network, currentOrgId, router]);

  const hasSearchResults =
    searchResults &&
    (searchResults.events.length > 0 || searchResults.invoices.length > 0);

  const itemClass =
    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-ink text-sm transition-all duration-200 data-[selected=true]:bg-[var(--glass-bg-hover)] data-[selected=true]:text-ink [&[data-selected=true]_svg]:text-ink";
  const groupHeadingClass =
    "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-muted/70";

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="command-spine-dialog fixed left-1/2 top-[8%] z-[9999] w-[640px] -translate-x-1/2 overflow-hidden rounded-[2rem]"
    >
      <Dialog.Title className="sr-only">Command palette</Dialog.Title>
      {/* Grain overlay for Liquid Ceramic texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02] mix-blend-overlay z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder="What do you need?"
        className="relative z-10 w-full shrink-0 border-0 bg-transparent px-5 py-3 text-lg font-light leading-relaxed tracking-tight text-ink placeholder:text-ink-muted focus:outline-none focus:ring-0"
        autoFocus
      />
      <Command.List className="smart-group-scroll relative z-10 flex-1 min-h-0 overflow-y-auto border-t border-[var(--glass-border)] px-2 py-2">
        <Command.Empty className="py-10 text-center text-sm text-ink-muted">
          No results found.
        </Command.Empty>

        {/* Static: Jump To — always visible (forceMount so typing doesn't hide nav) */}
        <Command.Group heading="Jump To" forceMount className={groupHeadingClass}>
          {STATIC_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Command.Item
                key={item.href}
                value={`${item.label} ${item.href}`}
                onSelect={() => handleSelect(item.href)}
                className={itemClass}
              >
                <Icon size={18} className="shrink-0 text-ink-muted transition-colors" strokeWidth={1.5} />
                {item.label}
              </Command.Item>
            );
          })}
        </Command.Group>

        {/* Context: Network — when on /network and org is set, search orgs and add to Inner Circle (requires network prop from app) */}
        {network && isOnNetwork && currentOrgId && (
          <Command.Group heading="Network" forceMount className={groupHeadingClass}>
            {networkLoading && search.trim().length >= 1 && (
              <div className="px-3 py-2 text-sm text-ink-muted flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Searching organizations…
              </div>
            )}
            {!networkLoading && networkOrgs.length > 0 && networkOrgs.map((org) => (
              <Command.Item
                key={org.id}
                value={`${org.name} ${org.id}`}
                onSelect={() => handleAddPartner(org)}
                disabled={networkPendingId === org.id}
                className={itemClass}
              >
                {networkPendingId === org.id ? (
                  <Loader2 size={18} className="shrink-0 animate-spin text-ink-muted" />
                ) : (
                  <Building2 size={18} className="shrink-0 text-ink-muted transition-colors" strokeWidth={1.5} />
                )}
                <span className="truncate">{org.name}</span>
                <span className="text-ink-muted text-xs">Add to Inner Circle</span>
              </Command.Item>
            ))}
            {!networkLoading && search.trim().length >= 1 && networkOrgs.length === 0 && (
              <div className="px-3 py-2 text-sm text-ink-muted">No organizations found</div>
            )}
          </Command.Group>
        )}

        {/* Context: This Event — when inside /crm/[id] or /events/[id] */}
        {gigId && (
          <Command.Group heading="This Event" forceMount className={groupHeadingClass}>
            <Command.Item
              value="Go to Run of Show"
              onSelect={() => handleSelect(`/crm/${gigId}`)}
              className={itemClass}
            >
              <LayoutList size={18} className="shrink-0 text-ink-muted transition-colors" strokeWidth={1.5} />
              Go to Run of Show
            </Command.Item>
            <Command.Item
              value="Go to Deal Room"
              onSelect={() => handleSelect(`/events/${gigId}/deal`)}
              className={itemClass}
            >
              <FileText size={18} className="shrink-0 text-ink-muted transition-colors" strokeWidth={1.5} />
              Go to Deal Room
            </Command.Item>
            <Command.Item
              value="Go to Finance"
              onSelect={() => handleSelect(`/events/${gigId}/finance`)}
              className={itemClass}
            >
              <Wallet size={18} className="shrink-0 text-ink-muted transition-colors" strokeWidth={1.5} />
              Go to Finance
            </Command.Item>
          </Command.Group>
        )}

        {/* Dynamic: Search results */}
        {search.length >= 2 && (
          <Command.Group heading="Search Results" forceMount className={groupHeadingClass}>
            {searchLoading && (
              <div className="px-3 py-4 text-sm text-ink-muted">Searching…</div>
            )}
            {!searchLoading && hasSearchResults && (
              <>
                {searchResults!.events.map((ev) => (
                  <Command.Item
                    key={ev.id}
                    value={`${ev.title} ${ev.client_name ?? ''} event`}
                    onSelect={() => handleSelect(`/crm/${ev.id}`)}
                    className={itemClass}
                  >
                    <FolderKanban size={18} className="shrink-0 text-ink-muted transition-colors" strokeWidth={1.5} />
                    <span className="truncate">{ev.title ?? 'Untitled'}</span>
                    {ev.client_name && (
                      <span className="truncate text-ink-muted">· {ev.client_name}</span>
                    )}
                  </Command.Item>
                ))}
                {searchResults!.invoices.map((inv) => (
                  <Command.Item
                    key={inv.id}
                    value={`${inv.invoice_number ?? inv.id} invoice`}
                    onSelect={() => handleSelect(`/events/${inv.event_id}/finance`)}
                    className={itemClass}
                  >
                    <Receipt size={18} className="shrink-0 text-ink-muted transition-colors" strokeWidth={1.5} />
                    <span className="truncate">
                      {inv.invoice_number ?? `Invoice ${inv.id.slice(0, 8)}`}
                    </span>
                    <span className="text-ink-muted">· {inv.status}</span>
                  </Command.Item>
                ))}
              </>
            )}
            {!searchLoading && search.length >= 2 && !hasSearchResults && (
              <div className="px-3 py-4 text-sm text-ink-muted">
                No events or invoices match
              </div>
            )}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
