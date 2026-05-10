# Aion Phase A: minimum path to voice setup + first real draft

_Researched: 2026-05-10 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The queue entry was written against an earlier codebase state. The infrastructure is substantially further along.

**`public.workspaces.aion_config` exists** — typed as `Json`, read/written by `getAionConfigForWorkspace()` and `saveAionVoiceConfig()` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84`.

**The Brain tab is live.** `/api/aion/chat/route.ts:57` handles streaming chat with tool-calling. The page at `src/app/(dashboard)/aion/page.tsx` renders `AionPageClient` which mounts `ChatInterface` directly — no paused state in the UI.

**Voice onboarding state machine is implemented.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` derives one of five states (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) from `aion_config`. The chat route at `src/app/api/aion/chat/route/prompts.ts:275` injects state-specific instructions into the system prompt. `buildGreeting()` at line 292 returns a tailored first message for each state.

**Draft generation is fully wired.** `/api/aion/draft-follow-up/route.ts` is a real, auth-gated endpoint that calls `generateFollowUpDraft()` from `src/app/api/aion/lib/generate-draft.ts:26`, injecting `aion_config.voice` into the system prompt. It is called from the follow-up card at `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:348`.

**There is a synthesis bypass that breaks re-entry.** `applyVoiceDefaultIfEmpty()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` runs on every config read. If no voice is stored, it synthesizes one from the workspace name and sets `voice_default_derived: true` in memory. `getOnboardingState()` at line 248 short-circuits immediately on that flag: `if (config.voice_default_derived === true) return 'configured'`. This means that after the sidebar "Tune Aion's voice" reset (`resetAionVoiceConfig` at `aion-config-actions.ts:214`), the cleared voice is immediately re-synthesized on the next config read — the reset never actually re-enters the `no_voice` onboarding path.

**The test draft in chat requires a real queued deal.** The `needs_test_draft` state tells Aion to call the `draft_follow_up` chat tool, which needs a real `deal_id` in the follow-up queue. Without open deals, the test draft step silently stalls.

## Intended state

Daniel opens the Brain tab, types a free-form description of how he writes to clients (could be 1 paragraph or 5), and Aion immediately extracts his voice profile (description, example, guardrails), saves it, and generates a draft — without requiring 4 back-and-forth turns or a pre-existing deal in the queue.

The secondary goal: the "Tune Aion's voice" sidebar affordance actually works — clicking it re-enters the voice setup conversation rather than silently landing back in 'configured' state because of synthesis.

## The gap

- `resetAionVoiceConfig` clears voice from DB but `applyVoiceDefaultIfEmpty` re-synthesizes on the next read, setting `voice_default_derived: true` → `getOnboardingState` returns `configured` → no onboarding prompt fires. The reset is a no-op for onboarding re-entry.
- No standalone voice setup form. The only entry points are the 4-step conversational onboarding (broken for existing workspaces) and the sidebar reset (also broken, see above).
- The 4-step chat onboarding is spread across 3–4 conversation turns. "Write 3 paragraphs → see a draft" requires collapsing that into a single turn.
- `needs_test_draft` requires a real deal. A fresh workspace or one with no pending follow-ups can't complete the onboarding loop.

## Options

### Option A: Fix the synthesis sentinel (prerequisite)
- **What it is:** Modify `resetAionVoiceConfig` to write `voice_default_derived: false` (an explicit sentinel, not just absence) into the DB config. Modify `applyVoiceDefaultIfEmpty` to skip synthesis when the flag is `false`. Modify `getOnboardingState` to return `no_voice` when `voice_default_derived === false`. Three functions, three files, no migration needed.
- **Effort:** Small (under 2 hours)
- **Main risk:** `false` vs. absent distinction must be preserved through all config merge paths (`updateAionConfigForWorkspace` deep-merge at `aion-config-actions.ts:262` could overwrite it). Needs a test update.
- **Unlocks:** "Tune Aion's voice" actually re-enters onboarding. Prerequisite for any conversational onboarding path to work for existing workspaces.

