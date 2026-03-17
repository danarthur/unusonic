'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, Building2, ChevronRight, X, User, Pencil, Loader2 } from 'lucide-react';
import { OmniSearch } from '@/widgets/network-stream';
import { NetworkDetailSheet } from '@/widgets/network-detail';
import type { NetworkSearchOrg, NodeDetail } from '@/features/network-data';
import { getNodeForSheet, getCoupleEntityForEdit, getIndividualEntityForEdit, type CoupleEntityForEdit, type IndividualEntityForEdit } from '../actions/get-node-for-sheet';
import {
  addDealStakeholder,
  removeDealStakeholder,
  getOrgRosterForStakeholder,
  createContactForOrg,
  type DealStakeholderDisplay,
  type DealStakeholderRole,
  type OrgRosterContact,
} from '../actions/deal-stakeholders';
import { getStakeholderRoleLabel } from '../lib/stakeholder-roles';
import type { DealClientContext } from '../actions/get-deal-client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { CoupleEditSheet } from './couple-edit-sheet';
import { IndividualEditSheet } from './individual-edit-sheet';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';

const ROLES: DealStakeholderRole[] = ['bill_to', 'planner', 'venue_contact', 'vendor'];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
}

type StakeholderGridProps = {
  dealId: string;
  sourceOrgId: string | null;
  stakeholders: DealStakeholderDisplay[];
  /** Legacy client (from deal.organization_id) when no bill_to stakeholder yet. */
  client: DealClientContext | null;
  onStakeholdersChange: () => void;
  compact?: boolean;
};

