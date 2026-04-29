'use client';

import { useEffect, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, Building2, ChevronRight, FileText } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetBody,
} from '@/shared/ui/sheet';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { DealClientContext } from '../actions/get-deal-client';
import { updateClientAddress } from '../actions/update-client-address';
import { updateIndividualEntity } from '../actions/update-individual-entity';
import { updatePrivateNotes } from '@/features/network/api/actions';
import { toast } from 'sonner';

type ClientSummaryCardProps = {
  client: DealClientContext | null;
  /** When no client linked, show nothing or a placeholder */
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

export function ClientSummaryCard({ client, compact }: ClientSummaryCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Always show the client row: placeholder when no client linked, full card when client exists
  if (!client) {
    return (
      <div
        className={cn(
          'w-full rounded-2xl border border-dashed border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]',
          compact ? 'p-3' : 'p-4'
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--stage-void)] text-[var(--stage-text-secondary)] font-medium text-sm tracking-tight"
            aria-hidden
          >
            —
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-[var(--stage-text-secondary)] tracking-tight">No client linked</p>
            <p className="stage-badge-text text-[var(--stage-text-tertiary)] truncate mt-0.5">
              Link a client when creating a deal to see contact and billing here
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { organization, mainContact } = client;
  const displayName = organization.name;

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setDrawerOpen(true)}
        transition={STAGE_LIGHT}
        className={cn(
          'w-full text-left rounded-2xl border border-[var(--stage-edge-subtle)] overflow-hidden bg-[var(--stage-surface)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]',
          compact ? 'p-3' : 'p-4'
        )}
        aria-label={`Client: ${displayName}. Open client details`}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--stage-surface)] text-[var(--stage-text-primary)] font-medium text-sm tracking-tight border border-[var(--stage-edge-subtle)]"
            aria-hidden
          >
            {initials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-[var(--stage-text-primary)] tracking-tight truncate">{displayName}</p>
            {organization.category && !compact && (
              <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5 capitalize">
                {String(organization.category).replace(/_/g, ' ')}
              </p>
            )}
          </div>
          <ChevronRight className="size-4 text-[var(--stage-text-secondary)] shrink-0" strokeWidth={1.5} aria-hidden />
        </div>
        {!compact && (mainContact?.phone || mainContact?.email) && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--stage-edge-subtle)]">
            {mainContact.phone && (
              <a
                href={`tel:${mainContact.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
              >
                <Phone size={12} strokeWidth={1.5} aria-hidden />
                {mainContact.phone}
              </a>
            )}
            {mainContact.email && (
              <a
                href={`mailto:${mainContact.email}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors truncate"
              >
                <Mail size={12} strokeWidth={1.5} aria-hidden />
                {mainContact.email}
              </a>
            )}
          </div>
        )}
      </motion.button>

      <ClientDrawer
        key={client.organization.id}
        client={client}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  );
}

