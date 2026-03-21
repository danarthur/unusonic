'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileEdit, Globe } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { IdentityHeader } from './IdentityHeader';
import { TradeLedger } from './TradeLedger';
import { PrivateNotes } from './PrivateNotes';
import { NodeCrewList } from './NodeCrewList';
import { RoleSelect } from '@/features/team-invite/ui/RoleSelect';
import type { SignalRoleId } from '@/features/team-invite/model/role-presets';
import { updateOrgMemberRole } from '@/features/network-data';
import type { NodeDetail, NodeDetailCrewMember } from '@/features/network-data';

type TabId = 'transmission' | 'crew' | 'ledger';

interface NetworkDetailSheetProps {
  details: NodeDetail;
  /** Called when user closes; defaults to router.push('/network') if omitted. */
  onClose?: () => void;
  /** Current org id (for Summon partner). */
  sourceOrgId: string;
}

const ALL_TABS: { id: TabId; label: string }[] = [
  { id: 'transmission', label: 'Overview' },
  { id: 'crew', label: 'Crew' },
  { id: 'ledger', label: 'Ledger' },
];

function InternalMemberRoleCard({
  details,
  sourceOrgId,
  onSaved,
}: {
  details: NodeDetail;
  sourceOrgId: string;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const role = (details.memberRole ?? 'member') as SignalRoleId;
  const canAssignElevated = details.canAssignElevatedRole ?? false;

  const handleRoleChange = React.useCallback(
    async (newRole: SignalRoleId) => {
      setError(null);
      setSaving(true);
      const result = await updateOrgMemberRole(details.id, sourceOrgId, newRole);
      setSaving(false);
      if (result.ok) {
        onSaved();
        router.refresh();
      } else {
        setError(result.error);
      }
    },
    [details.id, sourceOrgId, onSaved, router]
  );

  return (
    <div className="liquid-card rounded-2xl p-4 md:col-span-1">
      <h3 className="text-sm font-medium tracking-wide text-[var(--color-ink-muted)] mb-3">
        Role
      </h3>
      <RoleSelect
        value={role}
        onChange={handleRoleChange}
        canAssignElevated={canAssignElevated}
        disabled={saving}
      />
      {error && (
        <p className="mt-2 text-xs text-[var(--color-signal-error)]">{error}</p>
      )}
    </div>
  );
}

/** Crew tab only for organizations (vendor, venue, client). Hide for individuals (coordinator or uncategorized, e.g. groom). */
function getTabsForDetail(details: NodeDetail): { id: TabId; label: string }[] {
  const isPartner = details.kind === 'external_partner';
  const category = (details as { orgCategory?: string | null }).orgCategory;
  const showCrew = isPartner && (category === 'vendor' || category === 'venue' || category === 'client');
  return showCrew ? ALL_TABS : ALL_TABS.filter((t) => t.id !== 'crew');
}

export function NetworkDetailSheet({ details, onClose, sourceOrgId }: NetworkDetailSheetProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<TabId>('transmission');

  const handleClose = React.useCallback(() => {
    onClose?.();
    router.push('/network');
  }, [onClose, router]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  const [pendingCrew, setPendingCrew] = React.useState<NodeDetailCrewMember[]>([]);

  React.useEffect(() => {
    setPendingCrew([]);
  }, [details.id]);

  React.useEffect(() => {
    const tabList = getTabsForDetail(details);
    const ids = tabList.map((t) => t.id);
    if (!ids.includes(activeTab)) setActiveTab(ids[0] ?? 'transmission');
  }, [details.id, details.kind, (details as { orgCategory?: string | null }).orgCategory, activeTab]);

  const handleRefresh = React.useCallback(() => {
    router.refresh();
  }, [router]);

  const handleCrewAdded = React.useCallback(
    (newMember?: NodeDetailCrewMember) => {
      if (newMember) setPendingCrew((prev) => [...prev, newMember]);
      setTimeout(() => router.refresh(), 800);
    },
    [router]
  );

  const isPartner = details.kind === 'external_partner';
  const serverCrew = (details.crew ?? []).filter((m) => {
    const n = (m.name ?? '').trim();
    return n.length > 0 && n !== '—';
  });
  // Merge server + pending so adding one person doesn’t hide existing crew. Dedupe by name so we don’t show placeholder + real card (server has ghost email, optimistic has null).
  const serverNames = new Set(
    serverCrew.map((m) => (m.name ?? '').trim().toLowerCase())
  );
  const pendingOnly = pendingCrew.filter(
    (p) => !serverNames.has((p.name ?? '').trim().toLowerCase())
  );
  const crew = [...serverCrew, ...pendingOnly];
  const ghostOrgId = details.targetOrgId ?? '';
  const isCrewEditable = isPartner && details.isGhost && !!ghostOrgId;

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal
        aria-labelledby="network-detail-title"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed inset-0 z-50 flex justify-end"
      >
        <motion.div
          role="presentation"
          className="absolute inset-0 bg-[var(--color-obsidian)]/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          aria-hidden
        />
        <motion.div
          id="network-detail-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="
            fixed inset-y-0 right-0 z-10 flex flex-col h-dvh w-[85vw] max-w-[85vw] md:w-[600px] md:max-w-[600px]
            bg-[var(--color-glass-surface)] backdrop-blur-xl
            border-l border-[var(--color-mercury)] shadow-2xl
          "
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-mercury)] px-4 py-3 md:px-5 md:py-3">
            <h1 id="network-detail-title" className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-[var(--color-ink)]">
              {details.identity.name}
            </h1>
            <div className="flex shrink-0 items-center gap-1">
              {details.isGhost && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/network/entity/${details.id}`)}
                  className="h-8 gap-1.5 px-2 text-[var(--color-silk)] hover:bg-[var(--color-silk)]/10"
                >
                  <FileEdit className="size-4" />
                  Edit
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--color-ink-muted)]" aria-label="View profile">
                <Globe className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleClose}
                aria-label="Close"
              >
                <X className="size-5" />
              </Button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            <IdentityHeader
              details={details}
              sourceOrgId={sourceOrgId}
              onSummonSuccess={handleRefresh}
            />

            {/* Tab strip with sliding indicator */}
            <div className="shrink-0 border-b border-[var(--color-mercury)] px-4 md:px-5">
              <div className="relative flex h-12" role="tablist">
                {getTabsForDetail(details).map(({ id, label }) => (
                  <div key={id} className="relative flex flex-1 items-center justify-center">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === id}
                      aria-controls={`panel-${id}`}
                      id={`tab-${id}`}
                      onClick={() => setActiveTab(id)}
                      className={`
                        text-xs font-medium uppercase tracking-widest
                        transition-colors text-[var(--color-ink-muted)]
                        hover:text-[var(--color-ink)]
                        ${activeTab === id ? 'text-[var(--color-ink)]' : ''}
                      `}
                    >
                      {label}
                    </button>
                    {activeTab === id && (
                      <motion.div
                        layoutId="network-detail-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-silk)]"
                        initial={false}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tab panels with crossfade */}
            <div className="flex-1 overflow-y-auto px-4 py-5 md:px-5 md:py-5 relative">
              <AnimatePresence mode="wait">
              {activeTab === 'transmission' && (
                <motion.div
                  key="transmission"
                  id="panel-transmission"
                  role="tabpanel"
                  aria-labelledby="tab-transmission"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[minmax(120px,auto)]"
                >
                  {/* Signal cell: Ledger — col-span-1 */}
                  <div className="liquid-card rounded-2xl p-4 md:col-span-1">
                    <TradeLedger details={details} />
                  </div>
                  {/* Support cell: Notes — col-span-2 */}
                  <div className="liquid-card rounded-2xl p-4 md:col-span-2">
                    <PrivateNotes
                      relationshipId={details.relationshipId}
                      initialNotes={details.notes}
                    />
                  </div>
                  {/* Role — internal_employee only */}
                  {!isPartner && (
                    <InternalMemberRoleCard
                      details={details}
                      sourceOrgId={sourceOrgId}
                      onSaved={handleRefresh}
                    />
                  )}
                  {/* Website — col-span-2 when partner */}
                  {isPartner && details.orgWebsite && (
                    <div className="liquid-card rounded-2xl p-4 md:col-span-2">
                      <h3 className="text-sm font-medium tracking-wide text-[var(--color-ink-muted)] mb-2">
                        Website
                      </h3>
                      <a
                        href={details.orgWebsite.startsWith('http') ? details.orgWebsite : `https://${details.orgWebsite}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--color-silk)] hover:underline break-all"
                      >
                        {details.orgWebsite}
                      </a>
                    </div>
                  )}
                  {/* Events — col-span-1 */}
                  {details.active_events.length > 0 && (
                    <div className="liquid-card rounded-2xl p-4 md:col-span-1">
                      <h3 className="text-sm font-medium tracking-wide text-[var(--color-ink-muted)] mb-2">
                        Events
                      </h3>
                      <ul className="space-y-1 text-sm text-[var(--color-ink)]">
                        {details.active_events.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'crew' && (
                <motion.div
                  key="crew"
                  id="panel-crew"
                  role="tabpanel"
                  aria-labelledby="tab-crew"
                  initial={false}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="space-y-6"
                >
                  {isPartner ? (
                    <NodeCrewList
                      crew={crew}
                      sourceOrgId={sourceOrgId}
                      ghostOrgId={ghostOrgId}
                      isEditable={isCrewEditable}
                      onAdded={handleCrewAdded}
                    />
                  ) : (
                    <p className="text-sm text-[var(--color-ink-muted)]">
                      Available for partners.
                    </p>
                  )}
                </motion.div>
              )}

              {activeTab === 'ledger' && (
                <motion.div
                  key="ledger"
                  id="panel-ledger"
                  role="tabpanel"
                  aria-labelledby="tab-ledger"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="liquid-card flex flex-col items-center justify-center min-h-[180px] rounded-2xl p-6"
                >
                  <p className="text-sm text-[var(--color-ink-muted)] text-center">
                    Coming soon.
                  </p>
                  <p className="text-xs text-[var(--color-ink-muted)]/70 mt-1">
                    Trade ledger and balance tracking
                  </p>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
