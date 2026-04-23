/**
 * Greeting chip resolver — contextual capability-teaching chips for the
 * Aion chat cold-open (design doc §3.2).
 *
 * Discipline:
 *   • Capability teaching, never urgency assertion.
 *   • No counts, no per-item teasers, no *"Draft for [specific deal]"*.
 *   • Tuned to `pageContext` when present; falls back to workspace-wide
 *     starter prompts otherwise.
 *   • Max 3 chips — Field Expert benchmark (Superhuman / Attio / HubSpot all
 *     ship 3-4 starter prompt chips; more reads as a menu, not a suggestion).
 *
 * The chip `value` is the natural-language query that gets sent back as a
 * user turn when tapped. Existing suggestion-chip pipeline (route.ts) fires
 * it as a fresh message — no new plumbing required.
 */

import type { AionPageContext, SuggestionChip } from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';

export type GreetingChipContext = {
  pageContext: AionPageContext | null | undefined;
  /** Whether the workspace is brand-new (no deals yet). Drives starter-prompt tuning. */
  isNewWorkspace?: boolean;
};

/**
 * Resolve the chip row for a pull-mode greeting. Returns an empty array when
 * no sensible chips fit — the greeting renders warm-text-only in that case.
 */
export function resolveGreetingChips(ctx: GreetingChipContext): SuggestionChip[] {
  const pt = ctx.pageContext?.type;

  if (pt === 'deal' || pt === 'proposal') {
    return [
      { label: 'Brief this deal',     value: 'Give me a summary of this deal.' },
      { label: 'Draft a follow-up',   value: 'Draft a follow-up for this deal.' },
      { label: 'Crew on this show',   value: 'Who is on the crew for this deal?' },
    ];
  }

  if (pt === 'event') {
    return [
      { label: 'Brief me',    value: 'Brief me on this event.' },
      { label: 'Timeline',    value: 'Show me the run of show for this event.' },
      { label: 'Money state', value: 'What is the financial picture for this event?' },
    ];
  }

  if (pt === 'entity') {
    return [
      { label: 'Deal history',       value: 'Show me the deal history for this entity.' },
      { label: 'Contact info',       value: 'What is the contact info for this entity?' },
      { label: 'Past shows together', value: 'What shows have we done with this entity?' },
    ];
  }

  // No pageContext — lobby or /aion tab. New workspace gets "get started"
  // chips (Q6 resolved: yes); established workspace gets pull-mode starters.
  if (ctx.isNewWorkspace) {
    return [
      { label: 'Draft a first message', value: 'Help me draft a first message to a client.' },
      { label: 'Add a deal',            value: 'Walk me through adding a new deal.' },
      { label: 'What can you do?',      value: 'What can you do for me?' },
    ];
  }

  return [
    { label: "What's urgent",      value: "What needs my attention today?" },
    { label: 'Draft a follow-up',  value: 'Help me draft a follow-up for my top deal.' },
    { label: 'Catch me up',        value: "Catch me up on what's going on." },
  ];
}
