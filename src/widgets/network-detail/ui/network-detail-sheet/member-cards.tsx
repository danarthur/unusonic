'use client';

/**
 * Internal-member edit cards for the NetworkDetailSheet transmission panel.
 *
 * Extracted from NetworkDetailSheet.tsx during the Phase 0.5-style split
 * (2026-04-28). Renders the role-select card, inline phone/title/market
 * editors, and the underlying generic InlineEditField primitive used only
 * within this sheet. Keep field-level UX (autosave on blur, Esc cancel)
 * scoped to this file — broader inline-edit primitives live in shared/ui.
 */

import * as React from 'react';
import { Pencil } from 'lucide-react';
import {
  updateOrgMemberRole,
  updateRosterMemberField,
} from '@/features/network-data';
import type { NodeDetail } from '@/features/network-data';
import { RoleSelect } from '@/features/team-invite/ui/RoleSelect';
import {
  UNUSONIC_ROLE_PRESETS,
  getRoleLabel,
  type UnusonicRoleId,
} from '@/features/team-invite/model/role-presets';

export function InternalMemberRoleCard({
  details,
  sourceOrgId,
  onSaved,
}: {
  details: NodeDetail;
  sourceOrgId: string;
  onSaved: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const role = (details.memberRole ?? 'member') as UnusonicRoleId;
  const canAssignElevated = details.canAssignElevatedRole ?? false;

  const handleRoleChange = React.useCallback(
    async (newRole: UnusonicRoleId) => {
      setError(null);
      setSaving(true);
      const result = await updateOrgMemberRole(details.id, sourceOrgId, newRole);
      setSaving(false);
      if (result.ok) {
        onSaved();
      } else {
        setError(result.error);
      }
    },
    [details.id, sourceOrgId, onSaved]
  );

  const selectedPreset = UNUSONIC_ROLE_PRESETS.find((p) => p.id === role);

  return (
    <div className="space-y-2">
      <p className="stage-label text-[var(--stage-text-secondary)]">
        Access level
      </p>

      {canAssignElevated ? (
        <RoleSelect
          value={role}
          onChange={handleRoleChange}
          canAssignElevated
          disabled={saving}
          showLabel={false}
        />
      ) : (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[var(--stage-edge-subtle)] bg-[oklch(1_0_0_/_0.04)] px-2.5 py-0.5 stage-badge-text text-[var(--stage-text-primary)]">
            {getRoleLabel(role)}
          </span>
        </div>
      )}

      {selectedPreset?.description && (
        <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] leading-relaxed">
          {selectedPreset.description}
        </p>
      )}

      {error && (
        <p role="alert" className="text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{error}</p>
      )}
    </div>
  );
}

// ─── Inline edit field ────────────────────────────────────────────────────────

function InlineEditField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [local, setLocal] = React.useState(value);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // Guard: when true the next blur event is from an Escape dismissal — skip save
  const cancellingRef = React.useRef(false);

  // Sync local state when parent value changes (e.g. after router.refresh)
  React.useEffect(() => {
    if (!editing) setLocal(value);
  }, [value, editing]);

  const save = React.useCallback(async () => {
    if (cancellingRef.current) return;
    if (local === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const err = await onSave(local);
    setSaving(false);
    if (err) {
      setSaveError(err);
    } else {
      setEditing(false);
    }
  }, [local, value, onSave]);

  if (editing) {
    return (
      <div>
        <p className="mb-1 stage-label text-[var(--stage-text-secondary)]">
          {label}
        </p>
        <input
          autoFocus
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { cancellingRef.current = true; setSaveError(null); setEditing(false); setTimeout(() => { cancellingRef.current = false; }, 0); }
          }}
          disabled={saving}
          className="stage-input py-1 text-sm disabled:opacity-[0.45]"
        />
        {saveError && (
          <p role="alert" className="mt-1 text-[length:var(--stage-label-size)] text-[var(--color-unusonic-error)]">{saveError}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1 stage-label text-[var(--stage-text-secondary)]">
        {label}
      </p>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex w-full items-center gap-2 text-left"
      >
        <span className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
          {value || <span className="text-[var(--stage-text-secondary)]">—</span>}
        </span>
        <Pencil className="size-3 opacity-0 transition-opacity duration-[80ms] group-hover:opacity-100 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ─── Internal member fields card ──────────────────────────────────────────────

export function InternalMemberFieldsCard({
  details,
  sourceOrgId,
  onSaved,
}: {
  details: NodeDetail;
  sourceOrgId: string;
  onSaved: () => void;
}) {
  const makeFieldSaver = (field: 'phone' | 'market' | 'job_title') =>
    async (value: string): Promise<string | null> => {
      const result = await updateRosterMemberField(details.id, sourceOrgId, field, value);
      if (!result.ok) return result.error;
      onSaved();
      return null;
    };

  const phone = details.phone ?? '';
  const market = details.market ?? '';
  const jobTitle = (details.identity.label !== details.memberRole && details.identity.label !== 'Member')
    ? details.identity.label
    : '';

  return (
    <div className="space-y-4">
      <InlineEditField label="Job title" value={jobTitle} onSave={makeFieldSaver('job_title')} />
      <InlineEditField label="Phone" value={phone} onSave={makeFieldSaver('phone')} />
      <InlineEditField label="Market" value={market} onSave={makeFieldSaver('market')} />
    </div>
  );
}
