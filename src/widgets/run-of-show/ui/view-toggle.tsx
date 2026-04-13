'use client';

import { List, BarChart3 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type RosViewMode = 'list' | 'timeline';

interface ViewToggleProps {
  mode: RosViewMode;
  onChange: (mode: RosViewMode) => void;
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="stage-panel stage-panel-nested !rounded-xl !p-0.5 flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange('list')}
        className={cn(
          'h-7 w-7 rounded-lg flex items-center justify-center transition-colors',
          mode === 'list'
            ? 'bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)]'
            : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)]'
        )}
        aria-label="List view"
      >
        <List size={14} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={() => onChange('timeline')}
        className={cn(
          'h-7 w-7 rounded-lg flex items-center justify-center transition-colors',
          mode === 'timeline'
            ? 'bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)]'
            : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)]'
        )}
        aria-label="Timeline view"
      >
        <BarChart3 size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
