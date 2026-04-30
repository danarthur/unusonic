'use client';

/**
 * Pipeline-editor triggers cluster.
 *
 * Extracted from pipeline-editor.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - TriggersSection — collapsible "Triggers (n)" panel under each stage row.
 *   - TriggerRow — single configured trigger entry (read or edit mode).
 *   - TriggerPicker — primitive picker UI for adding a new trigger.
 *   - CONFIGURABLE_TYPES — gate that hides primitives without a registered
 *     config form so the picker never offers a primitive that can't be
 *     configured.
 *
 * Reaches into ./trigger-forms.tsx for the actual config-form dispatch
 * (TriggerConfigForm). TierBadge + renderConfigSummary are imported from
 * ./shared.tsx so trigger-forms can reuse them without circular imports.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { TriggerEntry } from '@/features/pipeline-settings/api/actions';
import { listAllPrimitives, getPrimitive } from '@/shared/lib/triggers/metadata';
import type { PrimitiveMetadata } from '@/shared/lib/triggers/metadata';
import type { EditorStage } from './shared';
import { TierBadge, renderConfigSummary } from './shared';
import { TriggerConfigForm } from './trigger-forms';

const CONFIGURABLE_TYPES = new Set<string>([
  'trigger_handoff',
  'send_deposit_invoice',
  'notify_role',
  'create_task',
  'update_deal_field',
]);

export function TriggersSection({
  stage,
  open,
  onToggle,
  onUpdateTriggers,
  disabled,
}: {
  stage: EditorStage;
  open: boolean;
  onToggle: () => void;
  onUpdateTriggers: (next: TriggerEntry[]) => void;
  disabled: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const triggers = stage.triggers;
  const count = triggers.length;

  const handleRemove = (index: number) => {
    const entry = triggers[index];
    const primitive = entry ? getPrimitive(entry.type) : undefined;
    const needsConfirm = primitive?.tier === 'outbound';
    if (
      needsConfirm &&
      !confirm(
        `Remove outbound trigger "${primitive?.label ?? entry?.type}"? This trigger touches external parties when the stage fires.`,
      )
    ) {
      return;
    }
    onUpdateTriggers(triggers.filter((_, i) => i !== index));
  };

  const handleReplace = (index: number, next: TriggerEntry) => {
    onUpdateTriggers(triggers.map((t, i) => (i === index ? next : t)));
    setEditingIndex(null);
  };

  const handleAdd = (entry: TriggerEntry) => {
    onUpdateTriggers([...triggers, entry]);
    setAdding(false);
  };

  return (
    <div className="border-t border-[var(--stage-edge-subtle)]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--stage-surface-elevated)] transition-colors"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            'w-3.5 h-3.5 text-[var(--stage-text-tertiary)] transition-transform',
            open && 'rotate-90',
          )}
          aria-hidden
        />
        <Zap className="w-3.5 h-3.5 text-[var(--stage-text-tertiary)]" aria-hidden />
        <span className="stage-micro text-[var(--stage-text-secondary)]">
          Triggers ({count})
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          {triggers.length === 0 && !adding && (
            <p className="stage-micro text-[var(--stage-text-tertiary)] py-1">
              No triggers on this stage. Add one to automate work when a deal lands here.
            </p>
          )}

          {triggers.map((entry, index) => (
            <TriggerRow
              key={`${entry.type}-${index}`}
              entry={entry}
              editing={editingIndex === index}
              onStartEdit={() => setEditingIndex(index)}
              onCancelEdit={() => setEditingIndex(null)}
              onSave={(next) => handleReplace(index, next)}
              onRemove={() => handleRemove(index)}
              disabled={disabled}
            />
          ))}

          {adding ? (
            <TriggerPicker
              stageKind={stage.kind}
              onSave={handleAdd}
              onCancel={() => setAdding(false)}
              disabled={disabled}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={disabled}
              className="mt-1 flex items-center gap-1.5 px-2.5 py-1.5 stage-micro text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] rounded border border-dashed border-[var(--stage-edge-subtle)] hover:border-[var(--stage-edge-strong)] transition-colors"
            >
              <Plus className="w-3 h-3" aria-hidden />
              Add trigger
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Trigger row (one entry) ───────────────────────────────────────────────

function TriggerRow({
  entry,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
  disabled,
}: {
  entry: TriggerEntry;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (next: TriggerEntry) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const primitive = getPrimitive(entry.type);

  if (!primitive) {
    // Stored trigger references a primitive that no longer exists in the
    // registry. Surface it so admins can clean up rather than silently
    // dropping.
    return (
      <div className="flex items-center gap-2 p-2 rounded border border-[var(--color-unusonic-error)]/40 bg-[var(--color-unusonic-error)]/5">
        <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-unusonic-error)] shrink-0" aria-hidden />
        <span className="stage-micro text-[var(--color-unusonic-error)] flex-1">
          Unknown trigger type: {entry.type}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)]"
          aria-label="Remove unknown trigger"
        >
          <Trash2 className="w-3 h-3" aria-hidden />
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <TriggerConfigForm
        primitive={primitive}
        initialConfig={entry.config}
        onSave={onSave}
        onCancel={onCancelEdit}
        disabled={disabled}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded border',
        primitive.tier === 'outbound'
          ? 'border-[var(--color-unusonic-warning,oklch(0.82_0.14_82))]/40 bg-[var(--color-unusonic-warning,oklch(0.82_0.14_82))]/5'
          : 'border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]',
      )}
    >
      <TierBadge tier={primitive.tier} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--stage-text-primary)] truncate">
          {primitive.label}
        </div>
        <div className="stage-micro text-[var(--stage-text-tertiary)] truncate">
          {renderConfigSummary(entry)}
        </div>
      </div>
      <button
        type="button"
        onClick={onStartEdit}
        disabled={disabled}
        className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]"
        aria-label={`Edit ${primitive.label}`}
      >
        <Pencil className="w-3 h-3" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)]"
        aria-label={`Remove ${primitive.label}`}
      >
        <Trash2 className="w-3 h-3" aria-hidden />
      </button>
    </div>
  );
}

// ── Tier badge ────────────────────────────────────────────────────────────

function TriggerPicker({
  stageKind,
  onSave,
  onCancel,
  disabled,
}: {
  stageKind: EditorStage['kind'];
  onSave: (entry: TriggerEntry) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Terminal stages can technically take any primitive; we still show all 5.
  // Gated to CONFIGURABLE_TYPES so an unregistered-in-UI primitive doesn't
  // appear with no form. stageKind reserved for future per-kind filtering.
  void stageKind;

  const grouped = useMemo(() => {
    const all = listAllPrimitives().filter((p) => CONFIGURABLE_TYPES.has(p.type));
    return {
      outbound: all.filter((p) => p.tier === 'outbound'),
      internal: all.filter((p) => p.tier === 'internal'),
    };
  }, []);

  if (selectedType) {
    const primitive = getPrimitive(selectedType);
    if (!primitive) return null;
    return (
      <TriggerConfigForm
        primitive={primitive}
        initialConfig={{}}
        onSave={onSave}
        onCancel={onCancel}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="p-2.5 rounded border border-dashed border-[var(--stage-edge-strong)] bg-[var(--stage-surface-elevated)] space-y-2">
      <div className="flex items-center justify-between">
        <span className="stage-micro text-[var(--stage-text-secondary)]">Choose a trigger</span>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]"
          aria-label="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {(['outbound', 'internal'] as const).map((tier) => {
        const list = grouped[tier];
        if (list.length === 0) return null;
        return (
          <div key={tier} className="space-y-1">
            <div className="stage-micro text-[var(--stage-text-tertiary)] uppercase tracking-wide">
              {tier === 'outbound' ? 'Outbound — user-visible' : 'Internal — silent'}
            </div>
            <div className="grid gap-1">
              {list.map((primitive) => (
                <button
                  key={primitive.type}
                  type="button"
                  onClick={() => setSelectedType(primitive.type)}
                  disabled={disabled}
                  title={primitive.description}
                  className="flex items-start gap-2 p-2 rounded text-left hover:bg-[var(--stage-surface)] transition-colors"
                >
                  <TierBadge tier={primitive.tier} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-[var(--stage-text-primary)]">{primitive.label}</div>
                    <div className="stage-micro text-[var(--stage-text-tertiary)] line-clamp-2">
                      {primitive.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Config form: per-primitive hardcoded inputs ──────────────────────────

