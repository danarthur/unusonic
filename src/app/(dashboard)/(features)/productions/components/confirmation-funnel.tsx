// =============================================================================
// ConfirmationFunnel — segmented bar + counts (pure display, no state)
// =============================================================================

export function ConfirmationFunnel({
  confirmed,
  pending,
  declined,
  total,
}: {
  confirmed: number;
  pending: number;
  declined: number;
  total: number;
}) {
  if (total === 0) return null;

  const pctConfirmed = Math.round((confirmed / total) * 100);
  const pctPending = Math.round((pending / total) * 100);
  const pctDeclined = Math.round((declined / total) * 100);

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
      </div>

      {/* Counts text */}
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
      </p>
    </div>
  );
}
