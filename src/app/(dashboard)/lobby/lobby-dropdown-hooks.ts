'use client';

/**
 * Small dropdown-related hooks shared across Lobby header controls.
 *
 * Extracted so each consumer (LobbyLayoutSwitcher, anything that follows)
 * stays under the file-size ratchet. Mirrors the positioning + outside-click
 * logic first established in LobbyTimeRangePicker.
 *
 * @module app/(dashboard)/lobby/lobby-dropdown-hooks
 */

import * as React from 'react';

const DEFAULT_POPOVER_HEIGHT = 340;
const DEFAULT_POPOVER_WIDTH = 260;

/**
 * Absolute (top, left) position for a popover anchored to a button, with
 * automatic flip-above when the viewport doesn't have room below. Anchors to
 * the right edge of the button so the panel reads as "hanging off" it.
 */
export function useAnchoredDropdownPosition(
  open: boolean,
  buttonRef: React.RefObject<HTMLButtonElement | null>,
  {
    popoverHeight = DEFAULT_POPOVER_HEIGHT,
    popoverWidth = DEFAULT_POPOVER_WIDTH,
  }: { popoverHeight?: number; popoverWidth?: number } = {},
) {
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(
    null,
  );

  React.useLayoutEffect(() => {
    if (!open || !buttonRef.current || typeof window === 'undefined') {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow < popoverHeight
        ? Math.max(8, rect.top - popoverHeight - 6)
        : rect.bottom + 6;
    setPosition({ top, left: Math.max(8, rect.right - popoverWidth) });
  }, [open, buttonRef, popoverHeight, popoverWidth]);

  return position;
}

/**
 * Dismiss an open dropdown when the user clicks anywhere outside the given
 * refs.
 */
export function useDismissOnOutsideClick(
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
