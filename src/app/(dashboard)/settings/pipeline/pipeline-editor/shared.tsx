'use client';

/**
 * Shared types + small render helpers for the pipeline-editor cluster.
 *
 * Extracted from pipeline-editor.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - EditorStage type — the pipeline-editor-local view of a stage row.
 *   - StagePatch type alias — the patch shape for updatePipelineStage,
 *     re-exported so siblings don't repeat the Parameters<...> dance.
 *   - TierBadge — outbound/internal tier pill used in TriggerRow +
 *     TriggerPicker + TriggerConfigForm.
 *   - renderConfigSummary — produces the readonly one-liner rendered on each
 *     trigger row when not in edit mode.
 */

import { cn } from '@/shared/lib/utils';
import type { TriggerEntry, updatePipelineStage } from '@/features/pipeline-settings/api/actions';
import type { TriggerTier } from '@/shared/lib/triggers/metadata';

export type EditorStage = {
  id: string;
  slug: string;
  label: string;
  kind: 'working' | 'won' | 'lost';
  sort_order: number;
  requires_confirmation: boolean;
  opens_handoff_wizard: boolean;
  hide_from_portal: boolean;
  tags: string[];
  color_token: string | null;
  rotting_days: number | null;
  triggers: TriggerEntry[];
};

/** Patch shape for updatePipelineStage — re-exported for sibling consumers. */
export type StagePatch = Parameters<typeof updatePipelineStage>[1];

export function TierBadge({ tier }: { tier: TriggerTier }) {
  const isOutbound = tier === 'outbound';
  return (
    <span
      className={cn(
        'stage-micro px-1.5 py-0.5 rounded border shrink-0',
        isOutbound
          ? 'border-[var(--color-unusonic-warning,oklch(0.82_0.14_82))]/50 text-[var(--color-unusonic-warning,oklch(0.82_0.14_82))]'
          : 'border-[var(--stage-edge-subtle)] text-[var(--stage-text-tertiary)]',
      )}
      title={isOutbound ? 'Touches external parties — user-visible' : 'In-app only — silent with 15s undo'}
    >
      {isOutbound ? 'Outbound' : 'Internal'}
    </span>
  );
}

// ── Concise readonly summary of a stored config ──────────────────────────

export function renderConfigSummary(entry: TriggerEntry): string {
  const cfg = entry.config;
  switch (entry.type) {
    case 'trigger_handoff':
      return 'Fires when this stage is entered';
    case 'send_deposit_invoice': {
      const basis = (cfg?.amount_basis as string | undefined) ?? 'deposit';
      return basis === 'balance' ? 'Full balance invoice' : 'Deposit invoice';
    }
    case 'notify_role': {
      const role = (cfg?.role_slug as string | undefined) ?? '(no role)';
      const message = cfg?.message as string | undefined;
      return message ? `Notify ${role} — "${message}"` : `Notify ${role}`;
    }
    case 'create_task': {
      const title = (cfg?.title as string | undefined) ?? '(untitled)';
      const assignee = (cfg?.assignee_rule as string | undefined) ?? 'owner';
      return `Task: "${title}" → ${assignee}`;
    }
    case 'update_deal_field': {
      const field = (cfg?.field as string | undefined) ?? '(field)';
      const value = cfg?.value;
      const shown =
        value === undefined || value === null
          ? 'null'
          : typeof value === 'string'
            ? `"${value}"`
            : JSON.stringify(value);
      return `Set ${field} = ${shown}`;
    }
    default:
      return JSON.stringify(cfg ?? {});
  }
}
