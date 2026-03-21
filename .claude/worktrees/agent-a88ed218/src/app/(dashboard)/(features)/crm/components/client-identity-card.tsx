'use client';

import { useState, useTransition } from 'react';
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
import { Button } from '@/shared/ui/button';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import type { DealClientContext } from '../actions/get-deal-client';
import { updateClientAddress } from '../actions/update-client-address';
import { updatePrivateNotes } from '@/features/network/api/actions';

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
          'w-full rounded-2xl border border-white/10 border-dashed backdrop-blur-xl',
          compact ? 'liquid-card p-3' : 'liquid-card p-4'
        )}
        style={{ background: 'var(--color-glass-surface)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-ink-muted font-medium text-sm tracking-tight"
            aria-hidden
          >
            —
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-muted tracking-tight">No client linked</p>
            <p className="text-xs text-ink-muted/70 truncate mt-0.5">
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
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={SIGNAL_PHYSICS}
        className={cn(
          'w-full text-left rounded-2xl border border-white/10 backdrop-blur-xl overflow-hidden',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]',
          compact ? 'liquid-card p-3' : 'liquid-card p-4'
        )}
        style={{ background: 'var(--color-glass-surface)' }}
        aria-label={`Client: ${displayName}. Open client details`}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-ceramic font-medium text-sm tracking-tight"
            aria-hidden
          >
            {initials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ceramic tracking-tight truncate">{displayName}</p>
            {organization.category && !compact && (
              <p className="text-xs text-ink-muted truncate mt-0.5 capitalize">
                {String(organization.category).replace(/_/g, ' ')}
              </p>
            )}
          </div>
          <ChevronRight className="size-4 text-ink-muted shrink-0" aria-hidden />
        </div>
        {!compact && (mainContact?.phone || mainContact?.email) && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
            {mainContact.phone && (
              <a
                href={`tel:${mainContact.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ceramic transition-colors"
              >
                <Phone size={12} aria-hidden />
                {mainContact.phone}
              </a>
            )}
            {mainContact.email && (
              <a
                href={`mailto:${mainContact.email}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ceramic transition-colors truncate"
              >
                <Mail size={12} aria-hidden />
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
  const [savingAddress, startAddressSave] = useTransition();
  const [savingNotes, startNotesSave] = useTransition();

  const handleSaveAddress = () => {
    const parsed = parseAddressLines(addressDraft);
    startAddressSave(async () => {
      await updateClientAddress(organization.id, parsed);
    });
  };

  const handleSaveNotes = () => {
    startNotesSave(async () => {
      await updatePrivateNotes(organization.id, notesDraft.trim() || null, null);
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full max-w-md">
        <SheetHeader className="border-b border-white/10 px-6 py-5">
          <SheetTitle className="text-ceramic font-medium tracking-tight">
            Client
          </SheetTitle>
          <SheetClose className="text-ink-muted hover:text-ceramic" />
        </SheetHeader>
        <SheetBody className="flex flex-col gap-6 px-6 py-5 overflow-y-auto">
          {/* Vitals */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-3">
              Contact
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Building2 size={14} className="text-ink-muted shrink-0" />
                <span className="text-ceramic font-medium">{organization.name}</span>
              </div>
              {mainContact && (
                <>
                  <p className="text-ink-muted">
                    {[mainContact.first_name, mainContact.last_name].filter(Boolean).join(' ')}
                  </p>
                  {mainContact.phone && (
                    <a
                      href={`tel:${mainContact.phone}`}
                      className="flex items-center gap-2 text-ink-muted hover:text-ceramic transition-colors"
                    >
                      <Phone size={14} />
                      {mainContact.phone}
                    </a>
                  )}
                  {mainContact.email && (
                    <a
                      href={`mailto:${mainContact.email}`}
                      className="flex items-center gap-2 text-ink-muted hover:text-ceramic transition-colors truncate"
                    >
                      <Mail size={14} />
                      {mainContact.email}
                    </a>
                  )}
                </>
              )}
              {organization.support_email && !mainContact?.email && (
                <a
                  href={`mailto:${organization.support_email}`}
                  className="flex items-center gap-2 text-ink-muted hover:text-ceramic transition-colors"
                >
                  <Mail size={14} />
                  {organization.support_email}
                </a>
              )}
            </div>
          </section>

          {/* Financials / Billing */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-3">
              Billing address
            </h3>
            <textarea
              value={addressDraft}
              onChange={(e) => setAddressDraft(e.target.value)}
              onBlur={handleSaveAddress}
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-obsidian/50 px-3 py-2.5 text-sm text-ceramic placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="Street, City, State, Postal code, Country"
            />
            {savingAddress && (
              <p className="text-xs text-ink-muted mt-1">Saving…</p>
            )}
          </section>

          {/* History */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-3">
              Past gigs
            </h3>
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <FileText size={14} />
              {pastDealsCount} {pastDealsCount === 1 ? 'deal' : 'deals'} with this client
            </div>
          </section>

          {/* Notes */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-widest text-ink-muted mb-3">
              Client notes
            </h3>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={handleSaveNotes}
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-obsidian/50 px-3 py-2.5 text-sm text-ceramic placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="e.g. Prefers texts over calls. Always wants premium lighting."
            />
            {savingNotes && (
              <p className="text-xs text-ink-muted mt-1">Saving…</p>
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
