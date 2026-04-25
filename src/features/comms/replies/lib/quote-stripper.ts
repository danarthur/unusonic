/**
 * Quoted-reply splitter for inbound message bodies.
 *
 * Most inbound email arrives with Postmark's `StrippedTextReply` already
 * stripping quoted history, so `body_text` in ops.messages is already the
 * "just the new reply" version in the common case. But:
 *   (1) When StrippedTextReply is empty (HTML-only senders), we fall
 *       through to `TextBody` which contains quoted history.
 *   (2) When we derive body from HtmlBody → toPlainText, any HTML-encoded
 *       quoted content ends up in body_text.
 *
 * For those cases, this heuristic finds the common quote-delimiter patterns
 * and splits the body into `{ visible, quoted }`. When no delimiter is
 * found, quoted is null and the card renders the body as-is — which is
 * also the correct behavior when StrippedTextReply already did its job.
 *
 * Known failure modes (acceptable for Phase 1):
 *   - Non-English quote headers ("Le ... a écrit", "Am ... schrieb")
 *   - Outlook desktop's bold "From:" header embedded in HTML
 *   - Forwarded chains with multiple "On ... wrote:" nesting
 *
 * See docs/reference/replies-card-v2-design.md §5 Tier 3 for the UI
 * consumer contract.
 *
 * @module features/comms/replies/lib/quote-stripper
 */

export type QuoteSplit = {
  /** Everything before the first quote delimiter. Trimmed. */
  visible: string;
  /** The quoted history, including the delimiter line. Null when no
   *  delimiter was detected (common case — StrippedTextReply already
   *  scrubbed quotes upstream). */
  quoted: string | null;
};

/**
 * Regex patterns that reliably indicate the start of a quoted block.
 * Order matters — more specific patterns first. Each regex runs against a
 * single line, trimmed.
 */
const QUOTE_DELIMITERS: RegExp[] = [
  // Gmail / Apple Mail canonical: "On Mon, Apr 22, 2026 at 3:14 PM Ally Chen <ally@example.com> wrote:"
  /^On .+, \d{4}.+<.+@.+> wrote:$/i,
  // Gmail without year: "On Mon, Apr 22 at 3:14 PM Ally Chen <ally@example.com> wrote:"
  /^On .+<.+@.+> wrote:$/i,
  // Shorter Apple Mail variant: "On Apr 22, 2026, at 3:14 PM, Ally Chen wrote:"
  /^On .+\d{4}.+wrote:$/i,
  // Generic fallback: "On ... wrote:" — catches most other clients
  /^On .+ wrote:$/i,
  // Outlook desktop divider: "-----Original Message-----"
  /^-{3,}\s*Original Message\s*-{3,}$/i,
  // Outlook desktop block: "From: Daniel Arthur <daniel@unusonic.com>"
  /^From:\s+.+<.+@.+>/i,
  // Reply-indent hard edge: "_______________" or "===============" separators
  /^[=_]{10,}$/,
];

/**
 * Detect the first line that is ">" or starts a run of ">"-prefixed lines.
 * Only flag when ≥2 consecutive lines are quoted — single ">" lines appear
 * in body text for emphasis / code-like formatting and shouldn't trigger
 * the split.
 */
function firstQuoteBlockIndex(lines: string[]): number {
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^>/.test(lines[i]) && /^>/.test(lines[i + 1])) {
      return i;
    }
  }
  return -1;
}

export function splitQuotedReply(bodyText: string | null | undefined): QuoteSplit {
  if (!bodyText) {
    return { visible: '', quoted: null };
  }

  const lines = bodyText.split(/\r?\n/);

  let quoteStartIdx = -1;

  // Pass 1: regex-based delimiters.
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (QUOTE_DELIMITERS.some((re) => re.test(trimmed))) {
      quoteStartIdx = i;
      break;
    }
  }

  // Pass 2: ">" prefix runs, if no regex matched earlier.
  if (quoteStartIdx === -1) {
    quoteStartIdx = firstQuoteBlockIndex(lines);
  }

  if (quoteStartIdx === -1) {
    return { visible: bodyText.trim(), quoted: null };
  }

  const visibleLines = lines.slice(0, quoteStartIdx);
  const quotedLines = lines.slice(quoteStartIdx);

  const visible = visibleLines.join('\n').trimEnd();
  const quoted = quotedLines.join('\n').trimStart();

  // Edge case: if every visible line is empty, the message starts with a
  // quote — promote the quoted block as the visible content (no quote
  // collapse to offer).
  if (!visible) {
    return { visible: bodyText.trim(), quoted: null };
  }

  return { visible, quoted: quoted || null };
}

/**
 * Count the number of lines in the quoted content, for the "Show N earlier
 * quoted lines" label. Filters out empty lines and the delimiter itself
 * so the number feels honest — 6 content lines, not "6 quoted lines" that
 * secretly includes the header.
 */
export function countQuotedLines(quoted: string | null): number {
  if (!quoted) return 0;
  return quoted
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      // Exclude purely-decorative divider lines. "From: ..." and "On ..."
      // ARE content (they carry the original email's metadata) so they
      // stay counted.
      if (/^-{3,}\s*Original Message\s*-{3,}$/i.test(t)) return false;
      if (/^[=_]{10,}$/.test(t)) return false;
      // Exclude "On ..." quote headers that just introduce the following
      // "> ..." lines — they're decorative when the body immediately
      // follows as quoted lines.
      if (/^On .+ wrote:$/i.test(t)) return false;
      return true;
    }).length;
}
