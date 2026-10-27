# Aion Phase A: voice setup and first follow-up draft

_Researched: 2026-10-27 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

**Note on premise:** Both stated blockers in the queue item are stale. `public.workspaces.aion_config` exists and is live. The Brain tab is not paused in any current code path. Phase A was built in the weeks after the primer was last updated (April 2026). This doc maps what was built, identifies the one real remaining gap, and gives you three paths forward.

## Current state

The full Phase A stack is live.

**`aion_config` column:** `public.workspaces.aion_config` is a JSONB column typed as `AionConfig` in the generated types at `src/types/supabase.ts`. It is read by `getAionConfigForWorkspace` and `getAionConfig` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84–120` and written by `saveAionVoiceConfig` (line 178), `updateAionConfigForWorkspace` (line 262), and `toggleAionKillSwitch` (line 292) in the same file.

**Chat route:** `/api/aion/chat/route.ts` is a full 465-line tool-calling architecture — authenticated, model-tiered, streaming, with a tool-calling loop capped at 10 steps. The 16-line GPT-4-turbo stub described in the primer no longer exists; that route has been replaced entirely.

**Onboarding state machine:** A 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) is defined at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257`. The `buildGreeting` function at `src/app/api/aion/chat/route/prompts.ts:301` dispatches to the correct cold-open message for each state. For `no_voice`, the greeting is "Let's start with how you talk to clients" with chips. Each subsequent state asks for the next piece.

**save_voice_config tool:** Defined at `src/app/api/aion/chat/tools/core.ts:118`. Accepts `description`, `example_message`, `guardrails`, and `onboarding_complete`. Calls `updateAionConfigForWorkspace`, then `refreshConfig` (re-reads the DB row for the rest of the turn). This is how the chat captures what Daniel writes.

**draft_follow_up tool:** Defined at `src/app/api/aion/chat/tools/core.ts:318`. Loads the top queue item from `ops.follow_up_queue`, then calls `getDealContextForAion`. Calls `buildDraftPrompt` at line 410, passing `config.voice` directly — the voice description, example message, and guardrails all go into the LLM system prompt (lines 44–46). Voice is live in every draft.

**Brain tab / Aion page:** `src/app/(dashboard)/aion/AionPageClient.tsx` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />` directly. No paused gate, no placeholder screen.

## Intended state

A first-time owner opens `/aion`, writes three paragraphs about how they communicate with clients, and gets back an Aion-generated follow-up draft that sounds like them. This is the Phase A goal from the follow-up engine design doc (§26).

Based on the code, the path is: greeting prompts for voice → `save_voice_config` captures the description and optionally an example + guardrails → state advances to `needs_test_draft` → `draft_follow_up` generates a draft using `config.voice` as the LLM system prompt context.

## The gap

One real gap between current state and this experience:

- **Synthesized default bypasses onboarding for all existing workspaces.** `applyVoiceDefaultIfEmpty` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` runs on every config read. If `voice.description` is empty, it synthesizes a default from the workspace name and sets `voice_default_derived: true`. `getOnboardingState` at `aion-chat-types.ts:248` returns `'configured'` immediately when `voice_default_derived === true`. Any workspace that has ever had an empty voice field will skip the full onboarding and land in pull-mode. Daniel will see "What's on your mind?" not "How do you talk to clients?" — unless he explicitly triggers the reset path.

- **Reset path is discoverable but not prominent.** `resetAionVoiceConfig` is wired to "Tune Aion's voice" in `AionSidebar` (imports `resetAionVoiceConfig` at line 31). It clears `voice`, `voice_default_derived`, and `onboarding_state`. That is the mechanism — but it is buried in a sidebar overflow, not surfaced at the right moment.

- **No deals = no test draft.** `draft_follow_up` requires `ops.follow_up_queue` to have at least one item, or the user must be on a deal page. From the `/aion` lobby with an empty queue, `needs_test_draft` silently returns `{ error: 'No deals in the follow-up queue.' }`. The LLM will apologize and not show a draft.

## Options

