# Aion Phase A: Voice Setup and First Draft

_Researched: 2026-10-04 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The question was written against an April 2026 baseline. The codebase has moved significantly further. Nearly every prerequisite is already in place.

**`aion_config` exists.** `public.workspaces.aion_config` is a live JSONB column. `getAionConfig()` and `getAionConfigForWorkspace()` read it (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84–120`). The voice sub-object holds three fields: `description`, `example_message`, `guardrails`.

**Draft generation is wired.** `POST /api/aion/draft-follow-up` (`src/app/api/aion/draft-follow-up/route.ts:1`) loads voice from `aion_config`, passes it to `generateFollowUpDraft` (`src/app/api/aion/lib/generate-draft.ts:52–86`), and injects description, example, and guardrails into the system prompt. Auth, tier gate, and kill-switch checks are in place.

**Chat tools exist for both operations.** `save_voice_config` (`src/app/api/aion/chat/tools/core.ts:118`) accepts all three voice fields in a single call and merges them into `aion_config`. `draft_follow_up` (`src/app/api/aion/chat/tools/core.ts:318`) auto-selects the highest-priority deal from the queue and generates a draft.

**Onboarding state machine is implemented.** Five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257`). Each state maps to a dedicated greeting and a system-prompt injection (`src/app/api/aion/chat/route/prompts.ts:284–291`).

**The blocking bypass.** When a workspace has no voice stored, `applyVoiceDefaultIfEmpty` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45`) synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState` treats this as `configured` and skips the onboarding flow entirely (`aion-chat-types.ts:248`). New users never see the voice setup unless they find "Tune Aion's voice" in the sidebar overflow (`AionSidebar.tsx:1043`).

## Intended state

Daniel opens `/aion`, writes in one message how he communicates with clients (style, an example, any rules), and Aion immediately responds with a follow-up draft for a real deal that reflects that voice. The experience should feel like one turn: describe → draft appears.

The infrastructure to do this exists. The gap is entirely in the chat prompting layer.

## The gap

- The `no_voice` greeting asks one question at a time; it does not invite freeform prose
- The system prompt for `no_voice` says "Ask about communication style" — the assistant interprets this as a single question, not a one-shot extraction
- After voice is saved, `needs_test_draft` offers "Want me to draft a test message?" with a chip — the user must click a second time; the draft is not immediate
- New workspaces skip onboarding entirely via the auto-synthesis bypass, so the 4-step flow is only reachable through the sidebar overflow

## Options

### Option A: System-prompt and greeting change only

- **What it is:** Change the `no_voice` greeting to invite freeform prose in one message. Change the `no_voice` and `needs_test_draft` system-prompt injections to: extract all three voice fields at once, call `save_voice_config` in one step, and immediately call `draft_follow_up` without pausing for confirmation.
- **Effort:** Small — 2 file changes: `src/app/api/aion/chat/route/prompts.ts` (greeting + system prompt), and a decision on whether to remove the `voice_default_derived` bypass in `aion-config-helpers.ts`.
- **Main risk:** Relies on the model extracting guardrails reliably from freeform prose. Guardrails are the hardest field — if the user does not mention any rules, the model will invent them or leave them vague. Requires prompt testing.
- **Unlocks:** Daniel pastes 3 paragraphs and sees a draft in one turn, using existing infrastructure. Zero schema work.

### Option B: New `parse_and_configure_voice` chat tool

- **What it is:** A dedicated tool that accepts freeform prose, runs `generateObject` internally to extract `description`, `example_message`, and `guardrails` as structured fields, saves via `updateAionConfigForWorkspace`, then immediately calls `generateFollowUpDraft` and returns both the saved voice and the draft in a single tool result.
- **Effort:** Medium — one new tool in `core.ts` (~50 lines), one new `generateObject` call, tests.
- **Main risk:** Two LLM calls (extraction + draft) adds ~3–5 seconds of latency. The `save_voice_config` tool already handles free-field merge; a second extraction call adds complexity without much gain over Option A.
- **Unlocks:** Explicit extraction step is more reliable and auditable. Easier to unit-test voice extraction separately from draft generation.

### Option C: Voice setup form in settings

- **What it is:** Add a 3-textarea form at `/settings/aion` for description, example, and guardrails. Submit calls `saveAionVoiceConfig`. After save, redirect to `/aion` with a `?voiceJustSet=1` param that triggers `draft_follow_up` as a synthetic opening message.
- **Effort:** Medium — new form component, URL param handler in `AionPageClient`, revalidation wiring.
- **Main risk:** Splits the experience across two pages. The form context is disconnected from chat; guardrails entered in a form with no AI assistance tend to be underspecified. Hard to iterate ("change one thing and re-draft") without going back to settings.
- **Unlocks:** Explicit, form-based control for owners who want to audit what they told Aion.

## Recommendation

Ship Option A. The tools, schema, and draft pipeline are complete. The only thing standing between Daniel and the "write → draft" moment is two prompt strings in `prompts.ts`.

Change the `no_voice` greeting to: "Tell me how you communicate with clients — your tone, an example message you were happy with, and anything you always or never want me to do. One message is enough." Change the `no_voice` system-prompt injection from "Ask about communication style" to: "The user is about to describe their voice. Extract description, example_message, and guardrails from their message — even if implicit — and call save_voice_config once with all three fields. Then immediately call draft_follow_up without asking. Do not split into multiple turns."

Also: consider whether to disable the `voice_default_derived` bypass, or leave it and rely on "Tune Aion's voice" to trigger the flow. Given the goal is for Daniel (as owner) to set this up deliberately, the sidebar path is acceptable for now — document it rather than changing the default.

The tradeoff you accept: the model's extraction of guardrails from freeform prose may be thin. A second turn to refine is fine; the first turn should still produce a usable draft.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/route/prompts.ts` around line 284.
2. Change the `no_voice` greeting in `buildGreeting` (around line 310) to invite one freeform block instead of offering style chips.
3. Change the `no_voice` system-prompt injection (line 285) from "Ask about communication style. Save via save_voice_config." to the extraction-then-draft directive.
4. Change the `needs_test_draft` injection (line 291) to "Voice config is set. Call draft_follow_up immediately without asking."
5. Test by calling `resetAionVoiceConfig` from the Aion sidebar to reset your own workspace, then opening `/aion` and pasting 3 paragraphs about how you communicate.
6. Confirm the draft respects the voice fields by checking `aion_config` in Supabase after the turn.

## References

- `src/app/api/aion/draft-follow-up/route.ts` — draft route with voice injection
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt` injects voice into system prompt
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — `OnboardingState` machine
- `src/app/api/aion/chat/route/prompts.ts:284–347` — onboarding system-prompt injections and greetings
- `src/app/api/aion/chat/tools/core.ts:118,318` — `save_voice_config` and `draft_follow_up` tools
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" reset entry point
