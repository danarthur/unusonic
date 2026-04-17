/**
 * Verbal-marker detection for capture visibility.
 *
 * Checks the leading tokens of a transcript for phrases that explicitly
 * promote a capture to workspace scope ("for the team:") or force it
 * back to owner-only ("just for me"). Used as an initial hint for the
 * composer review card's visibility toggle.
 *
 * Design: docs/reference/capture-surfaces-design.md §10.4.
 */

export type VisibilityHint = 'user' | 'workspace' | null;

const PRIVATE_MARKERS: readonly RegExp[] = [
  /^\s*(?:just\s+for\s+me)\b/i,
  /^\s*(?:personal\s+note)\b/i,
  /^\s*(?:private)[\s\u2014\u2013:-]/i, // "private —" / "private -" / "private:"
  /^\s*(?:for\s+me\s+only)\b/i,
];

const WORKSPACE_MARKERS: readonly RegExp[] = [
  /^\s*(?:for\s+the\s+team)\b/i,
  /^\s*(?:team\s+note)\b/i,
  /^\s*(?:share\s+with\s+the\s+team)\b/i,
];

/**
 * Inspect the transcript's opening phrase for a visibility hint. Returns:
 *   - 'user'      — transcript opens with a private marker
 *   - 'workspace' — transcript opens with a team marker
 *   - null        — no hint; caller should fall back to workspace default
 */
export function detectVisibilityHint(transcript: string): VisibilityHint {
  if (!transcript) return null;
  for (const re of PRIVATE_MARKERS) {
    if (re.test(transcript)) return 'user';
  }
  for (const re of WORKSPACE_MARKERS) {
    if (re.test(transcript)) return 'workspace';
  }
  return null;
}
