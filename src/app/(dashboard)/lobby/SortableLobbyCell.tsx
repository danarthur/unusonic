'use client';

/**
 * SortableLobbyCell — Phase 2.3.
 *
 * Wraps a single bento cell in dnd-kit's `useSortable` so the modular Lobby
 * supports drag-to-reorder when edit mode is on. When edit mode is off this
 * component is a thin pass-through (no drag listeners attached, no handle,
 * no remove affordance) so flag-on workspaces in view-mode see no extra
 * chrome and the cell behaves byte-identical to the Phase 2.2 path.
 *
 * Drag is desktop only by design — viewport-gating happens in the parent
 * (LayoutControls is `hidden md:flex`, so editMode never flips on mobile).
 *
 * @module app/(dashboard)/lobby/SortableLobbyCell
 */

import * as React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface SortableLobbyCellProps {
  id: string;
  editMode: boolean;
  onRemove: (id: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function SortableLobbyCell({
  id,
  editMode,
  onRemove,
  className,
  children,
}: SortableLobbyCellProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !editMode });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Lift the dragged card above its siblings so the shadow reads.
    zIndex: isDragging ? 30 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative h-full min-h-0',
        editMode && 'rounded-[var(--stage-radius-panel,12px)]',
        editMode &&
          'ring-1 ring-[var(--stage-edge-subtle)]',
        isDragging && 'opacity-80 shadow-[0_12px_32px_oklch(0_0_0/0.32)]',
        className,
      )}
    >
      {editMode && (
        <>
          {/* Drag handle — top-left, hover-revealed when not actively dragging */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            className={cn(
              'absolute top-2 left-2 z-20',
              'inline-flex items-center justify-center',
              'h-7 w-7 rounded-md',
              'bg-[var(--stage-surface-raised)] border border-[var(--stage-edge-subtle)]',
              'text-[var(--stage-text-secondary)]',
              'cursor-grab active:cursor-grabbing',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
              'shadow-[0_2px_8px_oklch(0_0_0/0.24)]',
            )}
            aria-label={`Drag to reorder ${id}`}
            // Stop click from bubbling to anything underneath while dragging.
            onClick={(e) => e.preventDefault()}
          >
            <GripVertical className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
          </button>

          {/* Remove button — top-right */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(id);
            }}
            className={cn(
              'absolute top-2 right-2 z-20',
              'inline-flex items-center justify-center',
              'h-7 w-7 rounded-md',
              'bg-[var(--stage-surface-raised)] border border-[var(--stage-edge-subtle)]',
              'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
              'transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
              'shadow-[0_2px_8px_oklch(0_0_0/0.24)]',
            )}
            aria-label={`Remove ${id} from lobby`}
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
          </button>

          {/* Click shield — prevents inner widget interactions while in edit mode */}
          <div
            className="absolute inset-0 z-10 cursor-grab"
            aria-hidden
            {...listeners}
            {...attributes}
          />
        </>
      )}

      {children}
    </div>
  );
}
