'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, UserPlus, Wrench, User, Building2, Search, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/shared/ui/popover';
import { InviteTalentDialog } from '@/features/talent-onboarding';
import { GhostForgeSheet, summonPersonGhost } from '@/features/network-data';
import { AionInput } from '@/widgets/network-detail';
import { NetworkOrbitClient } from './NetworkOrbitClient';
import { NetworkOrbitView } from './NetworkOrbitView';
import { RecentlyDeletedList } from './RecentlyDeletedList';
import type { NetworkNode } from '@/entities/network';
import type { DeletedRelationship } from '@/features/network-data';

import { STAGE_HEAVY } from '@/shared/lib/motion-constants';

// ── Add-menu item ──────────────────────────────────────────────────────────────

interface MenuItemProps {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
  accent?: string;
}

function AddMenuItem({ icon: Icon, label, description, onClick, accent }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-[80ms] hover:bg-[oklch(1_0_0/0.08)]"
    >
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-raised)] group-hover:border-[var(--stage-edge-default)]"
        style={accent ? { color: accent } : undefined}
      >
        <Icon className="size-3.5 text-[var(--stage-text-secondary)] transition-colors group-hover:text-[var(--stage-text-primary)]" strokeWidth={1.5} style={accent ? { color: accent } : undefined} />
      </div>
      <div className="min-w-0">
        <p className="text-[length:var(--stage-data-size)] font-medium text-[var(--stage-text-primary)]">{label}</p>
        <p className="stage-label text-[var(--stage-text-secondary)]">{description}</p>
      </div>
    </button>
  );
}

// ── Add Freelancer sheet ───────────────────────────────────────────────────────

interface AddFreelancerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
}