### Option A: Run the existing flow right now
- **What it is:** Click "Tune Aion's voice" in the Aion sidebar overflow to call `resetAionVoiceConfig`. Reload `/aion`. The greeting fires in `no_voice` state. Write your style. The chat captures it in `save_voice_config`. Navigate to a deal page with `/aion` open, request a test draft.
- **Effort:** Small — 5 minutes, zero code.
- **Main risk:** If the workspace has no deals at all, the `needs_test_draft` step still fails. Requires at least one deal in the queue.
- **Unlocks:** Proves the full loop works end-to-end before adding any UI.

### Option B: Add a structured voice setup form in `/settings/aion`
- **What it is:** `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` already exists. Add a "Voice" card with three textareas (style description, example message, guardrails) that calls `saveAionVoiceConfig` on submit. Surfaces the same data as the chat-based onboarding but without discovery friction.
- **Effort:** Small — one settings card, existing action, no schema work.
- **Main risk:** Two surfaces can diverge; the chat path and the settings path must stay in sync (both write to the same JSONB field, so the risk is UI parity, not data parity).
- **Unlocks:** Lets Daniel set voice without navigating through chat, and gives a clear place to edit it later. Also makes the `voice_default_derived` bypass less of a problem — the settings page can always show "you're using a placeholder voice, here's how to tune it."

### Option C: Add a deal-agnostic test draft in the onboarding flow
- **What it is:** When `needs_test_draft` fires and the follow-up queue is empty, generate a demo draft from a synthetic scenario (invented client name, invented show, invented last contact) instead of an error. The LLM still applies the stored voice.
- **Effort:** Small — modify `draft_follow_up` to accept a `demo_mode` flag, or add a `generate_demo_draft` tool that uses a fixed context template.
- **Main risk:** The demo feels fake; Daniel may not trust that the voice is actually working if the scenario is obviously invented.
- **Unlocks:** Completes the onboarding loop regardless of deal state. Good for new workspace demos or onboarding calls.

## Recommendation

**Do Option A first, then Option B.** Option A costs five minutes and proves the loop is real — the code is built, it just needs a fresh run-through. If the flow feels natural, Phase A is done. If the chat-based setup feels labored (most users don't want to explain their writing style in a chatbox), Option B gives you a straightforward settings form. It does not replace the chat path — first-time users who land in `no_voice` still get the guided conversation — but it gives returning users and Daniel's own admin workflow a faster entry point.

Option C is a low-risk quality-of-life improvement worth doing once the main loop is validated. It closes the "no deals yet" edge case cleanly without fake data risks, because a synthetic scenario with names swapped for placeholders is honest about what it is.

Skip building any new infrastructure. The `aion_config` column, the state machine, the tools, and the route are all in place. The only real work is surfacing the reset path better (Option B) and optionally closing the empty-queue edge (Option C).

## Next steps for Daniel

1. Open `/aion`. Look at the sidebar — top of the session list there should be a "..." overflow. Click it and look for "Tune Aion's voice". Click it. This calls `resetAionVoiceConfig` and reloads the chat in `no_voice` state.
2. Write three paragraphs about how you communicate with clients. The chat will save them via `save_voice_config`.
3. Open any active deal, then open the Aion sidebar on that deal page. Ask "Draft a follow-up for this deal." Confirm the draft sounds like you.
4. If the test draft step errors ("no deals in queue"), open a deal page first and ask there — `draft_follow_up` falls back to `pageContext.entityId` when on a deal page.
5. If the flow feels correct, add the Voice card to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` calling `saveAionVoiceConfig` — one settings card, no schema work.
6. Optionally: add demo-mode to `draft_follow_up` at `src/app/api/aion/chat/tools/core.ts:318` for workspaces with no deals.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `getAionConfigForWorkspace`, `saveAionVoiceConfig`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` state machine
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool; `buildDraftPrompt` at line 36 injects voice
- `src/app/api/aion/chat/route/prompts.ts:301` — `buildGreeting` onboarding state dispatch
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab render (no paused gate)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:31` — "Tune Aion's voice" reset wiring
