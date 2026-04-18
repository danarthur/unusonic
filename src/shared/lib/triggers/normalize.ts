/**
 * A single stage-trigger entry as stored in `ops.pipeline_stages.triggers`.
 *
 * Lives in Shared so both the Features layer (pipeline-settings CRUD) and App
 * layer (Prism confirmation modal) can reference the same shape without an
 * upward import. Re-exported under the historical name `TriggerEntry` from
 * `src/features/pipeline-settings/api/actions.ts` for backward compat.
 */
export type TriggerEntry = { type: string; config: Record<string, unknown> };

/**
 * Defensive coercer for `ops.pipeline_stages.triggers` (jsonb column).
 *
 * Shared by the settings page (edit UI) and any consumer that needs to read
 * configured triggers (e.g. the Prism confirmation modal preview). A malformed
 * row shouldn't brick callers — we filter out entries that don't have the
 * minimal `{ type: string }` shape and coerce missing/invalid `config` to `{}`.
 *
 * Validation against each primitive's `configSchema` happens on the write path
 * (see `updatePipelineStageTriggers`), so reads can trust that live rows are
 * structurally correct — this coercer exists for legacy / out-of-band rows.
 */
export function normalizeTriggers(raw: unknown): TriggerEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): TriggerEntry[] => {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { type?: unknown }).type === 'string'
    ) {
      const cfg = (entry as { config?: unknown }).config;
      return [
        {
          type: (entry as { type: string }).type,
          config: (cfg && typeof cfg === 'object' ? cfg : {}) as Record<string, unknown>,
        },
      ];
    }
    return [];
  });
}
