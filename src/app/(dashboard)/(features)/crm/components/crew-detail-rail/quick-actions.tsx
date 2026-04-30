'use client';

/**
 * QuickActions — the friendly top-of-body action row.
 *
 * Extracted from crew-detail-rail.tsx (Phase 0.5-style mechanical split).
 *
 * Three contact links (Call / Email / Text) plus a Confirm override that
 * only surfaces for assignees who haven't confirmed yet. Confirm stays in
 * the friendly bar (not the danger zone) because it's a committing action,
 * not a destructive one.
 */

import { CheckCheck, Loader2, Mail, MessageSquare, Phone } from 'lucide-react';
import type { DealCrewRow } from '../../actions/deal-crew';

export function QuickActions({
  row,
  confirming,
  onConfirm,
}: {
  row: DealCrewRow;
  confirming: boolean;
  onConfirm: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {row.phone && (
          <a
            href={`tel:${row.phone}`}
            className="stage-btn stage-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-sm"
          >
            <Phone className="size-3" />
            Call
          </a>
        )}
        {row.email && (
          <a
            href={`mailto:${row.email}`}
            className="stage-btn stage-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-sm"
          >
            <Mail className="size-3" />
            Email
          </a>
        )}
        {row.phone && (
          <a
            href={`sms:${row.phone}`}
            className="stage-btn stage-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-sm"
          >
            <MessageSquare className="size-3" />
            Text
          </a>
        )}
        {!row.phone && !row.email && (
          <span className="stage-badge-text text-[var(--stage-text-tertiary)]">
            No contact info on file.
          </span>
        )}
        {/* Confirm override — only surfaces for assignees who haven't confirmed yet.
            Stays in the friendly top bar because it's a committing action, not a
            destructive one. */}
        {row.entity_id && !row.confirmed_at && row.status !== 'replaced' && row.status !== 'declined' && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="stage-btn stage-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-sm disabled:opacity-45 disabled:pointer-events-none"
            title="Manually confirm this crew member"
          >
            {confirming ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
            Confirm
          </button>
        )}
      </div>
    </section>
  );
}
