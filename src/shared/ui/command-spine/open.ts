'use client';

/**
 * Imperative helper to open the global CommandSpine from anywhere.
 * CommandSpine listens for this event in addition to Cmd/Ctrl+K.
 */

export const COMMAND_SPINE_OPEN_EVENT = 'unusonic:command-spine:open';

export function openCommandPalette(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COMMAND_SPINE_OPEN_EVENT));
}
