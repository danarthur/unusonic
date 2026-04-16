'use client';

import { Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface CrewMember {
  dealCrewId: string;
  entityId: string | null;
  name: string;
  role: string | null;
  confirmed: boolean;
  email: string | null;
}

interface CrewPreviewProps {
  crew: CrewMember[];
  dealTitle?: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function CrewPreview({
  crew,
  dealTitle,
  selectedIds,
  onSelectionChange,
}: CrewPreviewProps) {
  const allSelected = crew.length > 0 && selectedIds.length === crew.length;

  function toggleAll() {
    onSelectionChange(allSelected ? [] : crew.map((c) => c.dealCrewId));
  }

  function toggle(id: string) {
    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {dealTitle && (
        <p className="stage-label text-[var(--stage-text-tertiary)]">
          Crew for {dealTitle}
        </p>
      )}

      {/* Select all header */}
      <button
        type="button"
        onClick={toggleAll}
        className="flex items-center gap-2 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
      >
        <span
          className={cn(
            'w-4 h-4 rounded-sm border flex items-center justify-center transition-colors',
            allSelected
              ? 'bg-[var(--stage-accent)] border-[var(--stage-accent)]'
              : 'border-[var(--stage-edge-subtle)]',
          )}
        >
          {allSelected && <Check className="w-3 h-3 text-[var(--stage-text-on-accent)]" strokeWidth={2} />}
        </span>
        Select all ({crew.length})
      </button>

      {/* Crew rows */}
      <div className="flex flex-col gap-1">
        {crew.map((member) => {
          const selected = selectedIds.includes(member.dealCrewId);
          return (
            <button
              key={member.dealCrewId}
              type="button"
              onClick={() => toggle(member.dealCrewId)}
              className="flex items-center gap-3 py-2 px-2 rounded-sm stage-hover transition-colors text-left"
            >
              <span
                className={cn(
                  'w-4 h-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors',
                  selected
                    ? 'bg-[var(--stage-accent)] border-[var(--stage-accent)]'
                    : 'border-[var(--stage-edge-subtle)]',
                )}
              >
                {selected && <Check className="w-3 h-3 text-[var(--stage-text-on-accent)]" strokeWidth={2} />}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--stage-text-primary)] truncate">
                  {member.name}
                </p>
                <p className="text-[10px] text-[var(--stage-text-tertiary)] truncate">
                  {[member.role, member.email].filter(Boolean).join(' · ')}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