export function StakeholderGrid({
  dealId,
  sourceOrgId,
  stakeholders,
  client,
  onStakeholdersChange,
  compact = true,
}: StakeholderGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [omniOpen, setOmniOpen] = useState(false);
  const [setupHintOpen, setSetupHintOpen] = useState(false);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [pendingOrg, setPendingOrg] = useState<NetworkSearchOrg | null>(null);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [roster, setRoster] = useState<OrgRosterContact[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<DealStakeholderRole>('planner');
  const [adding, setAdding] = useState(false);
  const [addContactForm, setAddContactForm] = useState({ firstName: '', lastName: '', email: '' });
  const [addingContact, setAddingContact] = useState(false);

  const billTo = stakeholders.find((s) => s.role === 'bill_to') ?? null;
  const others = stakeholders.filter((s) => s.role !== 'bill_to');
  const hasLegacyClient = !billTo && client?.organization;

  // NetworkDetailSheet state (for cortex-linked entities)
  const [sheetDetails, setSheetDetails] = useState<NodeDetail | null>(null);
  const [loadingRelId, setLoadingRelId] = useState<string | null>(null);

  const handleEditClick = async (relationshipId: string) => {
    setLoadingRelId(relationshipId);
    const details = await getNodeForSheet(relationshipId);
    setLoadingRelId(null);
    if (details) setSheetDetails(details);
  };

  // CoupleEditSheet state
  const [coupleEdit, setCoupleEdit] = useState<{
    open: boolean;
    entityId: string;
    initialValues: CoupleEntityForEdit;
  } | null>(null);
  const [loadingCoupleId, setLoadingCoupleId] = useState<string | null>(null);

  const handleCoupleEditClick = async (entityId: string) => {
    setLoadingCoupleId(entityId);
    const coupleData = await getCoupleEntityForEdit(entityId);
    setLoadingCoupleId(null);
    if (coupleData) {
      setCoupleEdit({ open: true, entityId, initialValues: coupleData });
    } else {
      toast.error('Could not load couple details.');
    }
  };

  // IndividualEditSheet state
  const [individualEdit, setIndividualEdit] = useState<{
    open: boolean;
    entityId: string;
    initialValues: IndividualEntityForEdit;
  } | null>(null);
  const [loadingIndividualId, setLoadingIndividualId] = useState<string | null>(null);

  const handleIndividualEditClick = async (entityId: string) => {
    setLoadingIndividualId(entityId);
    const data = await getIndividualEntityForEdit(entityId);
    setLoadingIndividualId(null);
    if (data) {
      setIndividualEdit({ open: true, entityId, initialValues: data });
    } else {
      toast.error('Could not load client details.');
    }
  };

  // Return path for the "Edit full page" button inside the sheet
  const selectedId = searchParams.get('selected');
  const streamMode = searchParams.get('stream') ?? 'inquiry';
  const crmReturnPath = selectedId
    ? `/crm?selected=${selectedId}&stream=${streamMode}`
    : '/crm';

  const handleAddConnection = () => {
    if (sourceOrgId) {
      setOmniOpen(true);
    } else {
      setSetupHintOpen(true);
    }
  };

  const handleSelectOrg = (org: NetworkSearchOrg) => {
    setPendingOrg(org);
    setOmniOpen(false);
    setSelectedContact(null);
    setContactSheetOpen(true);
    setRosterLoading(true);
    getOrgRosterForStakeholder(org.id).then((list) => {
      setRoster(list);
      setRosterLoading(false);
    });
  };

  const handleSelectContact = (entityId: string) => {
    setSelectedContact(entityId);
    setContactSheetOpen(false);
    setRoleSheetOpen(true);
  };

  const handleSkipContact = () => {
    setSelectedContact(null);
    setContactSheetOpen(false);
    setRoleSheetOpen(true);
  };

  const handleAddNewContactOpen = () => {
    setAddContactForm({ firstName: '', lastName: '', email: '' });
    setAddContactOpen(true);
  };

  const handleAddNewContactSubmit = async () => {
    if (!pendingOrg) return;
    const { firstName, lastName, email } = addContactForm;
    if (!email.trim().includes('@')) {
      toast.error('Valid email required.');
      return;
    }
    setAddingContact(true);
    const result = await createContactForOrg(pendingOrg.id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
    });
    setAddingContact(false);
    if (result.success) {
      setAddContactOpen(false);
      setSelectedContact(result.entityId);
      setRoleSheetOpen(true);
      toast.success('Contact added.');
    } else {
      toast.error(result.error);
    }
  };

  const handleConfirmRole = async () => {
    if (!pendingOrg) return;
    setAdding(true);
    const result = await addDealStakeholder(dealId, selectedRole, {
      organizationId: pendingOrg.id,
      entityId: selectedContact ?? undefined,
      isPrimary: selectedRole === 'bill_to',
    });
    setAdding(false);
    setRoleSheetOpen(false);
    setPendingOrg(null);
    setSelectedContact(null);
    if (result.success) {
      const who = selectedContact ? roster.find((r) => r.entity_id === selectedContact)?.display_name ?? pendingOrg.name : pendingOrg.name;
      toast.success(`${who} added as ${getStakeholderRoleLabel(selectedRole)}.`);
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemove = async (stakeholderId: string) => {
    const result = await removeDealStakeholder(dealId, stakeholderId);
    if (result.success) {
      toast.success('Connection removed.');
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const cardClass = cn(
    'w-full text-left rounded-2xl border border-white/10 backdrop-blur-xl overflow-hidden',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]',
    compact ? 'liquid-card p-3' : 'liquid-card p-4'
  );

  /** Render edit button for a stakeholder — handles cortex-linked orgs, individual, and couple entities */
  const renderEditButton = (s: DealStakeholderDisplay) => {
    // organization_id holds the entity UUID for individual/couple ghost entities too
    const entityId = s.organization_id;
    const isCouple = s.entity_type === 'couple';
    const isIndividual = s.entity_type === 'person';
    const isLoadingThis =
      loadingRelId === s.relationship_id ||
      loadingCoupleId === entityId ||
      loadingIndividualId === entityId;

    if (isCouple && entityId) {
      return (
        <button
          type="button"
          disabled={isLoadingThis}
          onClick={() => handleCoupleEditClick(entityId)}
          className="p-1.5 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/10 transition-colors disabled:opacity-50"
          aria-label={`Edit ${s.contact_name ?? s.name}`}
        >
          {isLoadingThis
            ? <Loader2 className="size-4 animate-spin" />
            : <Pencil className="size-4" />}
        </button>
      );
    }

    if (isIndividual && entityId) {
      return (
        <button
          type="button"
          disabled={isLoadingThis}
          onClick={() => handleIndividualEditClick(entityId)}
          className="p-1.5 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/10 transition-colors disabled:opacity-50"
          aria-label={`Edit ${s.name}`}
        >
          {isLoadingThis
            ? <Loader2 className="size-4 animate-spin" />
            : <Pencil className="size-4" />}
        </button>
      );
    }

    if (s.relationship_id) {
      return (
        <button
          type="button"
          disabled={!!loadingRelId}
          onClick={() => handleEditClick(s.relationship_id!)}
          className="p-1.5 rounded-lg text-ink-muted hover:text-ceramic hover:bg-white/10 transition-colors disabled:opacity-50"
          aria-label={`Edit ${s.contact_name ?? s.name}`}
        >
          {loadingRelId === s.relationship_id
            ? <Loader2 className="size-4 animate-spin" />
            : <Pencil className="size-4" />}
        </button>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted mb-1">
        Stakeholders
      </p>

      {/* Bill-To (primary) or legacy client */}
      {(billTo || hasLegacyClient) && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SIGNAL_PHYSICS}
          className="space-y-1"
        >
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted/80">
            Bill-To
          </p>
          {billTo ? (
            <div className={cn('flex items-center gap-3', cardClass)} style={{ background: 'var(--color-glass-surface)' }}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-ceramic font-medium text-sm tracking-tight">
                {initials(billTo.contact_name ?? billTo.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ceramic tracking-tight truncate">
                  {billTo.contact_name ?? billTo.name}
                </p>
                {billTo.organization_name && (
                  <p className="text-xs text-ink-muted truncate mt-0.5">{billTo.organization_name}</p>
                )}
                {billTo.email && !billTo.organization_name && (
                  <p className="text-xs text-ink-muted truncate mt-0.5">{billTo.email}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {renderEditButton(billTo)}
                <button
                  type="button"
                  onClick={() => handleRemove(billTo.id)}
                  className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white/10 transition-colors"
                  aria-label="Remove"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ) : hasLegacyClient && client ? (
            client.relationshipId ? (
              <Link
                href={`/crm?nodeId=${client.relationshipId}&kind=external_partner`}
                className={cn('flex items-center gap-3', cardClass)}
                style={{ background: 'var(--color-glass-surface)' }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-ceramic font-medium text-sm tracking-tight">
                  {initials(client.organization.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ceramic tracking-tight truncate">
                    {client.organization.name || 'Client'}
                  </p>
                  {client.mainContact && (
                    <p className="text-xs text-ink-muted truncate mt-0.5">
                      {[client.mainContact.first_name, client.mainContact.last_name].filter(Boolean).join(' ')}
                      {client.mainContact.email ? ` · ${client.mainContact.email}` : ''}
                    </p>
                  )}
                </div>
                <ChevronRight className="size-4 text-ink-muted shrink-0" />
              </Link>
            ) : (
              <div className={cn('flex items-center gap-3', cardClass)} style={{ background: 'var(--color-glass-surface)' }}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-ceramic font-medium text-sm tracking-tight">
                  {initials(client.organization.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ceramic tracking-tight truncate">
                    {client.organization.name || 'Client'}
                  </p>
                  {client.mainContact && (
                    <p className="text-xs text-ink-muted truncate mt-0.5">
                      {[client.mainContact.first_name, client.mainContact.last_name].filter(Boolean).join(' ')}
                      {client.mainContact.email ? ` · ${client.mainContact.email}` : ''}
                    </p>
                  )}
                </div>
              </div>
            )
          ) : null}
        </motion.div>
      )}

      {/* Partners / Planner / Venue / Vendor */}
      {others.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted/80">
            Partners
          </p>
          <div className="flex flex-col gap-2">
            {others.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SIGNAL_PHYSICS}
                className={cn('flex items-center gap-3', cardClass)}
                style={{ background: 'var(--color-glass-surface)' }}
              >
                {s.logo_url ? (
                  <img
                    src={s.logo_url}
                    alt=""
                    className="size-10 shrink-0 rounded-xl object-cover bg-white/5"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-ceramic">
                    <Building2 className="size-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ceramic tracking-tight truncate">
                    {s.contact_name ?? s.name}
                  </p>
                  {s.organization_name && (
                    <p className="text-xs text-ink-muted truncate mt-0.5">{s.organization_name}</p>
                  )}
                  <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                    {getStakeholderRoleLabel(s.role)}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {renderEditButton(s)}
                  <button
                    type="button"
                    onClick={() => handleRemove(s.id)}
                    className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white/10 transition-colors"
                    aria-label="Remove"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Add Connection */}
      <motion.button
        type="button"
        onClick={handleAddConnection}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={SIGNAL_PHYSICS}
        className={cn(
          'w-full rounded-2xl border-2 border-dashed border-white/15 backdrop-blur-xl',
          'flex items-center gap-3 text-left transition-colors',
          'hover:border-[var(--color-neon-amber)]/40 hover:bg-[var(--color-neon-amber)]/5',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]',
          compact ? 'liquid-card p-3' : 'liquid-card p-4'
        )}
        style={{ background: 'var(--color-glass-surface)' }}
        aria-label="Add connection"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-neon-amber)]/10 text-[var(--color-neon-amber)]">
          <Plus className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ceramic tracking-tight">Add connection</p>
          <p className="text-xs text-ink-muted truncate mt-0.5">
            {sourceOrgId ? 'Search Network and assign role' : 'Set up Network to add connections'}
          </p>
        </div>
      </motion.button>

      {sourceOrgId && (
        <OmniSearch
          sourceOrgId={sourceOrgId}
          open={omniOpen}
          onOpenChange={setOmniOpen}
          onSelectExisting={async (org) => handleSelectOrg(org)}
        />
      )}

      <Sheet open={setupHintOpen} onOpenChange={setSetupHintOpen}>
        <SheetContent side="center" className="flex flex-col max-w-sm border-l border-[var(--color-mercury)] bg-[var(--color-glass-surface)] backdrop-blur-xl p-0">
          <SheetHeader className="border-b border-white/10 px-6 py-5">
            <SheetTitle className="text-ceramic font-medium tracking-tight">Add connection</SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4 px-6 py-5">
            <p className="text-sm text-ink-muted leading-relaxed">
              Set up your organization in Network first. Then you can search your rolodex and assign roles (Bill-To, Planner, Venue, Vendor) to this deal.
            </p>
            <Button asChild className="w-full rounded-xl bg-[var(--color-neon-amber)]/20 text-[var(--color-neon-amber)] hover:bg-[var(--color-neon-amber)]/30">
              <Link href="/network" className="inline-flex items-center justify-center gap-2">
                Go to Network
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* Point of Contact: who is the lead on this deal? (Dual-Node) */}
      <Sheet open={contactSheetOpen} onOpenChange={setContactSheetOpen}>
        <SheetContent side="center" className="flex flex-col max-w-sm border-l border-[var(--color-mercury)] bg-[var(--color-glass-surface)] backdrop-blur-xl p-0">
          <SheetHeader className="border-b border-white/10 px-6 py-5">
            <SheetTitle className="text-ceramic font-medium tracking-tight">
              Who is the lead on this deal?
            </SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4 px-6 py-5">
            {pendingOrg && (
              <p className="text-sm text-ink-muted">
                Adding <span className="font-medium text-ceramic">{pendingOrg.name}</span>. Select a contact or skip.
              </p>
            )}
            {rosterLoading ? (
              <p className="text-sm text-ink-muted">Loading contacts…</p>
            ) : (
              <>
                <div className="space-y-2 max-h-[240px] overflow-y-auto">
                  {roster.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectContact(c.entity_id)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                        'border-white/10 hover:bg-white/5 hover:border-[var(--color-neon-amber)]/30'
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-ceramic">
                        <User className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ceramic tracking-tight truncate">{c.display_name}</p>
                        {c.email && <p className="text-xs text-ink-muted truncate">{c.email}</p>}
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddNewContactOpen}
                  className="w-full rounded-xl border-dashed border-white/20 text-ink-muted hover:text-ceramic hover:border-[var(--color-neon-amber)]/40"
                >
                  + Add New Contact to {pendingOrg?.name ?? 'Organization'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSkipContact}
                  className="w-full rounded-xl text-ink-muted"
                >
                  Skip (no contact)
                </Button>
              </>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* Add New Contact to org (Ghost Forge lightweight) */}
      <Sheet open={addContactOpen} onOpenChange={setAddContactOpen}>
        <SheetContent side="center" className="flex flex-col max-w-sm border-l border-[var(--color-mercury)] bg-[var(--color-glass-surface)] backdrop-blur-xl p-0">
          <SheetHeader className="border-b border-white/10 px-6 py-5">
            <SheetTitle className="text-ceramic font-medium tracking-tight">
              Add contact to {pendingOrg?.name ?? 'organization'}
            </SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4 px-6 py-5">
            <FloatingLabelInput
              label="First name"
              value={addContactForm.firstName}
              onChange={(e) => setAddContactForm((p) => ({ ...p, firstName: e.target.value }))}
              className="bg-white/5 border-[var(--color-mercury)]"
            />
            <FloatingLabelInput
              label="Last name"
              value={addContactForm.lastName}
              onChange={(e) => setAddContactForm((p) => ({ ...p, lastName: e.target.value }))}
              className="bg-white/5 border-[var(--color-mercury)]"
            />
            <FloatingLabelInput
              label="Email"
              type="email"
              value={addContactForm.email}
              onChange={(e) => setAddContactForm((p) => ({ ...p, email: e.target.value }))}
              required
              className="bg-white/5 border-[var(--color-mercury)]"
            />
            <Button
              onClick={handleAddNewContactSubmit}
              disabled={addingContact || !addContactForm.email.trim().includes('@')}
              className="w-full rounded-xl bg-[var(--color-neon-amber)]/20 text-[var(--color-neon-amber)] hover:bg-[var(--color-neon-amber)]/30"
            >
              {addingContact ? 'Adding…' : 'Add contact'}
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* NetworkDetailSheet for cortex-linked entities */}
      {sheetDetails && sourceOrgId && (
        <NetworkDetailSheet
          details={sheetDetails}
          sourceOrgId={sourceOrgId}
          onClose={() => setSheetDetails(null)}
        />
      )}

      {/* CoupleEditSheet */}
      {coupleEdit && (
        <CoupleEditSheet
          open={coupleEdit.open}
          onOpenChange={(open) => {
            if (!open) setCoupleEdit(null);
            else setCoupleEdit((prev) => prev ? { ...prev, open: true } : null);
          }}
          entityId={coupleEdit.entityId}
          initialValues={coupleEdit.initialValues}
          onSaved={() => {
            onStakeholdersChange();
            router.refresh();
          }}
        />
      )}

      {/* IndividualEditSheet */}
      {individualEdit && (
        <IndividualEditSheet
          open={individualEdit.open}
          onOpenChange={(open) => {
            if (!open) setIndividualEdit(null);
            else setIndividualEdit((prev) => prev ? { ...prev, open: true } : null);
          }}
          entityId={individualEdit.entityId}
          initialValues={individualEdit.initialValues}
          onSaved={() => {
            onStakeholdersChange();
            router.refresh();
          }}
        />
      )}

      <Sheet open={roleSheetOpen} onOpenChange={setRoleSheetOpen}>
        <SheetContent side="center" className="flex flex-col max-w-sm border-l border-[var(--color-mercury)] bg-[var(--color-glass-surface)] backdrop-blur-xl p-0">
          <SheetHeader className="border-b border-white/10 px-6 py-5">
            <SheetTitle className="text-ceramic font-medium tracking-tight">
              What is their role?
            </SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4 px-6 py-5">
            {pendingOrg && (
              <p className="text-sm text-ink-muted">
                Adding <span className="font-medium text-ceramic">{pendingOrg.name}</span>
                {selectedContact && roster.find((r) => r.entity_id === selectedContact) && (
                  <> · <span className="font-medium text-ceramic">{roster.find((r) => r.entity_id === selectedContact)?.display_name}</span></>
                )}{' '}
                to this deal.
              </p>
            )}
            <div className="space-y-2">
              {ROLES.map((role) => (
                <label
                  key={role}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors',
                    selectedRole === role
                      ? 'border-[var(--color-neon-amber)]/50 bg-[var(--color-neon-amber)]/10'
                      : 'border-white/10 hover:bg-white/5'
                  )}
                >
                  <input
                    type="radio"
                    name="stakeholder-role"
                    value={role}
                    checked={selectedRole === role}
                    onChange={() => setSelectedRole(role)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium text-ceramic">{getStakeholderRoleLabel(role)}</span>
                </label>
              ))}
            </div>
            <Button
              onClick={handleConfirmRole}
              disabled={adding}
              className="w-full rounded-xl bg-[var(--color-neon-amber)]/20 text-[var(--color-neon-amber)] hover:bg-[var(--color-neon-amber)]/30"
            >
              {adding ? 'Adding…' : 'Add'}
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
