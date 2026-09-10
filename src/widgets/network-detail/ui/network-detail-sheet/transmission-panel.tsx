'use client';

/**
 * Transmission tab body for NetworkDetailSheet.
 *
 * Extracted from NetworkDetailSheet.tsx during the Phase 0.5-style split
 * (2026-04-28). Composes the long stack of cards shown on the Overview tab:
 * employee summary metrics, partner ledger, role/profile editors, contact
 * fields, venue specs, upcoming assignments, kit, quick-book, deal history,
 * AI brief / working notes, private notes, active shows, invite, and roster
 * status. All branching stays inline — keep this file purely presentational
 * so the parent owns data fetching and refresh callbacks.
 */

import * as React from 'react';
import type { NodeDetail, NodeDetailCrewMember } from '@/features/network-data';
import { EntityAssignments } from '../EntityAssignments';
import { QuickBookAction } from '../QuickBookAction';
import { EntityOverviewCards } from '../EntityOverviewCards';
import {
  InternalMemberRoleCard,
  InternalMemberFieldsCard,
} from './member-cards';

export interface TransmissionPanelProps {
  details: NodeDetail;
  workspaceId: string | null;
  sourceOrgId: string;
  onRefresh: () => void;
  /** Unused — kept so callers can pass the same prop set as the crew tab. */
  pendingCrew?: NodeDetailCrewMember[];
}

