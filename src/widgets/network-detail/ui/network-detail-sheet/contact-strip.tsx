'use client';

/**
 * Always-visible contact strip rendered above the tab bar in NetworkDetailSheet.
 *
 * Extracted from NetworkDetailSheet.tsx during the Phase 0.5-style split
 * (2026-04-28). Renders contact links, partner ledger metrics, ops info,
 * skill pills, last-booked footnote, availability check, portal status,
 * and the relationship-strength badge. Returns null when nothing applies
 * — caller does not have to gate on it.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Mail, Clock } from 'lucide-react';
import type { NodeDetail } from '@/features/network-data';
import { setPersonContact } from '@/features/network-data/api/set-person-contact';
import { InlineField } from '@/shared/ui/inline-field';
import { AvailabilityCheck } from '../AvailabilityCheck';

/**
 * One contact fact: an icon, the value as a tel:/mailto: link, and — for a
 * person — the ability to correct it without leaving the panel. The link stays
 * the display so the common action is still one click and editing is the
 * second one.
 */
function ContactLine({
  icon: Icon,
  value,
  label,
  href,
  editable,
  placeholder,
  type,
  tone,
  onCommit,
}: {
  icon: typeof Phone;
  value: string | null;
  label: string;
  href: string | null;
  editable: boolean;
  placeholder: string;
  type: 'tel' | 'email';
  tone: 'primary' | 'secondary';
  onCommit: (next: string | null) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  if (!value && !editable) return null;

  const text =
    tone === 'primary'
      ? 'text-[var(--stage-text-primary)]'
      : 'text-[var(--stage-text-secondary)]';
  const size = 'text-[length:var(--stage-data-size)]';

  if (!editable) {
    return (
      <a href={href!} className={`flex items-center gap-1.5 ${size} ${text} hover:underline truncate`}>
        <Icon className="size-3.5 shrink-0 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
        {value}
      </a>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
      <InlineField
        value={value}
        label={label}
        emptyLabel={`Add ${label.toLowerCase()}`}
        placeholder={placeholder}
        type={type}
        inputMode={type === 'tel' ? 'tel' : 'email'}
        onCommit={onCommit}
        className={`min-w-0 truncate px-1 -mx-1 ${size} ${text}`}
        display={
          <a href={href ?? undefined} onClick={(e) => e.stopPropagation()} className="hover:underline">
            {value}
          </a>
        }
      />
    </span>
  );
}

export function ContactStrip({ details }: { details: NodeDetail }) {
  const router = useRouter();
  const isPartner = details.kind === 'external_partner';
  const showEmployeeStrip = !isPartner;
  const showPartnerPersonStrip = isPartner
    && (details.entityDirectoryType === 'person' || details.entityDirectoryType === 'couple')
    && (details.personEmail || details.personPhone);
  const hasPartnerMetrics = !!(isPartner
    && (details.partnerShowCount || details.lifetimeValue || details.lastActiveDate));
  const hasPartnerOpsInfo = !!(isPartner
    && details.entityDirectoryType === 'company'
    && details.orgOperationalSettings
    && (details.orgOperationalSettings.payment_terms || details.orgOperationalSettings.tax_id));

  if (!showEmployeeStrip && !showPartnerPersonStrip && !hasPartnerMetrics && !hasPartnerOpsInfo && !details.relationshipStrength) {
    return null;
  }

  const phone = showEmployeeStrip ? details.phone : details.personPhone;
  const email = showEmployeeStrip ? details.identity.email : details.personEmail;

  // Person-shaped records only: the writer patches directory person attributes,
  // and a company's support email lives somewhere else entirely.
  const isEditablePerson =
    Boolean(details.subjectEntityId)
    && (details.entityDirectoryType === 'person' || details.entityDirectoryType === 'couple');

  const commitContact = async (field: 'phone' | 'email', next: string | null) => {
    const result = await setPersonContact(details.subjectEntityId!, field, next);
    if (result.ok) router.refresh();
    return result;
  };

  return (
    <div className="px-6 py-3 space-y-2">
      {/*
        Contact.

        Editable in place for people, because these are the two facts most
        likely to be wrong and least likely to be worth a trip to the form --
        someone tells you the new number while you have the panel open, and the
        correction should cost what saying it cost. Companies keep a plain
        link: an org's support email is written through the profile, and this
        writer is person-scoped on purpose.

        The tel:/mailto: link survives as the display, so the common action
        stays one click and editing is the second one.
      */}
      {(phone || email || isEditablePerson) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <ContactLine
            icon={Phone}
            value={phone ?? null}
            label="Phone"
            href={phone ? `tel:${phone}` : null}
            editable={isEditablePerson}
            placeholder="+1 (555) 000-0000"
            type="tel"
            tone="primary"
            onCommit={(next) => commitContact('phone', next)}
          />
          <ContactLine
            icon={Mail}
            value={email ?? null}
            label="Email"
            href={email ? `mailto:${email}` : null}
            editable={isEditablePerson}
            placeholder="name@example.com"
            type="email"
            tone="secondary"
            onCommit={(next) => commitContact('email', next)}
          />
        </div>
      )}
      {/* Partner computed metrics */}
      {hasPartnerMetrics && (() => {
        const parts: string[] = [];
        const dir = details.direction;
        const isVenue = details.entityDirectoryType === 'venue';

        if (isVenue) {
          if (details.partnerShowCount) parts.push(`${details.partnerShowCount} show${details.partnerShowCount === 1 ? '' : 's'} hosted`);
        } else {
          if (details.lifetimeValue) {
            const label = dir === 'client' ? 'Lifetime' : 'Total spent';
            parts.push(`${label}: $${details.lifetimeValue.toLocaleString()}`);
          }
          if (details.partnerShowCount) parts.push(`${details.partnerShowCount} show${details.partnerShowCount === 1 ? '' : 's'}`);
        }
        if (details.lastActiveDate) {
          const d = new Date(details.lastActiveDate);
          parts.push(`Last: ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`);
        }

        if (!parts.length) return null;
        return (
          <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] font-mono tabular-nums">
            {parts.join(' \u00b7 ')}
          </p>
        );
      })()}
      {/* Operational info — company entities only */}
      {hasPartnerOpsInfo && (() => {
        const ops = details.orgOperationalSettings!;
        const infoParts: string[] = [];
        if (ops.payment_terms) infoParts.push(String(ops.payment_terms));
        if (ops.tax_id) infoParts.push('Tax ID on file');
        if (!infoParts.length) return null;
        return (
          <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
            {infoParts.join(' \u00b7 ')}
          </p>
        );
      })()}
      {/* Skill pills — employees only */}
      {showEmployeeStrip && details.skillTags && details.skillTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {details.skillTags.map((tag) => (
            <span
              key={tag}
              className="stage-badge-text px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {/* Last booked — employees only */}
      {showEmployeeStrip && details.lastBooked && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)]">
          <Clock className="size-3.5" strokeWidth={1.5} />
          <span>
            Last booked: {details.lastBooked.role}
            {details.lastBooked.date && ` · ${new Date(details.lastBooked.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
          </span>
        </div>
      )}
      {/* Availability check — employees only */}
      {showEmployeeStrip && details.subjectEntityId && (
        <AvailabilityCheck entityId={details.subjectEntityId} />
      )}
      {/* Portal status — employees only */}
      {showEmployeeStrip && details.inviteStatus === 'active' && (
        <span className="inline-flex stage-badge-text px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]">
          Active on portal
        </span>
      )}
      {/* Relationship strength indicator */}
      {details.relationshipStrength && (() => {
        const strengthLabels: Record<NonNullable<typeof details.relationshipStrength>, string> = {
          new: 'New',
          growing: 'Growing',
          strong: 'Strong',
          cooling: 'Cooling',
        };
        const strengthStyles: Record<NonNullable<typeof details.relationshipStrength>, string> = {
          new: 'bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-tertiary)]',
          growing: 'bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]',
          strong: 'bg-[oklch(1_0_0/0.10)] text-[var(--stage-text-primary)]',
          cooling: 'bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-tertiary)]',
        };
        return (
          <span className={`inline-flex stage-badge-text px-2 py-0.5 rounded-full ${strengthStyles[details.relationshipStrength!]}`}>
            {strengthLabels[details.relationshipStrength!]}
          </span>
        );
      })()}
    </div>
  );
}
