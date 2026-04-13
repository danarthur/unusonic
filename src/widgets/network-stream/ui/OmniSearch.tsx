'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Search, Loader2, Globe, Ghost, ArrowRight, ChevronsUpDown, CornerDownLeft } from 'lucide-react';

const ICON_STROKE = 1.5;
import { searchNetworkOrgs, summonPartner, summonPartnerAsGhost } from '@/features/network-data';
import type { NetworkSearchOrg } from '@/features/network-data';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';

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
 * The Aion Tuner – Spotlight Artifact.
 * Search First, Summon Second. Vignette + levitating lens over the dashboard; Deep Liquid glass.
 */
export function OmniSearch({ sourceOrgId, open, onOpenChange, onOpenForge, onSelectExisting }: OmniSearchProps) {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const handleClose = React.useCallback(() => onOpenChange(false), [onOpenChange]);
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose]);
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
          {/* 1. THE VIGNETTE -- radial gradient: transparent center, dark edges. Dashboard stays visible. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background: 'oklch(0.06 0 0 / 0.75)',
            }}
          />

          {/* 2. THE ARTIFACT -- levitating modal */}
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={STAGE_HEAVY}
            className="relative z-10 mx-4 w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
            <div
              className="relative overflow-hidden rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-raised)]"
              data-surface="raised"
              style={{
                boxShadow:
                  '0 0 50px -10px oklch(0.88 0 0 / 0.18), 0 20px 40px -10px oklch(0 0 0 / 0.5), inset 0 1px 0 0 oklch(1_0_0_/_0.10)',
              }}
            >
              <Command className="w-full" loop>
            {/* INPUT HEADER – text floats on the glass */}
            <div className="relative flex h-20 items-center border-b border-[var(--stage-edge-subtle)] px-6">
              <Search
                className={`mr-3 h-6 w-6 shrink-0 transition-colors duration-[80ms] ${
                  query.trim()
                    ? 'text-[var(--stage-accent)] drop-shadow-[0_0_8px_oklch(0.88_0_0_/_0.4)]'
                    : 'text-[var(--stage-text-secondary)]'
                }`}
                strokeWidth={ICON_STROKE}
              />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                onKeyDown={handleEnterInSearch}
                placeholder="Search…"
                className="h-full flex-1 bg-transparent px-4 text-xl font-normal text-[var(--stage-text-primary)] outline-none placeholder:text-[var(--stage-text-secondary)]"
                autoFocus
              />
              <div className="flex items-center gap-3">
                {isSearching && (
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--stage-accent)]" strokeWidth={ICON_STROKE} />
                )}
                <span className="hidden rounded border border-[var(--stage-edge-subtle)] px-2 py-1 stage-label md:inline-block">
                  ESC
                </span>
              </div>
            </div>

            {/* RESULTS BODY — staggered entrance */}
            <Command.List className="max-h-[60vh] overflow-y-auto p-3 scroll-py-3">
              {/* GHOST CREATE – company / partner org */}
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
                  className="group flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-[var(--stage-edge-subtle)] p-4 text-left transition-colors hover:border-[var(--stage-accent)]/50 hover:bg-[var(--stage-accent)]/5 data-[selected=true]:border-[var(--stage-accent)]/50 data-[selected=true]:bg-[var(--stage-accent)]/5"
                >
                  {pendingGhost ? (
                    <Loader2 className="h-12 w-12 shrink-0 animate-spin text-[var(--stage-accent)]" strokeWidth={ICON_STROKE} />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)] transition-colors group-hover:text-[var(--stage-accent)]">
                      <Ghost className="h-5 w-5" strokeWidth={ICON_STROKE} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[length:var(--stage-data-size)] font-medium text-[var(--stage-text-primary)] group-hover:text-[var(--stage-accent)] group-data-[selected=true]:text-[var(--stage-accent)]">
                      Add &quot;{query.trim()}&quot;
                    </div>
                    <div className="mt-0.5 stage-label text-[var(--stage-text-secondary)]">
                      Add as a company or partner org
                    </div>
                  </div>
                  <div className="pr-2 opacity-0 transition-opacity group-hover:opacity-100 group-data-[selected=true]:opacity-100">
                    <ArrowRight className="h-4 w-4 text-[var(--stage-accent)]" strokeWidth={ICON_STROKE} />
                  </div>
                </Command.Item>
              )}

              {/* YOUR CONNECTIONS */}
              {hasConnections && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...STAGE_HEAVY, delay: 0.03 }}
                >
                <Command.Group
                  heading={connectionResults.length === 1 ? 'Connection' : 'Connections'}
                  className="mb-1 px-3 py-2 stage-label"
                >
                  {connectionResults.map((org) => (
                    <Command.Item
                      key={org.id}
                      value={`${org.name} ${org.id}`}
                      onSelect={() => handleSelectExisting(org)}
                      disabled={pendingId === org.id}
                      className="group flex cursor-pointer items-center gap-4 rounded-xl px-4 py-3.5 text-[length:var(--stage-data-size)] transition-colors duration-[80ms] data-[selected=true]:bg-[var(--stage-surface-elevated)] data-[selected=true]:text-[var(--stage-text-primary)]"
                    >
                      <div className="relative shrink-0">
                        {pendingId === org.id ? (
                          <Loader2 className="h-10 w-10 animate-spin text-[var(--stage-text-secondary)]" strokeWidth={ICON_STROKE} />
                        ) : org.logo_url ? (
                          <img
                            src={org.logo_url}
                            alt=""
                            className="h-10 w-10 rounded-[var(--stage-radius-nested)] bg-[var(--stage-surface-elevated)] object-cover ring-2 ring-transparent group-data-[selected=true]:ring-[var(--stage-edge-subtle)]"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--stage-radius-nested)] bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)] ring-2 ring-transparent group-data-[selected=true]:ring-[var(--stage-edge-subtle)]">
                            <Globe className="h-5 w-5" strokeWidth={ICON_STROKE} />
                          </div>
                        )}
                        {!org.is_ghost && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--stage-void)] bg-[var(--stage-accent)]"
                            title="Verified"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[length:var(--stage-data-size)] font-medium tracking-tight text-[var(--stage-text-primary)] group-data-[selected=true]:text-[var(--stage-text-primary)]">
                          {org.name}
                        </span>
                        <span className="stage-label text-[var(--stage-text-secondary)] group-data-[selected=true]:text-[var(--stage-text-secondary)]">
                          {org.is_ghost ? 'Internal' : 'Verified'}
                        </span>
                      </div>
                      <div className="opacity-0 transition-opacity group-data-[selected=true]:opacity-100">
                        <span className="rounded bg-[var(--stage-accent-muted)] px-2 py-1 stage-label">
                          Connect
                        </span>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
                </motion.div>
              )}

              {/* DIRECTORY (global) */}
              {hasGlobal && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...STAGE_HEAVY, delay: 0.06 }}
                >
                <Command.Group
                  heading="Directory"
                  className="mb-1 px-3 py-2 stage-label"
                >
                  {globalResults.map((org) => (
                    <Command.Item
                      key={org.id}
                      value={`${org.name} ${org.id}`}
                      onSelect={() => handleSelectExisting(org)}
                      disabled={pendingId === org.id}
                      className="group flex cursor-pointer items-center gap-4 rounded-xl px-4 py-3.5 text-[length:var(--stage-data-size)] transition-colors duration-[80ms] data-[selected=true]:bg-[var(--stage-surface-elevated)] data-[selected=true]:text-[var(--stage-text-primary)]"
                    >
                      <div className="relative shrink-0">
                        {pendingId === org.id ? (
                          <Loader2 className="h-10 w-10 animate-spin text-[var(--stage-text-secondary)]" strokeWidth={ICON_STROKE} />
                        ) : org.logo_url ? (
                          <img
                            src={org.logo_url}
                            alt=""
                            className="h-10 w-10 rounded-[var(--stage-radius-nested)] bg-[var(--stage-surface-elevated)] object-cover ring-2 ring-transparent group-data-[selected=true]:ring-[var(--stage-edge-subtle)]"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--stage-radius-nested)] bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)] ring-2 ring-transparent group-data-[selected=true]:ring-[var(--stage-edge-subtle)]">
                            <Globe className="h-5 w-5" strokeWidth={ICON_STROKE} />
                          </div>
                        )}
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--stage-void)] bg-[var(--stage-accent)]"
                          title="Verified"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[length:var(--stage-data-size)] font-medium tracking-tight text-[var(--stage-text-primary)] group-data-[selected=true]:text-[var(--stage-text-primary)]">
                          {org.name}
                        </span>
                        <span className="stage-label text-[var(--color-unusonic-success)] group-data-[selected=true]:text-[var(--color-unusonic-success)]">
                          Verified
                        </span>
                      </div>
                      <div className="opacity-0 transition-opacity group-data-[selected=true]:opacity-100">
                        <span className="rounded bg-[var(--stage-accent-muted)] px-2 py-1 stage-label">
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
            <div className="flex h-12 items-center justify-between gap-4 border-t border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-nested)] px-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--stage-edge-subtle)] bg-[var(--stage-accent-muted)] px-2.5 py-1.5 stage-label">
                  <ChevronsUpDown className="size-3.5 shrink-0 text-[var(--stage-text-primary)]/80" strokeWidth={ICON_STROKE} aria-hidden />
                  Navigate
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--stage-edge-subtle)] bg-[var(--stage-accent-muted)] px-2.5 py-1.5 stage-label">
                  <CornerDownLeft className="size-3.5 shrink-0 text-[var(--stage-text-primary)]/80" strokeWidth={ICON_STROKE} aria-hidden />
                  Select
                </span>
              </div>
              <span className="stage-label text-[var(--stage-text-secondary)]/80">
                Unusonic
              </span>
            </div>
              </Command>
            </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