function AddFreelancerSheet({ open, onOpenChange, orgId }: AddFreelancerSheetProps) {
  const router = useRouter();
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setFirstName('');
      setLastName('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    if (!name) return;
    setPending(true);
    const result = await summonPersonGhost(orgId, name);
    setPending(false);
    if (result.ok) {
      toast.success(`${name} added to Freelancers.`);
      onOpenChange(false);
      router.push(`/network/entity/${result.entityId}?kind=external_partner`);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <AnimatePresence>
      {open && <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
        onClick={() => onOpenChange(false)}
      >
        <div className="pointer-events-none absolute inset-0 bg-[oklch(0.06_0_0/0.75)]" />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={STAGE_HEAVY}
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 mx-4 w-full max-w-sm rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-raised)] p-6 shadow-[0_24px_64px_-8px_oklch(0_0_0/0.5)]"
          data-surface="raised"
        >
          <h2 className="mb-1 text-base font-medium tracking-tight text-[var(--stage-text-primary)]">
            Add freelancer
          </h2>
          <p className="mb-5 stage-label text-[var(--stage-text-secondary)]">
            Occasional hires available in the crew picker. Not on your roster.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block stage-label">
                  First name
                </label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                  required
                  autoFocus
                  className="stage-input h-9"
                />
              </div>
              <div className="space-y-1">
                <label className="block stage-label">
                  Last name
                </label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last"
                  className="stage-input h-9"
                />
              </div>
            </div>
            <p className="stage-label text-[var(--stage-text-secondary)]">
              You can add contact details, skills, and job title on their profile page.
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 rounded-xl border-[var(--stage-edge-subtle)]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || !firstName.trim()}
                className="stage-btn stage-btn-primary flex-1 rounded-xl disabled:opacity-[0.45]"
              >
                {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> : 'Add'}
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface NetworkOrbitWithGenesisProps {
  currentOrgId: string;
  orgName?: string | null;
  nodes: NetworkNode[];
  hasIdentity?: boolean;
  hasTeam?: boolean;
  brandColor?: string | null;
  onUnpin: (relationshipId: string) => Promise<{ ok: boolean; error?: string }>;
  onPin: (relationshipId: string) => Promise<{ ok: boolean; error?: string }>;
  deletedRelationships?: DeletedRelationship[];
}

/**
 * Client shell: owns all modal/sheet state for the Network page header.
 * Single "+ Add" menu replaces the old "Add Talent" + "Seek Network" buttons.
 */
export function NetworkOrbitWithGenesis({
  currentOrgId,
  orgName = null,
  nodes,
  hasIdentity = false,
  hasTeam = false,
  brandColor = null,
  onUnpin,
  onPin,
  deletedRelationships = [],
}: NetworkOrbitWithGenesisProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [omniOpen, setOmniOpen] = React.useState(false);
  const [forge, setForge] = React.useState<{ isOpen: boolean; name: string }>({ isOpen: false, name: '' });

  // Staff / Contractor dialog state
  type StaffMode = 'internal_employee' | 'external_contractor';
  const [staffDialog, setStaffDialog] = React.useState<{ open: boolean; mode: StaffMode }>({
    open: false,
    mode: 'internal_employee',
  });

  // Freelancer dialog state
  const [freelancerOpen, setFreelancerOpen] = React.useState(false);

  const openStaff = (mode: StaffMode) => {
    setMenuOpen(false);
    setStaffDialog({ open: true, mode });
  };

  const openFreelancer = () => {
    setMenuOpen(false);
    setFreelancerOpen(true);
  };

  const openConnect = () => {
    setMenuOpen(false);
    setOmniOpen(true);
  };

  return (
    <div className="relative flex flex-1 flex-col min-h-0" data-surface="void">
      <header className="shrink-0 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-[var(--stage-text-primary)]">
              Network
            </h1>
            <p className="mt-1 text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)]">
              Your team and partners.
            </p>
            {orgName?.trim() && (
              <p className="mt-2 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]" aria-label="Linked organization">
                {orgName.trim()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Connect — org / partner search */}
            <NetworkOrbitClient
              orgId={currentOrgId}
              open={omniOpen}
              onOpenChange={setOmniOpen}
              onOpenForge={(name) => {
                setOmniOpen(false);
                setForge({ isOpen: true, name });
              }}
            />

            {/* Unified + Add menu */}
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  className="stage-btn stage-btn-primary gap-2 rounded-xl px-4"
                >
                  <Plus className="size-4" strokeWidth={1.5} />
                  Add
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <p className="px-3 pb-2 pt-1 stage-label">
                  Add to network
                </p>
                <AddMenuItem
                  icon={UserPlus}
                  label="Staff member"
                  description="Full team member, workspace access"
                  onClick={() => openStaff('internal_employee')}
                />
                <AddMenuItem
                  icon={Wrench}
                  label="Contractor"
                  description="Regular 1099, on your roster"
                  onClick={() => openStaff('external_contractor')}
                />
                <div className="my-2 border-t border-[var(--stage-edge-subtle)]" />
                <AddMenuItem
                  icon={User}
                  label="Freelancer"
                  description="Occasional hire, available in crew picker"
                  onClick={openFreelancer}
                />
                <AddMenuItem
                  icon={Building2}
                  label="Company / Venue"
                  description="Vendor, venue, or partner org"
                  onClick={openConnect}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {deletedRelationships.length > 0 && (
          <RecentlyDeletedList deletedRelationships={deletedRelationships} sourceOrgId={currentOrgId} />
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        <NetworkOrbitView
          nodes={nodes}
          onUnpin={onUnpin}
          onPin={onPin}
          sourceOrgId={currentOrgId}
          hasIdentity={hasIdentity}
          hasTeam={hasTeam}
          brandColor={brandColor}
          onOpenOmni={() => setOmniOpen(true)}
          onOpenProfile={() => router.push('/settings/identity')}
        />
      </div>

      {/* Staff / Contractor dialog */}
      <InviteTalentDialog
        open={staffDialog.open}
        onOpenChange={(open) => setStaffDialog((prev) => ({ ...prev, open }))}
        orgId={currentOrgId}
        initialStatus={staffDialog.mode}
        onSuccess={() => router.refresh()}
      />

      {/* Freelancer dialog */}
      <AddFreelancerSheet
        open={freelancerOpen}
        onOpenChange={setFreelancerOpen}
        orgId={currentOrgId}
      />

      {/* Company / Venue forge sheet */}
      <GhostForgeSheet
        isOpen={forge.isOpen}
        onOpenChange={(open) => setForge((prev) => ({ ...prev, isOpen: open }))}
        initialName={forge.name}
        sourceOrgId={currentOrgId}
        ScoutInputComponent={AionInput}
      />
    </div>
  );
}
