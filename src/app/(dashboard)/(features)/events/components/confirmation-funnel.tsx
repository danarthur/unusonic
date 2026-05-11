// =============================================================================
// ConfirmationFunnel — segmented bar + counts (pure display, no state)
// =============================================================================
//
// Four states are tracked so the bar always sums to total:
//   confirmed  → green
//   pending    → amber
//   declined   → red
//   unassigned → muted neutral (no entity yet — slot is open)
//
// Without the unassigned segment the labels could disagree with the
// total ("1 confirmed / 1 pending" while total = 3 because 1 hole).
// With it, the math always reconciles: confirmed + pending + declined
// + unassigned === total.

export function ConfirmationFunnel({
  confirmed,
  pending,
  declined,
  unassigned,
  total,
}: {
  confirmed: number;
  pending: number;
  declined: number;
  unassigned: number;
  total: number;
}) {
  if (total === 0) return null;

  const pctConfirmed = Math.round((confirmed / total) * 100);
  const pctPending = Math.round((pending / total) * 100);
  const pctDeclined = Math.round((declined / total) * 100);
  const pctUnassigned = Math.round((unassigned / total) * 100);

  return (
    <div className="mb-4 pb-3 border-b border-[oklch(1_0_0_/_0.04)]">
      {/* Segmented bar */}
      <div
        className="flex h-1.5 overflow-hidden mb-2"
        style={{
          backgroundColor: 'oklch(1 0 0 / 0.06)',
          borderRadius: 'var(--stage-radius-input, 6px)',
        }}
      >
        {pctConfirmed > 0 && (
          <div
            className="h-full transition-[width] duration-100"
            style={{
              width: `${pctConfirmed}%`,
              backgroundColor: 'var(--color-unusonic-success)',
            }}
          />
        )}
        {pctPending > 0 && (
          <div
            className="h-full transition-[width] duration-100"
            style={{
              width: `${pctPending}%`,
              backgroundColor: 'var(--color-unusonic-warning)',
            }}
          />
        )}
        {pctDeclined > 0 && (
          <div
            className="h-full transition-[width] duration-100"
            style={{
              width: `${pctDeclined}%`,
              backgroundColor: 'var(--color-unusonic-error)',
            }}
          />
        )}
        {pctUnassigned > 0 && (
          <div
            className="h-full transition-[width] duration-100"
            style={{
              width: `${pctUnassigned}%`,
              // Muted neutral — visibly distinct from the empty track
              // (oklch(1 0 0 / 0.06)) but not status-coloured, since
              // "unassigned" is a planning state, not a problem state.
              backgroundColor: 'oklch(1 0 0 / 0.18)',
            }}
          />
        )}
      </div>

      {/* Counts text — always shows confirmed; the others only when > 0
          so a fully-staffed crew reads "3 confirmed" without zero-noise. */}
      <p className="stage-readout-sm text-[var(--stage-text-secondary)]">
        <span style={{ color: 'var(--color-unusonic-success)' }}>{confirmed} confirmed</span>
        {pending > 0 && (
          <>
            <span className="text-[var(--stage-text-tertiary)]"> / </span>
            <span style={{ color: 'var(--color-unusonic-warning)' }}>{pending} pending</span>
          </>
        )}
        {declined > 0 && (
          <>
            <span className="text-[var(--stage-text-tertiary)]"> / </span>
            <span style={{ color: 'var(--color-unusonic-error)' }}>{declined} declined</span>
          </>
        )}
        {unassigned > 0 && (
          <>
            <span className="text-[var(--stage-text-tertiary)]"> / </span>
            <span className="text-[var(--stage-text-tertiary)]">{unassigned} unassigned</span>
          </>
        )}
      </p>
    </div>
  );
}
