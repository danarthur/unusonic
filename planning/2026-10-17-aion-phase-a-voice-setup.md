# Aion Phase A: Voice Setup and First Draft — Where We Actually Are

_Researched: 2026-10-17 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: Both premises are outdated. This doc re-scopes based on what the code actually shows today._

## Current state

**`aion_config` exists and is live.** `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94` reads and writes `public.workspaces.aion_config` (JSONB). Server actions `saveAionVoiceConfig`, `getAionConfig`, `updateAionConfigForWorkspace`, and `resetAionVoiceConfig` are all implemented and shipping.

**The chat route is a full agent.** `src/app/api/aion/chat/route.ts` is 465 lines — auth-gated, tier-gated, tool-calling with streaming, rolling summarization, session scope, and vocabulary injection. Not a stub.

**A 5-state onboarding machine is implemented.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route checks `getOnboardingState()` on every greeting and injects per-state instructions into the system prompt (`src/app/api/aion/chat/route/prompts.ts:284`). Greetings for each state are fully written (`prompts.ts:305`).

**`save_voice_config` tool is wired in chat.** `src/app/api/aion/chat/tools/core.ts:118` — Aion calls it automatically when the user describes style, pastes an example, or states rules. Handles `onboarding_complete: true` to advance past `needs_test_draft`.

**`draft_follow_up` tool is wired in chat.** `core.ts:318` — generates a draft against the top-priority deal in the queue, enriched with entity memories. Falls back gracefully: `{ error: 'No deals in the follow-up queue.' }` if the queue is empty.

**BUT: the default voice bypass skips onboarding.** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` — `synthesizeDefaultVoice` auto-generates a reasonable voice from the workspace name. `applyVoiceDefaultIfEmpty` sets `voice_default_derived: true` in memory (not in the DB). `getOnboardingState` returns `'configured'` immediately when `voice_default_derived === true` (`aion-chat-types.ts:248`). So for any fresh workspace, Aion skips the 4-step voice setup entirely.

**Re-entry exists but is buried.** The only way to trigger explicit voice setup is the Sidebar overflow → "Tune Aion's voice" (`AionSidebar.tsx:1043`), which calls `resetAionVoiceConfig`. Most users will never find it.

## Intended state

Daniel opens the Aion page, writes 3 paragraphs about how he talks to clients, and immediately sees a draft that reflects his style. Per the queue item: this is the Phase A goal — voice setup that is discoverable, form-like (paragraphs, not one question at a time), and directly connected to producing a first real draft.

## The gap

- No dedicated voice setup form. Setup is fully conversational — one question per turn across 4 chat turns. "Write 3 paragraphs" doesn't map to the current UX.
- Default voice bypass is silent. Daniel opens Aion, gets a working assistant, and has no signal that a richer voice setup exists or matters.
- Test draft requires a queued deal. When `needs_test_draft` fires, `draft_follow_up` returns an error if the queue is empty — which is likely for a fresh workspace.
- The re-entry affordance ("Tune Aion's voice") is in a settings overflow nobody reads on first visit.

## Options

### Option A: Voice setup form in `/settings/aion`

- **What it is:** Three textareas (description, example, guardrails) on the existing Aion settings page, with a "Save voice" button calling `saveAionVoiceConfig`. A secondary "Generate test draft" button uses the `draft-follow-up` API with a synthetic example context when no real deal exists.
- **Effort:** Small — server actions and the API route already exist. Pure UI work: extend `AionSettingsView.tsx` (~100 lines).
- **Main risk:** Doubles the setup path (form vs. chat). If both exist and diverge, voice state gets confusing.
- **Unlocks:** The "3 paragraphs" experience Daniel described. Also makes voice config auditable and editable without going through chat.

### Option B: First-visit banner in the Aion chat

- **What it is:** When the Aion page loads and `voice_default_derived === true`, render a dismissable banner above the chat: "Aion is using a default voice. Tell me how you write to get better drafts." with a "Set up my voice" chip that sends a synthetic `no_voice` trigger, starting the 4-step flow.
- **Effort:** Small — read `voice_default_derived` from the server component, pass it as a prop to `ChatInterface`, render a chip. No new API surface.
- **Main risk:** Still conversational — 4 turns to complete. The goal was "write 3 paragraphs" not "answer 4 questions."
- **Unlocks:** Discoverability without adding a second settings surface. Keeps everything in chat where the learning loop lives.

### Option C: Onboarding checkpoint before first chat

- **What it is:** Server component reads `aion_config`. If `voice_default_derived === true` and no real chat history exists, render a short inline form (3 textareas) before ChatInterface. On submit, calls `saveAionVoiceConfig`, then immediately calls `draft-follow-up` with a synthetic deal context and shows the draft in the chat as message 1.
- **Effort:** Medium — new server-rendered form state, synthetic deal context for the draft, UI design work to not block entry.
- **Main risk:** Gate-like UX. Users who want to skip voice setup and just use Aion are forced to interact with a form.
- **Unlocks:** Closest to the described goal. Draft appears immediately after the 3 paragraphs, respecting the stated voice.

## Recommendation

Ship Option A first, with Option B as a follow-up.

Option A is the right first step because `saveAionVoiceConfig` and the draft-follow-up route are already built — this is a UI task, not infrastructure. Adding three textareas to the settings page gives Daniel the "3 paragraphs" experience without blocking the Aion chat for users who skip it. It is also the safest path: settings pages are expected places for configuration, and the existing consent/cadence sections of `AionSettingsView.tsx` show the exact layout pattern to follow.

The test-draft gap (empty queue) should be solved by generating the preview against a synthetic deal context instead of requiring a real queued deal. Pass a hardcoded `AionDealContext` stub to `generateFollowUpDraft` in the settings form's server action — enough to show the voice in action without a real pipeline.

Option B (banner) is worth shipping after Option A as a discoverability nudge from within the chat, pointing to the settings form. Together they cover both the "I want to configure this properly" path and the "just tell me as we go" path.

Option C is over-engineered for Phase A. The gate-like UX creates friction at the moment of first value. Do it only if Daniel confirms the priority is specifically the first-session onboarding, not just having a settings form.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — add a `VoiceSetupForm` section above the existing consent toggles. Three textareas: "Your writing style", "Example message", "Rules Aion must follow".
2. Wire the save button to `saveAionVoiceConfig` from `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts`.
3. Add a `previewDraft` server action in `src/app/(dashboard)/settings/aion/` that calls `generateFollowUpDraft` with a stub context (dummy deal title, your workspace name, reason="New lead check-in") — no real deal needed.
4. Render the preview draft inline below the form after save, in a `DraftPreviewCard`-style block.
5. Remove `voice_default_derived` from the returned `AionConfig` in `getAionConfig` once the user saves explicit voice — `saveAionVoiceConfig` already does this (`aion-config-actions.ts:190`), so just confirm it works end-to-end.
6. Add a subtle "Your voice is default" notice on the Aion page when `voice_default_derived === true`, with a link to `/settings/aion`.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `getAionConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:284` — per-state system prompt injections + greetings
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft` (reusable, takes `AionVoiceConfig | null`)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings page to extend
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" re-entry
