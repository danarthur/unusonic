'use client';

/**
 * "Never book them again", said once and read everywhere.
 *
 * The flag lives in `context_data.do_not_rebook` on the relationship, and every
 * reader — the contact card's amber marker, the panel badge, crew scheduling
 * suggestions — has always handled any edge type. Only the writers were
 * roster-only, so a freelancer could be flagged by the system and never by a
 * person. `isFlagged` had already argued the point in a comment: outside
 * relationships are where "never again" is the more consequential judgement.
 *
 * Lifted out of RosterStatusCard so the roster and the people you book share
 * one control rather than growing two that drift.
 *
 * Owner/admin only, enforced by `patch_relationship_context`. A decision that
 * the workspace will never hire someone again should have a name on it, which
 * is why it records who set it.
 *
 * @module widgets/network-detail/ui/DoNotRebookCard
 */

import * as React from 'react';
import { setDoNotRebook } from '@/features/network-data';

export interface DoNotRebookCardProps {
  /** The relationship, not the entity: the flag is a property of the link. */
  relationshipId: string;
  sourceOrgId: string;
  flagged: boolean;
  /** Shown under the flag once set, so the judgement is attributable. */
  setByName?: string | null;
  setAt?: string | null;
  onSaved: () => void;
}

export function DoNotRebookCard({
  relationshipId,
  sourceOrgId,
  flagged,
  setByName,
  setAt,
  onSaved,
}: DoNotRebookCardProps) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = async () => {
    setSaving(true);
    setError(null);
    const result = await setDoNotRebook(relationshipId, sourceOrgId, !flagged);
    setSaving(false);
    if (result.ok) {
      onSaved();
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
            Do not rebook
          </p>
          <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
            Flags this person in scheduling suggestions.
          </p>
        </div>
        {flagged ? (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--color-unusonic-warning)]/15 px-2.5 py-1 text-xs font-medium text-[var(--color-unusonic-warning)]">
              Flagged
            </span>
            <button
              type="button"
              onClick={() => void toggle()}
              disabled={saving}
              className="rounded-lg px-2.5 py-1 text-xs text-[var(--stage-text-secondary)] transition-colors hover:bg-[oklch(1_0_0/0.08)] disabled:opacity-[0.45]"
            >
              Clear
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={saving}
            className="rounded-lg border border-[var(--stage-edge-top)] px-3 py-1.5 text-xs text-[var(--stage-text-secondary)] transition-colors hover:border-[var(--color-unusonic-warning)]/50 hover:text-[var(--color-unusonic-warning)] disabled:opacity-[0.45]"
          >
            Flag do not rebook
          </button>
        )}
      </div>
      {flagged && setByName && (
        <p className="text-xs text-[var(--stage-text-tertiary)]">
          Set by {setByName}
          {setAt
            ? ` · ${new Date(setAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : ''}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">
          {error}
        </p>
      )}
    </div>
  );
}
