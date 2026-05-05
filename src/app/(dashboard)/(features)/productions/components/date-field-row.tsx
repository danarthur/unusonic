'use client';

import { useRef } from 'react';
import { Check, X as XIcon, Pencil } from 'lucide-react';

export type DateFieldRowProps = {
  inputType: 'date' | 'time';
  prefix?: string;
  display: string;
  isEditing: boolean;
  value: string;
  saving: boolean;
  className?: string;
  onChange: (v: string) => void;
  onOpen: () => void;
  onSave: () => void;
  onCancel: () => void;
};

export function DateFieldRow({
  inputType, prefix, display, isEditing, value, saving, className = '',
  onChange, onOpen, onSave, onCancel,
}: DateFieldRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when focus leaves this row entirely (e.g. clicking outside)
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    onCancel();
  };

  return (
    // group is on the outer div so hover applies to the whole row
    <div
      ref={containerRef}
      className="group flex items-center gap-1.5 min-w-0"
      onBlur={isEditing ? handleBlur : undefined}
    >
      {prefix && (
        <span className="stage-label text-[var(--stage-text-tertiary)] shrink-0 leading-none mt-px select-none">
          {prefix}
        </span>
      )}
      {isEditing ? (
        <>
          <input
            type={inputType}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onSave(); }
              if (e.key === 'Escape') onCancel();
            }}
            autoFocus
            className="min-w-0 flex-1 bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.15)] rounded-md px-1.5 py-0.5 text-[var(--stage-text-primary)] text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          />
          {/* onMouseDown prevent keeps input focused so the click event fires */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onSave}
            disabled={saving}
            aria-label="Save"
            className="shrink-0 p-0.5 rounded text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45 transition-colors"
          >
            <Check size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
            aria-label="Cancel"
            className="shrink-0 p-0.5 rounded text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors"
          >
            <XIcon size={13} />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className={`flex items-center gap-1.5 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded ${className}`}
        >
          <span className="stage-readout group-hover:text-[var(--stage-accent)] transition-colors truncate">
            {display}
          </span>
          <Pencil
            size={11}
            className="shrink-0 text-transparent group-hover:text-[var(--stage-text-tertiary)] transition-colors"
            aria-hidden
          />
        </button>
      )}
    </div>
  );
}
