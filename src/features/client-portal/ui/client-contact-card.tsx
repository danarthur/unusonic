/**
 * Client portal contact card.
 *
 * The "one visible human" on every screen (client-portal-design.md §3
 * principle 6). Shows the resolved deal contact — production manager or
 * fallback DJ — with photo, role, and tap-to-call / tap-to-email actions.
 *
 * Warmth is always attributed to a named human (the Visionary "attributed
 * line from Priya" rule). The default tagline is keyed off the contact's
 * source so a DJ fallback reads differently than a sales owner.
 *
 * Renders a soft fallback (vendor name only) when `contact` is null so the
 * card never disappears entirely — the client should always see at least
 * the vendor on the other end of the portal.
 *
 * @module features/client-portal/ui/client-contact-card
 */
import 'server-only';

import { Mail, Phone } from 'lucide-react';

import type { ResolvedDealContact } from '@/shared/lib/client-portal';

import type { ClientPortalWorkspaceSummary } from './client-portal-shell';

type ClientContactCardProps = {
  contact: ResolvedDealContact | null;
  workspace: ClientPortalWorkspaceSummary;
};

function initialsFrom(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '—';
}

function taglineFor(contact: ResolvedDealContact): string {
  switch (contact.source) {
    case 'crew_dj':
      return 'Your DJ for the day';
    case 'owner_profile':
    case 'owner_entity':
    default:
      return 'Looking after your show';
  }
}

export function ClientContactCard({ contact, workspace }: ClientContactCardProps) {
  // Soft fallback — no resolved human, show vendor only.
  if (!contact) {
    return (
      <section
        className="flex items-center gap-4 rounded-[var(--portal-card-radius,12px)] p-5"
        style={{
          backgroundColor: 'var(--portal-surface, var(--stage-surface))',
          border: '1px solid var(--portal-border-subtle, var(--stage-border))',
        }}
      >
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-sm font-medium"
          style={{
            backgroundColor: 'var(--portal-surface-subtle, var(--stage-surface-elevated))',
            color: 'var(--portal-text, var(--stage-text-primary))',
          }}
        >
          {initialsFrom(workspace.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-xs uppercase tracking-[0.14em]"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
          >
            Your team
          </p>
          <p
            className="mt-1 truncate text-base font-medium"
            style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}
          >
            {workspace.name}
          </p>
        </div>
      </section>
    );
  }

  const tagline = taglineFor(contact);

  return (
    <section
      className="flex flex-col gap-4 rounded-[var(--portal-card-radius,12px)] p-5 sm:flex-row sm:items-center"
      style={{
        backgroundColor: 'var(--portal-surface, var(--stage-surface))',
        border: '1px solid var(--portal-border-subtle, var(--stage-border))',
      }}
    >
      <div className="flex items-center gap-4 sm:flex-1 sm:min-w-0">
        {contact.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={contact.avatarUrl}
            alt={contact.displayName}
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-sm font-medium"
            style={{
              backgroundColor: 'var(--portal-surface-subtle, var(--stage-surface-elevated))',
              color: 'var(--portal-text, var(--stage-text-primary))',
            }}
          >
            {initialsFrom(contact.displayName)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] uppercase tracking-[0.14em]"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
          >
            {contact.roleLabel}
          </p>
          <p
            className="mt-0.5 truncate text-base font-medium"
            style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}
          >
            {contact.displayName}
          </p>
          <p
            className="mt-0.5 truncate text-sm"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
          >
            {tagline}
          </p>
        </div>
      </div>

      {(contact.phone || contact.email) && (
        <div className="flex gap-2 sm:shrink-0">
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              aria-label={`Call ${contact.displayName}`}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'var(--portal-surface-subtle, var(--stage-surface-elevated))',
                color: 'var(--portal-text, var(--stage-text-primary))',
              }}
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              aria-label={`Email ${contact.displayName}`}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'var(--portal-surface-subtle, var(--stage-surface-elevated))',
                color: 'var(--portal-text, var(--stage-text-primary))',
              }}
            >
              <Mail className="h-4 w-4" />
            </a>
          )}
        </div>
      )}
    </section>
  );
}
