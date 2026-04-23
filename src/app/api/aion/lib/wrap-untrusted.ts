/**
 * Prompt-injection safety wrapper.
 *
 * Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.2 B4.
 *
 * Any user-generated or client-generated content flowing into the model's
 * context window (email bodies, SMS content, deal notes used as activity-log
 * lines, narrative text, catalog descriptions, paraphrased hover previews)
 * must be wrapped via this helper. The `<untrusted>` delimiters signal to
 * the model that the enclosed text is data to be reasoned about, not
 * instructions to follow — which blunts the standard "ignore previous
 * instructions and ..." injection attack from inbound client messages.
 *
 * Surfaces this MUST cover (Sprint 1 Week 1+):
 *   • scope-context.ts — message/activity/narrative/catalog injections
 *   • get_latest_messages tool return (Week 1)
 *   • lookup_client_messages tool return (Week 2)
 *   • search_workspace_knowledge when source_type ∈
 *     {message, activity_log, catalog, narrative} (Week 2)
 *   • activity-log chunk rendering — per-line on note-derived entries (Week 3)
 *   • paraphrased CitationPill hover cards (Week 2)
 *
 * Week 2 adds an ESLint rule + CI grep gate that forbids raw template
 * interpolation of known untrusted field names (body_text, body_excerpt,
 * note_text, activity_text, ai_summary) unless an import of
 * `wrapUntrusted` is present in the same file.
 */

export function wrapUntrusted(text: string): string {
  // Guard against accidental double-wrapping (common when a helper returns
  // already-wrapped text and a caller wraps again).
  if (text.startsWith('<untrusted>') && text.endsWith('</untrusted>')) {
    return text;
  }
  return `<untrusted>${text}</untrusted>`;
}

/**
 * Convenience for per-line wrap. Used by activity-log rendering where each
 * note-derived line is independently quoted but the structured header stays
 * plain (B4 chunking discipline, plan §3.3).
 */
export function wrapUntrustedLine(line: string): string {
  return wrapUntrusted(line);
}
