'use client';

/**
 * Small UI atoms used by the crew-detail-rail's Live grid + pay editor.
 *
 * Extracted from crew-detail-rail.tsx (Phase 0.5-style mechanical split).
 *
 * Owns:
 *   - CyclableTile — tap-to-cycle status tile used in the Live (dispatcher)
 *     section. Mirrors the pattern from the list row's dispatch button.
 *   - PayField — labeled $ input for the expandable pay grid.
 */

// Cyclable status tile for the Show-day grid. Tap to advance through the
// cycle. Mirrors the pattern from the list row's dispatch button.
export function CyclableTile({
  label,
  value,
  onClick,
  hint,
}: {
  label: string;
  value: string;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[oklch(1_0_0/0.05)] active:bg-[oklch(1_0_0/0.07)] focus:outline-none"
      style={{
        background: 'oklch(1 0 0 / 0.03)',
        border: '1px solid oklch(1 0 0 / 0.06)',
      }}
      title={hint}
    >
      <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
        {label}
      </span>
      <span className="text-sm tabular-nums tracking-tight text-[var(--stage-text-primary)]">
        {value}
      </span>
    </button>
  );
}

// Small currency input for the expandable pay grid.
export function PayField({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">{label}</label>
      <div className="flex items-center gap-1">
        <span className="stage-badge-text text-[var(--stage-text-tertiary)]">$</span>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="0"
          className="w-full text-sm tabular-nums px-2 py-1 outline-none focus-visible:border-[oklch(1_0_0/0.2)]"
          style={{
            background: 'var(--ctx-well)',
            border: '1px solid oklch(1 0 0 / 0.06)',
            borderRadius: 'var(--stage-radius-input, 6px)',
            color: 'var(--stage-text-primary)',
          }}
        />
      </div>
    </div>
  );
}
