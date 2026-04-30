'use client';

/**
 * Pipeline-editor trigger config-form dispatcher + per-primitive forms.
 *
 * Extracted from pipeline-editor.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Each primitive (trigger_handoff, send_deposit_invoice, notify_role,
 * create_task, update_deal_field) has a hand-rolled config form here. The
 * registry is the source of truth for which primitives exist; the
 * TriggerConfigForm switch is the source of truth for how each one
 * collects input. If a new primitive is registered without a matching
 * branch, the picker hides it via CONFIGURABLE_TYPES (in ./triggers.tsx).
 */

import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import type { TriggerEntry } from '@/features/pipeline-settings/api/actions';
import type { PrimitiveMetadata } from '@/shared/lib/triggers/metadata';
import { TierBadge } from './shared';

export function TriggerConfigForm({
  primitive,
  initialConfig,
  onSave,
  onCancel,
  disabled,
}: {
  primitive: PrimitiveMetadata;
  initialConfig: Record<string, unknown>;
  onSave: (entry: TriggerEntry) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const buildEntry = (config: Record<string, unknown>): TriggerEntry => ({
    type: primitive.type,
    config,
  });

  return (
    <div className="p-2.5 rounded border border-[var(--stage-edge-strong)] bg-[var(--stage-surface-elevated)] space-y-2">
      <div className="flex items-center gap-2">
        <TierBadge tier={primitive.tier} />
        <span className="text-sm text-[var(--stage-text-primary)]">{primitive.label}</span>
      </div>
      <div className="stage-micro text-[var(--stage-text-tertiary)]">{primitive.description}</div>

      {primitive.type === 'trigger_handoff' && (
        <TriggerHandoffForm
          onSave={() => onSave(buildEntry({}))}
          onCancel={onCancel}
          disabled={disabled}
        />
      )}
      {primitive.type === 'send_deposit_invoice' && (
        <SendDepositInvoiceForm
          initial={initialConfig}
          onSave={(cfg) => onSave(buildEntry(cfg))}
          onCancel={onCancel}
          disabled={disabled}
        />
      )}
      {primitive.type === 'notify_role' && (
        <NotifyRoleForm
          initial={initialConfig}
          onSave={(cfg) => onSave(buildEntry(cfg))}
          onCancel={onCancel}
          disabled={disabled}
        />
      )}
      {primitive.type === 'create_task' && (
        <CreateTaskForm
          initial={initialConfig}
          onSave={(cfg) => onSave(buildEntry(cfg))}
          onCancel={onCancel}
          disabled={disabled}
        />
      )}
      {primitive.type === 'update_deal_field' && (
        <UpdateDealFieldForm
          initial={initialConfig}
          onSave={(cfg) => onSave(buildEntry(cfg))}
          onCancel={onCancel}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ── Per-primitive forms ──────────────────────────────────────────────────

function FormActions({
  onSave,
  onCancel,
  disabled,
  canSave,
}: {
  onSave: () => void;
  onCancel: () => void;
  disabled: boolean;
  canSave: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="px-2.5 py-1 stage-micro text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] rounded"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || !canSave}
        className="px-2.5 py-1 stage-micro rounded bg-[var(--stage-accent-muted)] text-[var(--stage-text-primary)] border border-[var(--stage-edge-strong)] hover:bg-[var(--stage-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Save
      </button>
    </div>
  );
}

function TriggerHandoffForm({
  onSave,
  onCancel,
  disabled,
}: {
  onSave: () => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <p className="stage-micro text-[var(--stage-text-secondary)]">
        No configuration — fires automatically when a deal enters this stage.
      </p>
      <FormActions onSave={onSave} onCancel={onCancel} disabled={disabled} canSave={true} />
    </>
  );
}

function SendDepositInvoiceForm({
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  initial: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const initialBasis = initial.amount_basis === 'balance' ? 'balance' : 'deposit';
  const [basis, setBasis] = useState<'deposit' | 'balance'>(initialBasis);

  return (
    <>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Amount basis</label>
        <div className="flex gap-2">
          {(['deposit', 'balance'] as const).map((opt) => (
            <label
              key={opt}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 stage-micro rounded border cursor-pointer',
                basis === opt
                  ? 'border-[var(--stage-edge-strong)] bg-[var(--stage-accent-muted)] text-[var(--stage-text-primary)]'
                  : 'border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)]',
              )}
            >
              <input
                type="radio"
                name="amount_basis"
                value={opt}
                checked={basis === opt}
                onChange={() => setBasis(opt)}
                className="sr-only"
              />
              {opt === 'deposit' ? 'Deposit amount' : 'Full balance'}
            </label>
          ))}
        </div>
      </div>
      <FormActions
        onSave={() => onSave({ amount_basis: basis })}
        onCancel={onCancel}
        disabled={disabled}
        canSave={true}
      />
    </>
  );
}

const ROLE_OPTIONS = ['owner', 'admin', 'crew_chief', 'deal_rep'] as const;

function NotifyRoleForm({
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  initial: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [roleSlug, setRoleSlug] = useState<string>(
    typeof initial.role_slug === 'string' ? initial.role_slug : ROLE_OPTIONS[0],
  );
  const [message, setMessage] = useState<string>(
    typeof initial.message === 'string' ? initial.message : '',
  );

  const canSave = roleSlug.trim().length > 0;

  return (
    <>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Role</label>
        <select
          value={roleSlug}
          onChange={(e) => setRoleSlug(e.target.value)}
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)]"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Message (optional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="e.g. Kick off pre-production for this deal."
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)] resize-y"
        />
      </div>
      <FormActions
        onSave={() => {
          const cfg: Record<string, unknown> = { role_slug: roleSlug.trim() };
          if (message.trim()) cfg.message = message.trim();
          onSave(cfg);
        }}
        onCancel={onCancel}
        disabled={disabled}
        canSave={canSave}
      />
    </>
  );
}