type ClientDrawerProps = {
  client: DealClientContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatAddress(addr: DealClientContext['organization']['address']): string {
  if (!addr) return '—';
  const parts = [
    addr.street,
    [addr.city, addr.state].filter(Boolean).join(', '),
    addr.postal_code,
    addr.country,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

function ClientDrawer({ client, open, onOpenChange }: ClientDrawerProps) {
  const { organization, mainContact, pastDealsCount, privateNotes } = client;
  const [addressDraft, setAddressDraft] = useState(formatAddress(organization.address));
  const [notesDraft, setNotesDraft] = useState(privateNotes ?? '');
  const [emailDraft, setEmailDraft] = useState(mainContact?.email ?? '');
  const [emailSaved, setEmailSaved] = useState(mainContact?.email ?? '');
  const [savingAddress, startAddressSave] = useTransition();
  const [savingNotes, startNotesSave] = useTransition();
  const [savingEmail, startEmailSave] = useTransition();

  // Re-seed when the contact changes (drawer kept mounted across deals).
  useEffect(() => {
    setEmailDraft(mainContact?.email ?? '');
    setEmailSaved(mainContact?.email ?? '');
  }, [mainContact?.id, mainContact?.email]);

  const handleSaveAddress = () => {
    const parsed = parseAddressLines(addressDraft);
    startAddressSave(async () => {
      await updateClientAddress(organization.id, parsed);
    });
  };

  const handleSaveNotes = () => {
    startNotesSave(async () => {
      const result = await updatePrivateNotes(organization.id, notesDraft.trim() || null, null);
      if (!result.ok) toast.error('Failed to save notes.');
      else toast.success('Notes saved.');
    });
  };

  const handleSaveEmail = () => {
    if (!mainContact) return;
    const trimmed = emailDraft.trim();
    if (trimmed === emailSaved.trim()) return;
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('That email doesn\u2019t look right.');
      setEmailDraft(emailSaved);
      return;
    }
    const displayName = [mainContact.first_name, mainContact.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || (trimmed || 'Contact');
    startEmailSave(async () => {
      const result = await updateIndividualEntity({
        entityId: mainContact.id,
        firstName: mainContact.first_name ?? '',
        lastName: mainContact.last_name ?? '',
        email: trimmed || null,
        phone: mainContact.phone ?? null,
        displayName,
      });
      if (!result.success) {
        toast.error(result.error ?? 'Failed to save email.');
        setEmailDraft(emailSaved);
        return;
      }
      setEmailSaved(trimmed);
      toast.success('Email updated.');
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full max-w-md">
        <SheetHeader className="border-b border-[var(--stage-edge-subtle)] px-6 py-5">
          <SheetTitle>
            Client
          </SheetTitle>
          <SheetClose className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] stage-hover overflow-hidden" />
        </SheetHeader>
        <SheetBody className="flex flex-col gap-6 px-6 py-5 overflow-y-auto">
          {/* Vitals */}
          <section>
            <h3 className="stage-label mb-3">
              Contact
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Building2 size={14} className="text-[var(--stage-text-secondary)] shrink-0" strokeWidth={1.5} />
                <span className="text-[var(--stage-text-primary)] font-medium">{organization.name}</span>
              </div>
              {mainContact && (
                <>
                  <p className="text-[var(--stage-text-secondary)]">
                    {[mainContact.first_name, mainContact.last_name].filter(Boolean).join(' ')}
                  </p>
                  {mainContact.phone && (
                    <a
                      href={`tel:${mainContact.phone}`}
                      className="flex items-center gap-2 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
                    >
                      <Phone size={14} strokeWidth={1.5} />
                      {mainContact.phone}
                    </a>
                  )}
                  {/* Inline-editable email — fix typos without leaving the deal. */}
                  <div className="flex items-center gap-2 text-[var(--stage-text-secondary)]">
                    <Mail size={14} strokeWidth={1.5} className="shrink-0" />
                    <input
                      type="email"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      onBlur={handleSaveEmail}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                        else if (e.key === 'Escape') {
                          setEmailDraft(emailSaved);
                          (e.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      placeholder="email@example.com"
                      autoComplete="email"
                      spellCheck={false}
                      className="flex-1 min-w-0 bg-transparent border-none px-0 py-0 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus:outline-none focus-visible:ring-0 truncate"
                    />
                    {savingEmail && (
                      <span className="text-xs text-[var(--stage-text-tertiary)] shrink-0">Saving…</span>
                    )}
                  </div>
                </>
              )}
              {organization.support_email && !mainContact?.email && (
                <a
                  href={`mailto:${organization.support_email}`}
                  className="flex items-center gap-2 text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
                >
                  <Mail size={14} strokeWidth={1.5} />
                  {organization.support_email}
                </a>
              )}
            </div>
          </section>

          {/* Financials / Billing */}
          <section>
            <h3 className="stage-label mb-3">
              Billing address
            </h3>
            <textarea
              value={addressDraft}
              onChange={(e) => setAddressDraft(e.target.value)}
              onBlur={handleSaveAddress}
              rows={3}
              className="w-full rounded-md border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              placeholder="Street, City, State, Postal code, Country"
            />
            {savingAddress && (
              <p className="text-xs text-[var(--stage-text-secondary)] mt-1">Saving…</p>
            )}
          </section>

          {/* History */}
          <section>
            <h3 className="stage-label mb-3">
              Past gigs
            </h3>
            <div className="flex items-center gap-2 text-sm text-[var(--stage-text-secondary)]">
              <FileText size={14} strokeWidth={1.5} />
              {pastDealsCount} {pastDealsCount === 1 ? 'deal' : 'deals'} with this client
            </div>
          </section>

          {/* Notes */}
          <section>
            <h3 className="stage-label mb-3">
              Client notes
            </h3>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={handleSaveNotes}
              rows={4}
              className="w-full rounded-md border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              placeholder="e.g. Prefers texts over calls. Always wants premium lighting."
            />
            {savingNotes && (
              <p className="text-xs text-[var(--stage-text-secondary)] mt-1">Saving…</p>
            )}
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** Parse a single-line or multi-line address string into orgAddressSchema shape. */
function parseAddressLines(text: string): DealClientContext['organization']['address'] {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lines = trimmed.split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (lines.length >= 4) {
    return {
      street: lines[0] || undefined,
      city: lines[1] || undefined,
      state: lines[2] || undefined,
      postal_code: lines[3] || undefined,
      country: lines[4] || undefined,
    };
  }
  if (lines.length === 1) {
    const parts = lines[0].split(',').map((s) => s.trim());
    if (parts.length >= 2) {
      return {
        street: parts[0] || undefined,
        city: parts[1] || undefined,
        state: parts[2] || undefined,
        postal_code: parts[3] || undefined,
        country: parts[4] || undefined,
      };
    }
    return { street: lines[0] || undefined };
  }
  return {
    street: lines[0] || undefined,
    city: lines[1] || undefined,
    state: lines[2] || undefined,
    postal_code: lines[3] || undefined,
    country: lines[4] || undefined,
  };
}
