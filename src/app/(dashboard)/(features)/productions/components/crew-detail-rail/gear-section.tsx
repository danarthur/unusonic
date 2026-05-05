'use client';

/**
 * GearSection — "what's this person bringing to this show?"
 *
 * Extracted from crew-detail-rail.tsx (Phase 0.5-style mechanical split).
 *
 * Owns three sub-blocks:
 *   1. Supplied gear list (items already linked to this event).
 *   2. Bring-from-kit picker (multi-select from the entity's owned kit).
 *   3. Kit-compliance gaps (read-only details for missing role kit items).
 *
 * The component is a presentational shell — all data + handlers come in via
 * props. State that's local to the picker (open/selection) is owned by the
 * orchestrator so the rail can reset it on row-change.
 */

import { Check, Loader2, Package, Plus, Wrench } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { DealCrewRow } from '../../actions/deal-crew';
import type { EventGearItem } from '../../actions/event-gear-items';
import type { CrewOwnedKit } from '../../actions/crew-hub';
import type { KitComplianceResult } from '@/features/talent-management/api/kit-template-actions';

export function GearSection({
  row,
  eventId,
  name,
  loadingGear,
  suppliedGear,
  ownedKit,
  kitCompliance,
  kitPickerOpen,
  setKitPickerOpen,
  selectedKitIds,
  setSelectedKitIds,
  toggleKitSelection,
  bringingFromKit,
  onBringFromKit,
}: {
  row: DealCrewRow;
  eventId: string | null;
  name: string;
  loadingGear: boolean;
  suppliedGear: EventGearItem[];
  ownedKit: CrewOwnedKit[];
  kitCompliance: KitComplianceResult | null;
  kitPickerOpen: boolean;
  setKitPickerOpen: Dispatch<SetStateAction<boolean>>;
  selectedKitIds: Set<string>;
  setSelectedKitIds: Dispatch<SetStateAction<Set<string>>>;
  toggleKitSelection: (equipmentId: string) => void;
  bringingFromKit: boolean;
  onBringFromKit: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="stage-label">Gear</h3>
        {kitCompliance && kitCompliance.total > 0 && (
          <span
            className="stage-badge-text tracking-tight tabular-nums"
            style={{
              color:
                kitCompliance.matched === kitCompliance.total
                  ? 'var(--color-unusonic-success)'
                  : 'var(--stage-text-tertiary)',
            }}
            title={
              kitCompliance.matched === kitCompliance.total
                ? 'Role kit complete'
                : `Missing: ${kitCompliance.missing.map((i) => i.name).join(', ')}`
            }
          >
            {kitCompliance.matched}/{kitCompliance.total} kit items ready
          </span>
        )}
      </div>

      {loadingGear ? (
        <div className="text-sm text-[var(--stage-text-tertiary)] flex items-center gap-2">
          <Loader2 className="size-3 animate-spin" />
          Loading gear...
        </div>
      ) : (
        <>
          {/* Bringing to this show */}
          {eventId && suppliedGear.length > 0 && (
            <ul className="flex flex-col gap-1">
              {suppliedGear.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 py-1 text-sm"
                >
                  <Package className="size-3 shrink-0 text-[var(--stage-text-tertiary)]" />
                  <span className="text-[var(--stage-text-primary)] min-w-0 truncate">
                    {item.name}
                    {item.quantity > 1 && (
                      <span className="text-[var(--stage-text-tertiary)] tabular-nums">
                        {' '}× {item.quantity}
                      </span>
                    )}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    {item.kit_fee != null && (
                      <span className="stage-badge-text tabular-nums text-[var(--stage-text-tertiary)]">
                        ${item.kit_fee.toLocaleString()}
                      </span>
                    )}
                    <span
                      className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md"
                      style={{
                        background: 'oklch(1 0 0 / 0.04)',
                        color: 'var(--stage-text-secondary)',
                      }}
                    >
                      {item.status.replace('_', ' ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* gear_notes freetext — from the row */}
          {row.gear_notes && (
            <p className="text-label leading-relaxed text-[var(--stage-text-tertiary)]">
              <Wrench className="size-2.5 inline mr-1" />
              {row.gear_notes}
            </p>
          )}

          {/* Empty state */}
          {eventId && suppliedGear.length === 0 && !row.gear_notes && (
            <p className="text-sm leading-relaxed text-[var(--stage-text-tertiary)]">
              Not bringing any gear to this show yet.
            </p>
          )}

          {/* Bring from kit — picker */}
          {eventId && ownedKit.length > 0 && (
            <div className="mt-1">
              {!kitPickerOpen ? (
                <button
                  type="button"
                  onClick={() => setKitPickerOpen(true)}
                  className="stage-btn stage-btn-ghost flex items-center gap-1.5 px-2.5 py-1 text-sm"
                >
                  <Plus className="size-3" />
                  Bring from kit ({ownedKit.filter((k) => !k.alreadyOnEvent).length} available)
                </button>
              ) : (
                <div
                  className="flex flex-col gap-2 p-3 rounded-lg"
                  style={{
                    background: 'oklch(1 0 0 / 0.03)',
                    border: '1px solid oklch(1 0 0 / 0.06)',
                  }}
                >
                  <span className="stage-label">Choose from {name}&apos;s kit</span>
                  <ul className="flex flex-col gap-1">
                    {ownedKit.map((kit) => {
                      const selected = selectedKitIds.has(kit.equipmentId);
                      const disabled = kit.alreadyOnEvent;
                      return (
                        <li key={kit.equipmentId}>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => !disabled && toggleKitSelection(kit.equipmentId)}
                            className="w-full flex items-center gap-2 py-1 text-left text-sm transition-colors focus:outline-none disabled:opacity-45 disabled:cursor-not-allowed"
                            style={{
                              color: selected
                                ? 'var(--stage-text-primary)'
                                : 'var(--stage-text-secondary)',
                            }}
                          >
                            <span
                              className="size-4 rounded shrink-0 flex items-center justify-center"
                              style={{
                                background: selected
                                  ? 'oklch(0.85 0 0)'
                                  : 'oklch(1 0 0 / 0.04)',
                                border: '1px solid oklch(1 0 0 / 0.12)',
                              }}
                            >
                              {selected && <Check className="size-3 text-[oklch(0.15_0_0)]" />}
                            </span>
                            <span className="min-w-0 truncate">
                              {kit.name}
                              {kit.quantity > 1 && (
                                <span className="text-[var(--stage-text-tertiary)] tabular-nums">
                                  {' '}× {kit.quantity}
                                </span>
                              )}
                            </span>
                            <span
                              className="ml-auto stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]"
                              title={kit.category}
                            >
                              {disabled ? 'Already on show' : kit.category}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex justify-end gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setKitPickerOpen(false);
                        setSelectedKitIds(new Set());
                      }}
                      className="stage-btn stage-btn-ghost text-sm px-2.5 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={onBringFromKit}
                      disabled={selectedKitIds.size === 0 || bringingFromKit}
                      className="stage-btn stage-btn-primary flex items-center gap-1.5 px-2.5 py-1 text-sm disabled:opacity-45 disabled:pointer-events-none"
                    >
                      {bringingFromKit ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Package className="size-3" />
                      )}
                      Bring {selectedKitIds.size > 0 ? `${selectedKitIds.size} item${selectedKitIds.size > 1 ? 's' : ''}` : 'selected'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Kit compliance gaps (read-only display) */}
          {kitCompliance &&
            kitCompliance.missing.length > 0 &&
            kitCompliance.missing.length < kitCompliance.total && (
              <details className="mt-1">
                <summary className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)] cursor-pointer">
                  {kitCompliance.missing.length} kit item{kitCompliance.missing.length > 1 ? 's' : ''} missing for this role
                </summary>
                <ul className="flex flex-col gap-0.5 mt-1 pl-4">
                  {kitCompliance.missing.map((miss, i) => (
                    <li key={`${miss.name}-${i}`} className="text-label leading-relaxed text-[var(--stage-text-secondary)]">
                      {miss.name}
                      {miss.quantity > 1 && (
                        <span className="text-[var(--stage-text-tertiary)] tabular-nums">
                          {' '}× {miss.quantity}
                        </span>
                      )}
                      {miss.optional && (
                        <span className="text-[var(--stage-text-tertiary)]"> (optional)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
        </>
      )}
    </section>
  );
}
