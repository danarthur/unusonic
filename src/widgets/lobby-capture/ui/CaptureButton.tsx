'use client';

/**
 * CaptureButton — lobby header affordance.
 *
 * Opens the CaptureModal. Matches the header-row styling used by
 * LobbyTimeRangePicker / LobbyLayoutSwitcher so it sits visually in the same
 * row as an equal peer.
 *
 * Global keyboard shortcut: Shift+C when the lobby is focused.
 *
 * See docs/reference/sales-brief-v2-design.md §10.1.
 */

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Mic } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

// Dynamic import — the modal bundles Framer, the recorder, and the review
// card. No need to pull that into the lobby's initial render.
const CaptureModal = dynamic(
  () => import('./CaptureModal').then((m) => m.CaptureModal),
  { ssr: false },
);

export interface CaptureButtonProps {
  workspaceId: string;
  className?: string;
}

export function CaptureButton({ workspaceId, className }: CaptureButtonProps) {
  const [open, setOpen] = React.useState(false);

  // Shift+C anywhere on the lobby — but not when the user is typing in an
  // input/textarea/contenteditable surface.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'C' && e.key !== 'c') return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Capture — dictate a thought"
        title="Capture (Shift+C)"
        className={cn(
          'inline-flex items-center justify-center h-8 w-8 rounded-[var(--stage-radius-input,10px)]',
          'border border-[var(--stage-edge-subtle)]',
          'bg-[var(--stage-surface-elevated)]',
          'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
          'transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
          open && 'text-[var(--stage-text-primary)]',
          className,
        )}
        data-testid="capture-button"
      >
        <Mic className="w-4 h-4" aria-hidden />
      </button>

      {open && (
        <CaptureModal
          workspaceId={workspaceId}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
