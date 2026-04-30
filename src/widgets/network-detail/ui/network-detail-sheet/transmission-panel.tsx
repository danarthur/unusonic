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
import { TradeLedger } from '../TradeLedger';
import { PrivateNotes } from '../PrivateNotes';
import { UpcomingAssignments } from '../UpcomingAssignments';
import { CrewKitSection } from '../CrewKitSection';
import { QuickBookAction } from '../QuickBookAction';
import { DealHistoryPanel } from '../DealHistoryPanel';
import { EntityOverviewCards } from '../EntityOverviewCards';
import {
  InternalMemberRoleCard,
  InternalMemberFieldsCard,
} from './member-cards';
import { InviteCard, RosterStatusCard } from './roster-actions';

export interface TransmissionPanelProps {
  details: NodeDetail;
  workspaceId: string | null;
  sourceOrgId: string;
  onRefresh: () => void;
  onClose: () => void;
  /** Unused — kept so callers can pass the same prop set as the crew tab. */
  pendingCrew?: NodeDetailCrewMember[];
}

export function TransmissionPanel({
  details,
  workspaceId,
  sourceOrgId,
  onRefresh,
  onClose,
}: TransmissionPanelProps) {
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

      {/* ── Partner: Ledger card ── */}
      {isPartner && (
        <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
          <TradeLedger details={details} />
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

      {/* ── Partner: Venue specs (on surface) ── */}
      {isPartner && details.entityDirectoryType === 'venue' && details.orgVenueSpecs && (() => {
        const specs = details.orgVenueSpecs!;
        const hasAny = specs.capacity || specs.load_in_notes || specs.power_notes || specs.stage_notes;
        if (!hasAny) return null;
        return (
          <>
            <div className="h-px bg-[var(--stage-edge-subtle)]" />
            <div className="space-y-3">
              <h3 className="stage-label text-[var(--stage-text-secondary)]">Venue specs</h3>
              <dl className="space-y-3">
                {specs.capacity && (
                  <div>
                    <dt className="stage-label text-[var(--stage-text-secondary)] mb-0.5">Capacity</dt>
                    <dd className="text-[length:var(--stage-data-size)] font-mono tabular-nums text-[var(--stage-text-primary)]">{specs.capacity.toLocaleString()}</dd>
                  </div>
                )}
                {specs.load_in_notes && (
                  <div>
                    <dt className="stage-label text-[var(--stage-text-secondary)] mb-0.5">Load-in</dt>
                    <dd className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">{specs.load_in_notes}</dd>
                  </div>
                )}
                {specs.power_notes && (
                  <div>
                    <dt className="stage-label text-[var(--stage-text-secondary)] mb-0.5">Power</dt>
                    <dd className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">{specs.power_notes}</dd>
                  </div>
                )}
                {specs.stage_notes && (
                  <div>
                    <dt className="stage-label text-[var(--stage-text-secondary)] mb-0.5">Stage</dt>
                    <dd className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">{specs.stage_notes}</dd>
                  </div>
                )}
              </dl>
            </div>
          </>
        );
      })()}

      {/* ── Divider before cards ── */}
      <div className="h-px bg-[var(--stage-edge-subtle)]" />

      {/* ── Employee: Upcoming assignments card ── */}
      {!isPartner && details.subjectEntityId && (
        <UpcomingAssignments entityId={details.subjectEntityId} />
      )}

      {/* ── Employee: Kit (equipment profile) ── */}
      {!isPartner && details.subjectEntityId && (
        <CrewKitSection entityId={details.subjectEntityId} />
      )}

      {/* ── Employee: Quick-book card ── */}
      {!isPartner && details.subjectEntityId && (
        <QuickBookAction
          entityId={details.subjectEntityId}
          entityName={details.identity.name}
        />
      )}

      {/* ── Partner: Deal history card ── */}
      {isPartner && details.subjectEntityId && (
        <DealHistoryPanel entityId={details.subjectEntityId} />
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
            density="sheet"
          />
        );
      })()}

      {/* ── Notes card ── */}
      <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
        <PrivateNotes
          relationshipId={details.relationshipId}
          initialNotes={details.notes}
        />
      </div>

      {/* ── Active shows card ── */}
      {details.active_events.length > 0 && (
        <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
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

      {/* ── Employee: Invite card ── */}
      {!isPartner && (details.inviteStatus === 'ghost' || details.inviteStatus === 'invited') && (
        <InviteCard
          details={details}
          sourceOrgId={sourceOrgId}
          onSaved={onRefresh}
        />
      )}

      {/* ── Employee: Roster status card ── */}
      {!isPartner && details.canAssignElevatedRole && (
        <RosterStatusCard
          details={details}
          sourceOrgId={sourceOrgId}
          onRemoved={onClose}
          onSaved={onRefresh}
        />
      )}
    </>
  );
}
