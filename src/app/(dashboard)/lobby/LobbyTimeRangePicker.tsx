'use client';

/**
 * LobbyTimeRangePicker — Phase 2.4.
 *
 * Small button-style dropdown paired with LobbyTimeRangeContext. Portal-rendered
 * per CLAUDE.md rule 11 (dropdowns in backdrop-filter / modal stacking contexts)
 * and tagged `data-surface="dropdown"` so the surface system knows this is a
 * raised control regardless of parent.
 *
 * Split out of LobbyTimeRangeContext so the provider module can stay small.
 *
 * @module app/(dashboard)/lobby/LobbyTimeRangePicker
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Calendar } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  RANGE_LABELS,
  useLobbyTimeRange,
  type LobbyTimeRangeKind,
} from './LobbyTimeRangeContext';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

type PresetKind = Exclude<LobbyTimeRangeKind, 'custom'>;

const PRESET_ORDER: PresetKind[] = [
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'ytd',
  'last_30d',
  'last_90d',
];

// ── Subcomponents ────────────────────────────────────────────────────────────

function PresetRow({
  kind,
  selected,
  onPick,
}: {
  kind: PresetKind;
  selected: boolean;
  onPick: (k: PresetKind) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onPick(kind)}
      className={cn(
        'flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
        selected
          ? 'bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-primary)]'
          : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)]',
      )}
    >
      <span>{RANGE_LABELS[kind]}</span>
      {selected && <span aria-hidden className="text-[var(--stage-text-secondary)]">·</span>}
    </button>
  );
}

function CustomRangeForm({
  initialStart,
  initialEnd,
  onApply,
}: {
  initialStart: string;
  initialEnd: string;
  onApply: (start: string, end: string) => void;
}) {
  const [start, setStart] = React.useState(initialStart);
  const [end, setEnd] = React.useState(initialEnd);
  const isValid = YMD_RE.test(start) && YMD_RE.test(end) && start <= end;

  return (
    <div className="flex flex-col gap-1.5 px-2 pb-1">
      <label className="flex items-center gap-2 text-xs text-[var(--stage-text-secondary)]">
        <span className="w-8 shrink-0">From</span>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className={cn(
            'flex-1 h-7 px-2 rounded-md text-xs tabular-nums',
            'bg-[var(--ctx-well,var(--stage-surface))] border border-[var(--stage-edge-subtle)]',
            'text-[var(--stage-text-primary)]',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]/50',
          )}
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-[var(--stage-text-secondary)]">
        <span className="w-8 shrink-0">To</span>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className={cn(
            'flex-1 h-7 px-2 rounded-md text-xs tabular-nums',
            'bg-[var(--ctx-well,var(--stage-surface))] border border-[var(--stage-edge-subtle)]',
            'text-[var(--stage-text-primary)]',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]/50',
          )}
        />
      </label>
      <button
        type="button"
        onClick={() => isValid && onApply(start, end)}
        disabled={!isValid}
        className={cn(
          'mt-1 h-7 rounded-md text-xs font-medium transition-colors',
          'bg-[var(--stage-accent)] text-[oklch(0.10_0_0)]',
          'hover:opacity-90',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        Apply range
      </button>
    </div>
  );
}

function useDropdownPosition(
  open: boolean,
  buttonRef: React.RefObject<HTMLButtonElement | null>,
) {
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!open || !buttonRef.current || typeof window === 'undefined') {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverHeight = 360;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < popoverHeight ? Math.max(8, rect.top - popoverHeight - 6) : rect.bottom + 6;
    setPosition({ top, left: rect.left });
  }, [open, buttonRef]);

  return position;
}

function useOutsideClick(
  open: boolean,
  refs: Array<React.RefObject<HTMLElement | null>>,
  onClose: () => void,
) {
  React.useEffect(() => {
    if (!open) return;
    const onPointer = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (refs.some((r) => r.current?.contains(t))) return;
      onClose();
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open, refs, onClose]);
}

// ── Picker ───────────────────────────────────────────────────────────────────

export function LobbyTimeRangePicker({ className }: { className?: string }) {
  const { range, setRange } = useLobbyTimeRange();
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const position = useDropdownPosition(open, buttonRef);
  useOutsideClick(open, [buttonRef, popoverRef], () => setOpen(false));

  const label = range.kind === 'custom'
    ? `${range.start} – ${range.end}`
    : RANGE_LABELS[range.kind];

  const handlePreset = (kind: PresetKind) => {
    setRange({ kind });
    setOpen(false);
  };

  const handleCustom = (start: string, end: string) => {
    setRange({ kind: 'custom', start, end });
    setOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-2 h-8 px-2.5 rounded-[var(--stage-radius-input,10px)]',
          'text-xs font-medium tabular-nums',
          'border border-[var(--stage-edge-subtle)]',
          'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)]',
          'hover:text-[var(--stage-text-primary)] transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
          open && 'text-[var(--stage-text-primary)]',
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Time range: ${label}`}
      >
        <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
        <span>{label}</span>
        <ChevronDown className="w-3 h-3 opacity-60" strokeWidth={1.75} aria-hidden />
      </button>

      {open && position && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            data-surface="dropdown"
            className={cn(
              'fixed z-[200] w-[240px] rounded-[var(--stage-radius-panel,12px)]',
              'border border-[var(--stage-edge-subtle)]',
              'bg-[var(--stage-surface-raised)] stage-panel-nested p-2',
              'shadow-[0_8px_24px_oklch(0_0_0/0.24)]',
            )}
            style={{ top: position.top, left: position.left }}
            role="dialog"
            aria-label="Pick time range"
          >
            <p className="stage-label text-[var(--stage-text-tertiary)] px-2 py-1">
              Preset
            </p>
            <div role="listbox" className="flex flex-col gap-0.5">
              {PRESET_ORDER.map((kind) => (
                <PresetRow
                  key={kind}
                  kind={kind}
                  selected={range.kind === kind}
                  onPick={handlePreset}
                />
              ))}
            </div>

            <div className="my-2 border-t border-[var(--stage-edge-subtle)]" aria-hidden />

            <p className="stage-label text-[var(--stage-text-tertiary)] px-2 py-1">
              Custom range
            </p>
            <CustomRangeForm
              initialStart={range.kind === 'custom' ? range.start : ''}
              initialEnd={range.kind === 'custom' ? range.end : ''}
              onApply={handleCustom}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
