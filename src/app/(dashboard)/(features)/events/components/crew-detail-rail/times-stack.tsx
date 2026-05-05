'use client';

/**
 * TimesStack — primary call + per-person waypoints
 *
 * Extracted from crew-detail-rail.tsx (Phase 0.5-style mechanical split).
 *
 * Primary call pinned at the top (deal_crew.call_time). Waypoints render
 * below in sort_order. Adding or editing a waypoint uses a small inline
 * form — keeps the UI self-contained inside the Agreed section.
 *
 * Owns:
 *   - TimesStack — exported, consumed by AgreedSection.
 *   - WaypointRow — internal helper for the per-row inline editor.
 */

import { useState } from 'react';
import { Clock, Loader2, Plus, X } from 'lucide-react';
import { TimePicker } from '@/shared/ui/time-picker';
import {
  WAYPOINT_KIND_LABELS,
  type AddWaypointInput,
  type CrewWaypoint,
  type WaypointKind,
  type WaypointPatch,
} from './shared';

export function TimesStack({
  primaryCallTime,
  primaryCallSaving,
  onPrimaryCallChange,
  waypoints,
  onAddWaypoint,
  onUpdateWaypoint,
  onRemoveWaypoint,
}: {
  primaryCallTime: string | null;
  primaryCallSaving: boolean;
  onPrimaryCallChange: (value: string | null) => void;
  waypoints: CrewWaypoint[];
  onAddWaypoint: (input: AddWaypointInput) => void;
  onUpdateWaypoint: (id: string, patch: WaypointPatch) => void;
  onRemoveWaypoint: (id: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<{
    kind: WaypointKind;
    customLabel: string;
    time: string;
    locationName: string;
  }>({ kind: 'venue_arrival', customLabel: '', time: '', locationName: '' });

  const resetDraft = () => setDraft({ kind: 'venue_arrival', customLabel: '', time: '', locationName: '' });

  const submitAdd = () => {
    if (!draft.time) return;
    if (draft.kind === 'custom' && !draft.customLabel.trim()) return;
    onAddWaypoint({
      kind: draft.kind,
      customLabel: draft.kind === 'custom' ? draft.customLabel.trim() : null,
      time: draft.time,
      locationName: draft.locationName.trim() || null,
    });
    resetDraft();
    setAddOpen(false);
  };

  return (
    <div
      className="flex flex-col rounded-lg"
      style={{
        background: 'oklch(1 0 0 / 0.03)',
        border: '1px solid oklch(1 0 0 / 0.06)',
      }}
    >
      {/* Primary call row */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Clock className="size-3 text-[var(--stage-text-tertiary)]" />
        <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
          Primary call
        </span>
        {primaryCallSaving && (
          <Loader2 className="size-3 animate-spin text-[var(--stage-text-tertiary)]" />
        )}
        <div className="ml-auto w-28">
          <TimePicker
            value={primaryCallTime}
            onChange={onPrimaryCallChange}
            placeholder="Set time"
            variant="ghost"
          />
        </div>
      </div>

      {/* Waypoints */}
      {waypoints.length > 0 && (
        <div
          className="border-t flex flex-col"
          style={{ borderColor: 'oklch(1 0 0 / 0.05)' }}
        >
          {waypoints.map((wp) => (
            <WaypointRow
              key={wp.id}
              waypoint={wp}
              onUpdate={onUpdateWaypoint}
              onRemove={onRemoveWaypoint}
            />
          ))}
        </div>
      )}

      {/* Add waypoint */}
      <div
        className="border-t"
        style={{ borderColor: 'oklch(1 0 0 / 0.05)' }}
      >
        {!addOpen ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
          >
            <Plus className="size-3" />
            Add waypoint
          </button>
        ) : (
          <div className="flex flex-col gap-2 p-2.5">
            <div className="flex items-center gap-2">
              <select
                value={draft.kind}
                onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as WaypointKind }))}
                className="text-sm px-2 py-1 outline-none focus-visible:border-[oklch(1_0_0/0.2)]"
                style={{
                  background: 'var(--ctx-well)',
                  border: '1px solid oklch(1 0 0 / 0.06)',
                  borderRadius: 'var(--stage-radius-input, 6px)',
                  color: 'var(--stage-text-primary)',
                }}
              >
                {(Object.keys(WAYPOINT_KIND_LABELS) as WaypointKind[]).map((k) => (
                  <option key={k} value={k}>{WAYPOINT_KIND_LABELS[k]}</option>
                ))}
              </select>
              <div className="w-28">
                <TimePicker
                  value={draft.time || null}
                  onChange={(v) => setDraft((d) => ({ ...d, time: v ?? '' }))}
                  placeholder="Time"
                  variant="ghost"
                />
              </div>
            </div>
            {draft.kind === 'custom' && (
              <input
                type="text"
                value={draft.customLabel}
                onChange={(e) => setDraft((d) => ({ ...d, customLabel: e.target.value }))}
                placeholder="Label (e.g. Meet with client)"
                className="text-sm px-2 py-1 outline-none focus-visible:border-[oklch(1_0_0/0.2)]"
                style={{
                  background: 'var(--ctx-well)',
                  border: '1px solid oklch(1 0 0 / 0.06)',
                  borderRadius: 'var(--stage-radius-input, 6px)',
                  color: 'var(--stage-text-primary)',
                }}
              />
            )}
            <input
              type="text"
              value={draft.locationName}
              onChange={(e) => setDraft((d) => ({ ...d, locationName: e.target.value }))}
              placeholder="Location (optional)"
              className="text-sm px-2 py-1 outline-none focus-visible:border-[oklch(1_0_0/0.2)]"
              style={{
                background: 'var(--ctx-well)',
                border: '1px solid oklch(1 0 0 / 0.06)',
                borderRadius: 'var(--stage-radius-input, 6px)',
                color: 'var(--stage-text-primary)',
              }}
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => { resetDraft(); setAddOpen(false); }}
                className="stage-btn stage-btn-ghost text-sm px-2.5 py-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAdd}
                disabled={!draft.time || (draft.kind === 'custom' && !draft.customLabel.trim())}
                className="stage-btn stage-btn-primary text-sm px-2.5 py-1 disabled:opacity-45 disabled:pointer-events-none"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WaypointRow({
  waypoint,
  onUpdate,
  onRemove,
}: {
  waypoint: CrewWaypoint;
  onUpdate: (id: string, patch: WaypointPatch) => void;
  onRemove: (id: string) => void;
}) {
  const label = waypoint.kind === 'custom' && waypoint.custom_label
    ? waypoint.custom_label
    : WAYPOINT_KIND_LABELS[waypoint.kind];

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 group">
      <span
        className="stage-badge-text tracking-tight text-[var(--stage-text-secondary)] min-w-[6.5rem]"
        title={waypoint.notes ?? undefined}
      >
        {label}
      </span>
      <div className="w-24">
        <TimePicker
          value={waypoint.time}
          onChange={(v) => {
            if (v) onUpdate(waypoint.id, { time: v });
          }}
          variant="ghost"
        />
      </div>
      {waypoint.location_name && (
        <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)] min-w-0 truncate">
          {waypoint.location_name}
        </span>
      )}
      <button
        type="button"
        onClick={() => onRemove(waypoint.id)}
        className="ml-auto p-1 text-[var(--stage-text-tertiary)] opacity-0 group-hover:opacity-100 hover:text-[var(--color-unusonic-error)]/60 transition-opacity focus:opacity-100"
        style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
        aria-label="Remove waypoint"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
