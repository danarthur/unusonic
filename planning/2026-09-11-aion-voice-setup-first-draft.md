# Aion voice setup: unblocking the first real draft

_Researched: 2026-09-11 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the queue entry was written against the April 2026 primer. The premise is outdated. This doc re-states what actually exists today (2026-09-11) and identifies the real remaining gap._

## Current state

The pipeline described in the question has been fully shipped:

- `public.workspaces.aion_config` **exists** as a JSONB column. `AionVoiceConfig` (`description`, `example_message`, `guardrails`) is fully typed at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12`.
- A 5-state onboarding machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) drives the chat route at `aion-chat-types.ts:247`.
- `save_voice_config` tool exists in the chat (`src/app/api/aion/chat/tools/core.ts:118`). It saves any combination of `description`, `example_message`, `guardrails` fields and marks `onboarding_state: complete` when done.
- `draft_follow_up` tool exists in the same tool module (`core.ts:318`). It picks the top queue deal, loads deal context, applies the workspace voice config, runs tone anchoring from sent messages, and emits a `draft_preview` content block.
- `/api/aion/draft-follow-up` REST endpoint is live and wired identically (`src/app/api/aion/draft-follow-up/route.ts`).
- The `/aion` page renders a full `ChatInterface` (not a stub). The "Brain tab" is gone — the Aion chat is the main surface.
- New workspaces get `voice_default_derived: true` via `synthesizeDefaultVoice()` (`aion-config-helpers.ts:21`). This skips onboarding entirely so newcomers reach a working state immediately.
- "Tune Aion's voice" exists in the `AionSidebar` header overflow menu (`AionSidebar.tsx:1043`). It calls `resetAionVoiceConfig()`, clears the derived default, and re-enters the 4-step forced flow.

## Intended state

Per the queue entry: Daniel opens Aion, writes 3 paragraphs about his communication style, and **immediately** sees a follow-up draft that reflects that voice — no extra confirm step.

The current flow gets 95% of the way there. The gap is one UX step: after saving all 3 voice fields, the `needs_test_draft` greeting asks "Want me to draft a test message?" and waits for confirmation. The word "immediately" is the miss.

## The gap

- `prompts.ts:291` instructs Aion to "Offer a test draft. Use draft_follow_up. After approval…" — the word "offer" plus the general write-confirm rule (`Never create, update, or send without explicit user approval` at `prompts.ts:278`) forces an extra confirmation step.
- The `needs_test_draft` cold-open greeting (`prompts.ts:338`) presents suggestion chips ("Yes, try one" / "I am done") rather than immediately drafting.
- New workspaces skip onboarding entirely (`voice_default_derived: true`). So Daniel would not see the 3-step voice flow unless he clicks "Tune Aion's voice" — a buried 3-click path.
- No in-product affordance prompts an owner to tune their voice on first use. The `resetAionVoiceConfig` entry point is in a sidebar overflow.

## Options

### Option A: Prompt-only fix (immediate draft after guardrails)
- **What it is:** Update the `needs_test_draft` onboarding instruction in `prompts.ts:291` to tell Aion to call `draft_follow_up` immediately rather than offering. Add a carve-out to the write-confirm rule: "Exception: during onboarding test draft, generate without confirmation." Update the `needs_test_draft` cold-open greeting to show a draft inline rather than chips.
- **Effort:** Small — 2 lines in `prompts.ts` + 10-line greeting update.
- **Main risk:** The model may still ask before calling write-adjacent tools due to the general confirm rule. Needs a test run to verify.
- **Unlocks:** Daniel writes style → example → guardrails → sees draft in the same chat, no extra step.

### Option B: Auto-draft in the `save_voice_config` tool
- **What it is:** In `core.ts:save_voice_config.execute`, detect when the result of saving produces a `needs_test_draft` onboarding state. Call `getDealContextForAion` + `generateFollowUpDraft` in the same execute and return a `draft_preview` block inside the tool result. The model presents it to the user automatically.
- **Effort:** Small-medium — extend `save_voice_config` execute (~30 lines), surface draft block in the tool response schema.
- **Main risk:** Draft generation adds ~1–2s latency inside the tool call, which runs during streaming. User sees a pause before the draft appears. Also slightly breaks the single-responsibility contract of that tool.
- **Unlocks:** Draft is auto-generated in the same turn the guardrails are saved. No prompt change needed.

### Option C: Dedicated voice setup form in `/settings/aion`
- **What it is:** Add a standalone 3-textarea form (style, example, guardrails) to the Aion settings page at `src/app/(dashboard)/settings/aion/`. "Save and preview" button calls `saveAionVoiceConfig()` then fetches a draft preview via `/api/aion/draft-follow-up` and renders it inline.
- **Effort:** Medium — new form component, draft preview card on settings page, wiring to existing server actions.
- **Main risk:** Two paths to the same config diverge in behavior over time. The settings form bypasses the conversational onboarding entirely and won't prompt for example or guardrails.
- **Unlocks:** Owner can tune voice without entering chat. Better for power users who know what they want.

## Recommendation

**Option A.** The whole pipeline is already wired. The only blocker is a prompt instruction that inserts an unnecessary confirmation step between "voice saved" and "first draft." Two targeted changes close the gap:

1. In `prompts.ts:291`, change the `needs_test_draft` instruction from "Offer a test draft" to "Generate a test draft immediately — skip confirmation, it is the whole point of this step."
2. Add a carve-out above the write-confirm rule: "This rule does not apply to onboarding test drafts."
3. Update the `needs_test_draft` greeting to omit the confirmation chip and instead open with "Your voice is set. Here is how it sounds on your top deal:" followed by a `draft_preview` block generated server-side.

The third change (server-side draft in the greeting) is the high-value one. It means the draft appears the moment the user opens Aion after completing onboarding — no user message required. This is achievable because `buildGreeting` is already async and has access to `workspaceId`.

Option B is a valid alternative but adds latency inside a tool call. Option C is worth doing later as a power-user affordance, but does not close the "immediately" gap for the chat-first flow.

## Next steps for Daniel

1. In `src/app/api/aion/chat/route/prompts.ts` around line 278, add a one-line carve-out to the write-confirm rule: `'- Exception: onboarding test drafts (onboarding_state === needs_test_draft) do not require confirmation'`
2. On line 291, change the `needs_test_draft` instruction to: `'Generate a test draft immediately using draft_follow_up. Do not ask first. Say "Your voice is set — here is how it sounds on your top deal" then present the draft_preview card. After showing the draft, call save_voice_config with onboarding_complete: true.'`
3. In `buildGreeting` (same file, around line 338), update the `needs_test_draft` case to call `getDealContextForAion` + `generateFollowUpDraft` server-side and return a `draft_preview` content block alongside the intro text (no chips).
4. Test by: (a) open a workspace with no voice config, OR (b) click sidebar → "..." → "Tune Aion's voice" to reset, then go through the 3-step chat.
5. Optional follow-up: make "Tune Aion's voice" more discoverable — e.g., a one-time banner on the `/aion` landing page when `voice_default_derived === true`.

## References

- `src/app/api/aion/chat/route/prompts.ts:278–295` — write-confirm rule + onboarding instructions
- `src/app/api/aion/chat/route/prompts.ts:338–347` — `needs_test_draft` greeting
- `src/app/api/aion/chat/tools/core.ts:118–144` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318–430` — `draft_follow_up` tool
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — onboarding state machine
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:21` — `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" entry point
