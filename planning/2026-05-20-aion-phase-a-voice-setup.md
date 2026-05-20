# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-05-20 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: The primer's April 10 state description is now outdated. This doc reflects the actual codebase state as of May 20, 2026._

## Current state

Phase A is ~90% shipped. The infrastructure from the queue item's premises already exists:

`workspaces.aion_config` exists as a `Json` column (`src/types/supabase.ts`). The `AionConfig` type is fully defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74` with `voice?: AionVoiceConfig` containing `description`, `example_message`, and `guardrails` fields.

The Aion chat UI is complete: `/aion` → `AionPageClient` → `ChatInterface`. The "Brain tab" concept has been superseded by this full Aion interface.

A 4-step conversational onboarding state machine exists: `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` maps config → `no_voice | no_example | no_guardrails | needs_test_draft | configured`. The chat route at `src/app/api/aion/chat/route.ts:121-122` reads this state and `buildSystemPrompt` at `src/app/api/aion/chat/route/prompts.ts:275-282` injects the correct onboarding directive into each system prompt.

Draft generation is complete: `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts:25-46` uses the fast model, injects voice config, and returns `{ draft, channel }`. The `POST /api/aion/draft-follow-up` route at `src/app/api/aion/draft-follow-up/route.ts:60-63` calls it with `aionConfig.voice ?? null`.

The Follow-Up Card closes the loop: `follow-up-card.tsx:341-367` calls `getDealContextForAion()` then fetches `/api/aion/draft-follow-up` — the full voice-aware draft pipeline is live.

The critical bypass: `applyVoiceDefaultIfEmpty()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState` returns `'configured'` immediately when this flag is set (`aion-chat-types.ts:248`). So **the 4-step onboarding never fires for any existing workspace**. The only entry point is "Tune Aion's voice" hidden in the AionSidebar overflow menu (`AionSidebar.tsx` settings section), which calls `resetAionVoiceConfig()` and re-enters the chat flow.

## Intended state

Daniel opens Aion, describes how he talks to clients (style, example, rules), and sees a draft follow-up that reflects that voice — immediately and without hunting through menus. The experience should feel like teaching a smart colleague, not configuring software settings.

The current conversational 4-step flow is architecturally sound but demands multiple chat turns and requires finding a buried menu entry. The "3 paragraphs" framing Daniel used implies a single-shot form experience: all fields visible at once, typed in one session, draft rendered inline.

## The gap

- Voice setup entry point is buried: sidebar overflow → "Tune Aion's voice" — no new-workspace surfacing, no prominent affordance
- The 4-step chat onboarding never auto-fires (synthesized default bypasses it via `voice_default_derived`)
- No single-shot form: the chat flow takes 4 turns across two screen areas before a draft appears
- The `needs_test_draft` onboarding step calls the `draft_follow_up` tool, which needs live deal context; if no queue items exist (fresh workspace), that step may fail silently

## Options

### Option A: First-run greeting prompt

- **What it is:** Modify `buildGreeting()` to detect `voice_default_derived === true` and emit a special first-run message: "I've set a default voice for you based on your company name. Want to tune it now?" with chips. Chip selection calls `resetAionVoiceConfig()` via a thin API endpoint, then re-enters the conversational 4-step onboarding.
- **Effort:** Small — one new branch in `buildGreeting` (`prompts.ts:292`) plus a `/api/aion/reset-voice` route (3 lines calling the existing server action).
- **Main risk:** Adds conditional complexity to the greeting system; the chat-based 4-step flow is still 4 turns with no simultaneous field view, which doesn't match the "3 paragraphs" feel.
- **Unlocks:** Voice tuning discovery without menu hunting.

### Option B: Voice setup form (sheet) — recommended

- **What it is:** A slide-over sheet with three labeled textareas (Style, Example message, Rules) and a "Generate test draft" button at the bottom. On save, calls `saveAionVoiceConfig()` (already exists at `aion-config-actions.ts:178-206`). The draft button fetches `/api/aion/draft-follow-up` with the first pending queue item (or a minimal stub context if none). Wire the sheet to the existing sidebar "Tune Aion's voice" button, and add a first-run prompt in the `voice_default_derived` greeting path (small Option A addition) to surface it on first open.
- **Effort:** Medium — new `VoiceSetupSheet` component (~150 lines), update sidebar button handler, one `buildGreeting` branch.
- **Main risk:** Two configuration paths now exist (form vs. conversational). Not a real problem if the form replaces the `resetAionVoiceConfig()` call rather than coexisting with it. The chat-based onboarding still runs for users who type voice intent directly.
- **Unlocks:** Exact "3 paragraphs → see draft" experience. Clear mental model: this is settings for the voice, chat is for using it.

### Option C: Make `voice_default_derived` time-gated

- **What it is:** In `applyVoiceDefaultIfEmpty()`, skip the bypass for workspaces created within the last 7 days — read `workspace.created_at` and only apply the synthesized default + flag when the workspace is older than N days. New workspaces hit `no_voice` immediately.
- **Effort:** Small — two extra lines in `aion-config-helpers.ts` (pass `workspace.created_at` to the helper, add a date comparison).
- **Main risk:** Onboarding fires at the worst time (first use of Aion, when the user just wants to try it). The chat-based flow still takes 4 turns. Disrupts existing workspaces if the threshold is wrong.
- **Unlocks:** Automatic onboarding for new workspaces with no UI changes.

## Recommendation

Option B. Build the `VoiceSetupSheet` form.

The "3 paragraphs" description is the clearest signal of what Daniel wants: one screen, all fields visible, type and see a draft. The conversational 4-step flow is a good fallback for in-chat voice intent, but it's not what you'd design for an intentional "teach Aion my style" session.

The implementation is straightforward because every piece already exists: `saveAionVoiceConfig` for writing, `/api/aion/draft-follow-up` for the test draft, the sidebar button as the trigger. The form is additive — the chat onboarding (`no_voice` flow) still works for users who discover voice tuning through conversation.

Add the Option A first-run greeting prompt alongside it: two changes (form + greeting) together cover both discovery and the desired UX in one small sprint.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupSheet.tsx` — three textareas bound to `AionVoiceConfig` fields, a "Generate test draft" button fetching `/api/aion/draft-follow-up`, and a save button calling `saveAionVoiceConfig`.
2. In `AionSidebar.tsx` (settings section, ~line 1000), replace the `resetAionVoiceConfig()` direct call with opening the new sheet (pass `initialValues={currentVoice}` so the form pre-fills for re-tuning).
3. Add a `buildGreeting` branch in `prompts.ts:292` for `voice_default_derived === true`: emit a brief "I've set a starting voice — want to tune it?" message with a "Tune voice" chip that opens the sheet.
4. In `VoiceSetupSheet`, wire the "Generate test draft" button: call `getDealContextForAion` with the first item from `ops.follow_up_queue` (or a minimal stub context), then fetch `/api/aion/draft-follow-up`. Show the draft inline below the form.
5. Guard the stub context path: if no queue items exist, pass a synthetic `AionDealContext` with placeholder deal info so the test draft still renders sensibly (already has a precedent in `STUB_QUEUE_ITEM` at `scope-context.ts:47`).
6. Smoke test: reset voice config, open Aion, confirm greeting shows the tune prompt, click it, fill the form, hit "Generate test draft," confirm the draft voice matches what was entered.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — `OnboardingState`, `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:275-285` — onboarding system prompt injection
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — authenticated draft generation endpoint
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts` — `getDealContextForAion`, `AionDealContext`
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:341-367` — live follow-up → draft loop
- `src/app/api/aion/lib/scope-context.ts:47` — `STUB_QUEUE_ITEM` pattern for context-free drafts
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx` — "Tune Aion's voice" button location