### Option B: Collapse the onboarding into a single-turn extraction
- **What it is:** Extend the `no_voice` system prompt instruction (currently one sentence at `prompts.ts:276`) to tell Aion: "if the user provides a long description, extract description, example_message, and guardrails from it in a single call to save_voice_config, then immediately offer a test draft using a synthetic context (the next queued deal, or a generic stand-in if none exist)." Update `buildGreeting` for `no_voice` to prompt Daniel to write a free-form paragraph rather than choose from chips.
- **Effort:** Small (under 2 hours)
- **Main risk:** LLM extraction from free-form text is imperfect — if Daniel writes a stream of consciousness, guardrails may be missed. The short-circuit to test draft with a synthetic context (no real deal) produces a less convincing output.
- **Unlocks:** Single-message voice setup. Matches the stated goal: "write 3 paragraphs → see a draft."

### Option C: Dedicated voice setup form in Settings/Aion
- **What it is:** Three-textarea form at `/settings/aion` (sits alongside the existing consent + cadence toggles in `AionSettingsView.tsx`) that saves voice directly via `saveAionVoiceConfig()`. On save, immediately call `/api/aion/draft-follow-up` with a synthetic `AionDealContext` and show the resulting draft inline.
- **Effort:** Medium (4–6 hours — new form component, synthetic context builder, inline draft preview)
- **Main risk:** Settings is a secondary surface. Daniel's goal mentions the Brain tab, not settings. A form there is discoverless without a prompt. Synthetic context produces a weaker test draft than real deal data.
- **Unlocks:** Non-conversational voice setup path. Useful as an edit surface after initial setup.

## Recommendation

Ship Option A + Option B together. They are complementary, both small, and together they deliver exactly what the goal describes.

Fix the sentinel first (Option A): it is a correctness bug regardless. Without it, "Tune Aion's voice" is misleading — the button fires a toast that says "Voice reset — start a new chat to retune Aion" but the next chat opens with 'configured' state. That is broken behavior.

Then extend the `no_voice` onboarding prompt (Option B): change the greeting to "Describe how you write to clients — the more detail the better" and tell Aion in the system prompt to extract all three voice fields from one message and proceed directly to draft. This collapses 4 turns into 1 or 2 and matches Daniel's mental model of "tell Aion how I work, see what it does with it."

Option C is a separate, later addition — a voice edit form in Settings makes sense as a non-conversational review/update surface once initial setup has happened. Not part of the minimum path.

## Next steps for Daniel

1. **Fix the sentinel.** In `resetAionVoiceConfig` (`aion-config-actions.ts:214`), update the `rest` spread to include `voice_default_derived: false` instead of omitting it. In `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35`), add a guard: `if (config.voice_default_derived === false) return config;` before the synthesis fallback. In `getOnboardingState` (`aion-chat-types.ts:247`), change the first check to `if (config.voice_default_derived === true) return 'configured';` — it already does this; no change needed there; the fix is upstream in the synthesis function.
2. **Update the deep-merge guard.** In `updateAionConfigForWorkspace` (`aion-config-actions.ts:262`), ensure the spread doesn't silently drop `voice_default_derived: false`. Add it to the merged object only if explicitly passed in `updates`.
3. **Update the `no_voice` greeting.** In `buildGreeting` (`prompts.ts:292`), replace the chip-based greeting for `no_voice` with a free-form prompt: "Describe how you write to clients — timing, tone, what you never say. The more detail the better. I'll learn your voice and show you what I'd send."
4. **Extend the `no_voice` system prompt.** In `buildSystemPrompt` at `prompts.ts:275`, expand the one-line onboarding instruction to tell Aion to extract all three fields from the user's first message and call `save_voice_config` immediately, then call `draft_follow_up` with the next queued deal (or skip if none exist and offer "Try on a real deal from the follow-up card").
5. **Run the existing test.** `src/app/(dashboard)/(features)/aion/actions/__tests__/aion-config-actions.test.ts` has an `it('preserves no_voice when neither voice nor synthesis flag is set')` test — update it to assert that `voice_default_derived: false` also returns `no_voice`.
6. **Test the flow.** In a workspace, click "Tune Aion's voice" in the Aion sidebar, open a new chat, type a paragraph about communication style, and verify Aion responds with a draft rather than a configured-state greeting.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `resetAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, `OnboardingState`
- `src/app/api/aion/chat/route/prompts.ts` — `buildSystemPrompt`, `buildGreeting`
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint with voice injection
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:976` — "Tune Aion's voice" affordance
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:348` — primary draft call site
