'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Search, Loader2, Globe, Ghost, ArrowRight, ChevronsUpDown, CornerDownLeft } from 'lucide-react';
import { searchNetworkOrgs, summonPartner, summonPartnerAsGhost } from '@/features/network-data';
import type { NetworkSearchOrg } from '@/features/network-data';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const spring = { type: 'spring' as const, stiffness: 300, damping: 25 };

interface OmniSearchProps {
  sourceOrgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, "Add" opens the Ghost Forge sheet with this name instead of creating immediately. */
  onOpenForge?: (name: string) => void;
  /** When set, selecting an existing org calls this instead of summonPartner (e.g. Deal Room: link deal to client). */
  onSelectExisting?: (org: NetworkSearchOrg) => void | Promise<void>;
}

/**
 * The Signal Tuner – Spotlight Artifact.
 * Search First, Summon Second. Vignette + levitating lens over the dashboard; Deep Liquid glass.
 */
export function OmniSearch({ sourceOrgId, open, onOpenChange, onOpenForge, onSelectExisting }: OmniSearchProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<NetworkSearchOrg[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [pendingGhost, setPendingGhost] = React.useState(false);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    searchNetworkOrgs(sourceOrgId, q).then((hits) => {
      if (!cancelled) {
        setResults(hits);
        setIsSearching(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sourceOrgId, query]);

  const handleSelectExisting = async (org: NetworkSearchOrg) => {
    if (onSelectExisting) {
      setPendingId(org.id);
      await onSelectExisting(org);
      setPendingId(null);
      onOpenChange(false);
      setQuery('');
      setResults([]);
      return;
    }
    setPendingId(org.id);
    const result = await summonPartner(sourceOrgId, org.id, 'partner');
    setPendingId(null);
    if (result.ok) {
      toast.success(`Connected to ${org.name}`);
      onOpenChange(false);
      setQuery('');
      setResults([]);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleSelectGhost = async () => {
    const q = query.trim();
    if (!q) return;
    setPendingGhost(true);
    const result = await summonPartnerAsGhost(sourceOrgId, q);
    setPendingGhost(false);
    if (result.ok) {
      toast.success(`Added ${q}.`);
      onOpenChange(false);
      setQuery('');
      setResults([]);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const showGhostOption = !isSearching && results.length === 0 && query.trim().length >= 2;
  const connectionResults = results.filter((r) => r._source === 'connection');
  const globalResults = results.filter((r) => r._source === 'global');
  const hasConnections = connectionResults.length > 0;
  const hasGlobal = globalResults.length > 0;

  const handleEnterInSearch = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = query.trim();
      if (q.length < 2) return;
      if (hasConnections && connectionResults[0]) {
        handleSelectExisting(connectionResults[0]);
        return;
      }
      if (hasGlobal && globalResults[0]) {
        handleSelectExisting(globalResults[0]);
        return;
      }
      if (showGhostOption) {
        if (onOpenForge) {
          onOpenForge(q);
          onOpenChange(false);
          setQuery('');
          setResults([]);
        } else {
          handleSelectGhost();
        }
      }
    },
    [
      query,
      hasConnections,
      hasGlobal,
      showGhostOption,
      connectionResults,
      globalResults,
      onOpenForge,
      onOpenChange,
      handleSelectExisting,
      handleSelectGhost,
    ]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="omni"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={() => onOpenChange(false)}
          aria-hidden
        >
          {/* 1. THE VIGNETTE – radial gradient: transparent center, dark edges. Dashboard stays visible. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                'radial-gradient(circle at 50% 35%, transparent 0%, oklch(0.15 0 0 / 0.4) 45%, oklch(0.12 0 0 / 0.85) 100%)',
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* 2. THE ARTIFACT – levitating modal with silk glow + Deep Liquid glass */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            transition={spring}
            className="relative z-10 mx-4 w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
          className="relative overflow-hidden rounded-3xl border border-[var(--color-mercury)] backdrop-blur-2xl"
              style={{
                background: 'oklch(0.18 0 0 / 0.85)',
                boxShadow:
                  '0 0 50px -10px oklch(0.70 0.15 250 / 0.18), 0 20px 40px -10px oklch(0 0 0 / 0.5), inset 0 1px 0 0 var(--color-glass-highlight)',
              }}
            >
              <Command className="w-full" loop>
            {/* INPUT HEADER – text floats on the glass */}
            <div className="relative flex h-20 items-center border-b border-[var(--color-mercury)] px-6">
              <Search
                className={`mr-3 h-6 w-6 shrink-0 transition-colors duration-300 ${
                  query.trim()
                    ? 'text-[var(--color-silk)] drop-shadow-[0_0_8px_oklch(0.70_0.15_250_/_0.4)]'
                    : 'text-[var(--color-ink-muted)]'
                }`}
              />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                onKeyDown={handleEnterInSearch}
                placeholder="Search…"
                className="h-full flex-1 bg-transparent px-4 text-xl font-light text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
                autoFocus
              />
              <div className="flex items-center gap-3">
                {isSearching && (
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--color-silk)]" />
                )}
                <span className="hidden rounded border border-[var(--color-mercury)] px-2 py-1 font-medium uppercase tracking-wider text-[var(--color-ink-muted)] md:inline-block text-[10px]">
                  ESC
                </span>
              </div>
            </div>

            {/* RESULTS BODY — staggered entrance */}
            <Command.List className="max-h-[60vh] overflow-y-auto p-3 scroll-py-3">
              {/* GHOST CREATE – Initialize Protocol */}
              {showGhostOption && (
                <Command.Item
                  value={`Add "${query.trim()}"`}
                  onSelect={() => {
                    const q = query.trim();
                    if (!q) return;
                    if (onOpenForge) {
                      onOpenForge(q);
                      onOpenChange(false);
                      setQuery('');
                      setResults([]);
                    } else {
                      handleSelectGhost();
                    }
                  }}
                  disabled={pendingGhost}
                  className="group flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-[var(--color-mercury)] p-4 text-left transition-all hover:border-[var(--color-silk)]/50 hover:bg-[var(--color-silk)]/5 data-[selected=true]:border-[var(--color-silk)]/50 data-[selected=true]:bg-[var(--color-silk)]/5"
                >
                  {pendingGhost ? (
                    <Loader2 className="h-12 w-12 shrink-0 animate-spin text-[var(--color-silk)]" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-100)] text-[var(--color-ink-muted)] transition-transform group-hover:scale-110 group-hover:text-[var(--color-silk)]">
                      <Ghost className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-medium text-[var(--color-ink)] group-hover:text-[var(--color-silk)] group-data-[selected=true]:text-[var(--color-silk)]">
                      Add &quot;{query.trim()}&quot;
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                      Internal record.
                    </div>
                  </div>
                  <div className="pr-2 opacity-0 transition-opacity group-hover:opacity-100 group-data-[selected=true]:opacity-100">
                    <ArrowRight className="h-4 w-4 text-[var(--color-silk)]" />
                  </div>
                </Command.Item>
              )}

              {/* YOUR CONNECTIONS */}
              {hasConnections && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.03 }}
                >
                <Command.Group
                  heading={connectionResults.length === 1 ? 'Connection' : 'Connections'}
                  className="mb-1 px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]"
                >
                  {connectionResults.map((org) => (
                    <Command.Item
                      key={org.id}
                      value={`${org.name} ${org.id}`}
                      onSelect={() => handleSelectExisting(org)}
                      disabled={pendingId === org.id}
                      className="group flex cursor-pointer items-center gap-4 rounded-xl px-4 py-3.5 text-sm transition-all duration-200 data-[selected=true]:bg-[var(--glass-bg-hover)] data-[selected=true]:text-[var(--color-ink)] data-[selected=true]:shadow-lg"
                    >
                      <div className="relative shrink-0">
                        {pendingId === org.id ? (
                          <Loader2 className="h-10 w-10 animate-spin text-[var(--color-ink-muted)]" />
                        ) : org.logo_url ? (
                          <img
                            src={org.logo_url}
                            alt=""
                            className="h-10 w-10 rounded-full bg-[var(--color-surface-100)] object-cover ring-2 ring-transparent group-data-[selected=true]:ring-[var(--color-mercury)]"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-100)] text-[var(--color-ink-muted)] ring-2 ring-transparent group-data-[selected=true]:ring-[var(--color-mercury)]">
                            <Globe className="h-5 w-5" />
                          </div>
                        )}
                        {!org.is_ghost && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--color-canvas)] bg-[var(--color-silk)]"
                            title="Verified"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-base font-medium text-[var(--color-ink)] group-data-[selected=true]:text-[var(--color-ink)]">
                          {org.name}
                        </span>
                        <span className="text-xs text-[var(--color-ink-muted)] group-data-[selected=true]:text-[var(--color-ink-muted)]">
                          {org.is_ghost ? 'Internal' : 'Verified'}
                        </span>
                      </div>
                      <div className="opacity-0 transition-opacity group-data-[selected=true]:opacity-100">
                        <span className="rounded bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-muted)]">
                          Connect
                        </span>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
                </motion.div>
              )}

              {/* SIGNAL DIRECTORY (global) */}
              {hasGlobal && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.06 }}
                >
                <Command.Group
                  heading="Directory"
                  className="mb-1 px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]"
                >
                  {globalResults.map((org) => (
                    <Command.Item
                      key={org.id}
                      value={`${org.name} ${org.id}`}
                      onSelect={() => handleSelectExisting(org)}
                      disabled={pendingId === org.id}
                      className="group flex cursor-pointer items-center gap-4 rounded-xl px-4 py-3.5 text-sm transition-all duration-200 data-[selected=true]:bg-[var(--glass-bg-hover)] data-[selected=true]:text-[var(--color-ink)] data-[selected=true]:shadow-lg"
                    >
                      <div className="relative shrink-0">
                        {pendingId === org.id ? (
                          <Loader2 className="h-10 w-10 animate-spin text-[var(--color-ink-muted)]" />
                        ) : org.logo_url ? (
                          <img
                            src={org.logo_url}
                            alt=""
                            className="h-10 w-10 rounded-full bg-[var(--color-surface-100)] object-cover ring-2 ring-transparent group-data-[selected=true]:ring-[var(--color-mercury)]"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-100)] text-[var(--color-ink-muted)] ring-2 ring-transparent group-data-[selected=true]:ring-[var(--color-mercury)]">
                            <Globe className="h-5 w-5" />
                          </div>
                        )}
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--color-canvas)] bg-[var(--color-silk)]"
                          title="Verified"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-base font-medium text-[var(--color-ink)] group-data-[selected=true]:text-[var(--color-ink)]">
                          {org.name}
                        </span>
                        <span className="text-xs text-[var(--color-silk)] group-data-[selected=true]:text-[var(--color-silk)]">
                          Verified
                        </span>
                      </div>
                      <div className="opacity-0 transition-opacity group-data-[selected=true]:opacity-100">
                        <span className="rounded bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-muted)]">
                          Connect
                        </span>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
                </motion.div>
              )}
            </Command.List>

            {/* FOOTER – shortcuts + branding (matches artifact pill style) */}
            <div className="flex h-12 items-center justify-between gap-4 border-t border-[var(--color-mercury)] bg-[var(--color-canvas)]/30 px-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-mercury)] bg-white/5 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-muted)]">
                  <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--color-ink)]/80" aria-hidden />
                  Navigate
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-mercury)] bg-white/5 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-muted)]">
                  <CornerDownLeft className="size-3.5 shrink-0 text-[var(--color-ink)]/80" aria-hidden />
                  Select
                </span>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]/80">
                Signal
              </span>
            </div>
              </Command>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