export function TransmissionPanel({
  details,
  workspaceId,
  sourceOrgId,
  onRefresh,
}: TransmissionPanelProps) {
  // Same destination as the header's "Open full profile", so a count and the
  // button cannot drift apart.
  const recordHref = `/network/entity/${details.id}?kind=${details.kind}`;
  const isPartner = details.kind === 'external_partner';

  return (
    <>
      {/* ── Employee: Summary metrics (horizontal readouts) ── */}
      {!isPartner && (details.showCount != null || details.totalPaid != null) && (
        <div className="flex items-baseline gap-6">
          {details.showCount != null && (
            <div>
              <p className="stage-label text-[var(--stage-text-secondary)]">Shows</p>
              <p className="text-lg font-mono tabular-nums text-[var(--stage-text-primary)] mt-0.5">{details.showCount}</p>
            </div>
          )}
          {details.totalPaid != null && (
            <div>
              <p className="stage-label text-[var(--stage-text-secondary)]">Total paid</p>
              <p className="text-lg font-mono tabular-nums text-[var(--stage-text-primary)] mt-0.5">${details.totalPaid.toLocaleString()}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Employee: Role + Profile fields (on surface) ── */}
      {!isPartner && (
        <>
          <div className="h-px bg-[var(--stage-edge-subtle)]" />
          <div className="space-y-4">
            <InternalMemberRoleCard
              details={details}
              sourceOrgId={sourceOrgId}
              onSaved={onRefresh}
            />
            <InternalMemberFieldsCard
              details={details}
              sourceOrgId={sourceOrgId}
              onSaved={onRefresh}
            />
          </div>
        </>
      )}

      {/* ── Partner: Contact fields (on surface) ── */}
      {isPartner
        && details.entityDirectoryType !== 'person'
        && details.entityDirectoryType !== 'couple'
        && (details.orgWebsite || details.orgAddress || details.orgSupportEmail)
        && (() => {
          const addr = details.orgAddress as { street?: string; city?: string; state?: string; postal_code?: string } | null;
          const ops = details.orgOperationalSettings as { payment_terms?: string; tax_id?: string } | null | undefined;
          return (
            <>
              <div className="h-px bg-[var(--stage-edge-subtle)]" />
              <div className="space-y-3">
                {details.orgWebsite && (
                  <div>
                    <p className="stage-label text-[var(--stage-text-secondary)] mb-1">Website</p>
                    <a
                      href={details.orgWebsite.startsWith('http') ? details.orgWebsite : `https://${details.orgWebsite}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] hover:underline break-all"
                    >
                      {details.orgWebsite}
                    </a>
                  </div>
                )}
                {details.orgSupportEmail && (
                  <div>
                    <p className="stage-label text-[var(--stage-text-secondary)] mb-1">Support email</p>
                    <a href={`mailto:${details.orgSupportEmail}`}
                      className="text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors">
                      {details.orgSupportEmail}
                    </a>
                  </div>
                )}
                {addr && (addr.street || addr.city) && (
                  <div>
                    <p className="stage-label text-[var(--stage-text-secondary)] mb-1">Address</p>
                    <address className="not-italic space-y-0.5 text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)]">
                      {addr.street && <p>{addr.street}</p>}
                      {(addr.city || addr.state) && <p>{[addr.city, addr.state].filter(Boolean).join(', ')}</p>}
                      {addr.postal_code && <p>{addr.postal_code}</p>}
                    </address>
                  </div>
                )}
                {ops && (ops.payment_terms || ops.tax_id) && (
                  <div className="flex gap-6">
                    {ops.payment_terms && (
                      <div>
                        <p className="stage-label text-[var(--stage-text-secondary)] mb-1">Terms</p>
                        <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">{String(ops.payment_terms)}</p>
                      </div>
                    )}
                    {ops.tax_id && (
                      <div>
                        <p className="stage-label text-[var(--stage-text-secondary)] mb-1">Tax ID</p>
                        <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">On file</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          );
        })()
      }

      {/* Venue specs render once, from VenueSpecsCompactCard inside
          EntityOverviewCards below. This block used to render the same four
          fields again in a different treatment, so a venue sheet showed two
          "Venue specs" headings with the same data under each. */}

      {/* ── Divider before cards ── */}
      <div className="h-px bg-[var(--stage-edge-subtle)]" />

      {/* ── Employee: Upcoming assignments card ── */}
      {!isPartner && details.subjectEntityId && (
        <EntityAssignments entityId={details.subjectEntityId} variant="summary" />
      )}

      {/* ── Employee: Quick-book card ── */}
      {!isPartner && details.subjectEntityId && (
        <QuickBookAction
          entityId={details.subjectEntityId}
          entityName={details.identity.name}
        />
      )}

      {/* ── AI Brief + Working notes / Team + Timeline + Productions ── */}
      {workspaceId && details.subjectEntityId && (() => {
        const t = details.entityDirectoryType;
        if (t !== 'person' && t !== 'company' && t !== 'venue' && t !== 'couple') {
          return null;
        }
        return (
          <EntityOverviewCards
            workspaceId={workspaceId}
            entityId={details.subjectEntityId}
            entityType={t}
            entityName={details.identity.name ?? null}
            relationshipId={details.relationshipId}
            recordHref={recordHref}
          />
        );
      })()}

      {/* The free-text note now composes at the bottom of the Notes card inside
          EntityOverviewCards, rather than in a second card down here. */}

      {/* ── Active shows ──
          Every entity type now. This used to be hidden for people because it
          repeated the productions list's "Booked" band; with that list
          collapsed to a count, hiding it left a person's panel with no answer
          to "what are they on next" -- which is the one thing a count cannot
          give you, because it is the dates you need. */}
      {details.active_events.length > 0 && (
        <div className="border-t border-[var(--stage-edge-subtle)] pt-[var(--stage-padding)]">
          <h3 className="stage-label text-[var(--stage-text-secondary)] mb-2">
            Active shows
          </h3>
          <ul className="space-y-1 text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
            {details.active_events.map((name, i) => (
              <li key={`${name}-${i}`}>{name}</li>
            ))}
          </ul>
        </div>
      )}

      {/*
        Kit, the invite prompt and the roster-status card used to close out this
        panel. All three are things you do to a record rather than things you
        read off one, and each now lives on the record page: kit beside the
        skills, the invite as a banner at the top, and roster status where it
        also carries archive and remove.

        A drawer that offers every operation is not a peek, it is the page with
        less room.
      */}
    </>
  );
}