const ASSIGNEE_OPTIONS = ['owner', 'deal_rep', 'crew_chief'] as const;

function CreateTaskForm({
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  initial: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [title, setTitle] = useState<string>(
    typeof initial.title === 'string' ? initial.title : '',
  );
  const [assignee, setAssignee] = useState<(typeof ASSIGNEE_OPTIONS)[number]>(
    (ASSIGNEE_OPTIONS as readonly string[]).includes(initial.assignee_rule as string)
      ? (initial.assignee_rule as (typeof ASSIGNEE_OPTIONS)[number])
      : 'owner',
  );

  const canSave = title.trim().length > 0;

  return (
    <>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Task title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Confirm venue walk-through"
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)]"
        />
      </div>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Assign to</label>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value as (typeof ASSIGNEE_OPTIONS)[number])}
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)]"
        >
          {ASSIGNEE_OPTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
      <FormActions
        onSave={() => onSave({ title: title.trim(), assignee_rule: assignee })}
        onCancel={onCancel}
        disabled={disabled}
        canSave={canSave}
      />
    </>
  );
}

function UpdateDealFieldForm({
  initial,
  onSave,
  onCancel,
  disabled,
}: {
  initial: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [field, setField] = useState<string>(
    typeof initial.field === 'string' ? initial.field : '',
  );
  const [valueText, setValueText] = useState<string>(() => {
    if (initial.value === undefined) return '';
    if (typeof initial.value === 'string') return initial.value;
    try {
      return JSON.stringify(initial.value);
    } catch {
      return '';
    }
  });

  const canSave = field.trim().length > 0;

  const coerceValue = (raw: string): unknown => {
    const trimmed = raw.trim();
    if (trimmed === '') return '';
    // Try JSON first so admins can set numbers, booleans, null, arrays.
    // Fall back to raw string on parse failure.
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  };

  return (
    <>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">Field</label>
        <input
          type="text"
          value={field}
          onChange={(e) => setField(e.target.value)}
          placeholder="e.g. close_date, won_at"
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)] font-mono"
        />
      </div>
      <div className="space-y-1">
        <label className="stage-micro text-[var(--stage-text-secondary)]">
          Value (JSON literals parsed; otherwise stored as string)
        </label>
        <input
          type="text"
          value={valueText}
          onChange={(e) => setValueText(e.target.value)}
          placeholder='e.g. "closed-won", 100, true, null'
          className="w-full bg-[var(--stage-surface)] border border-[var(--stage-edge-subtle)] rounded px-2 py-1 text-sm text-[var(--stage-text-primary)] outline-none focus:border-[var(--stage-edge-strong)] font-mono"
        />
      </div>
      <FormActions
        onSave={() => onSave({ field: field.trim(), value: coerceValue(valueText) })}
        onCancel={onCancel}
        disabled={disabled}
        canSave={canSave}
      />
    </>
  );
}
