# Aion Phase A — current status and remaining gap

_Researched: 2026-10-11 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of
`docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab
is currently paused and `public.workspaces.aion_config` doesn't exist, what's
the minimum path to unblock voice setup + first real draft? Context: the goal is
to have Daniel open the Brain tab, write 3 paragraphs about how he talks to
clients, and immediately see an Aion-generated follow-up draft that respects that
voice.

_Note: this queue item was written in April 2026. The research below reflects the
state of the codebase as of October 2026. Most of the premises in the question no
longer hold — Phase A has largely shipped. This doc scopes what actually remains._

## Current state

`public.workspaces.aion_config` exists and is actively used.
`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` defines
the `AionConfig` type with `voice`, `learned`, `follow_up_playbook`,
`onboarding_state`, `kill_switch`, `learn_owner_cadence`, and
`voice_default_derived`.

`/api/aion/chat/route.ts` is a full production chat API (465 lines, auth, rate
limiting, streaming, model routing, tool calling, token accounting, session
summarization). Not a stub.

`AionInput.tsx` and `AionVoice.tsx` are both functional
(`src/app/(dashboard)/(features)/aion/components/`).

`/api/aion/draft-follow-up/route.ts` is complete and authenticated. It calls
`generateFollowUpDraft` (`src/app/api/aion/lib/generate-draft.ts:26`), which
already injects the workspace voice config into every draft prompt
(`generate-draft.ts:63–75`).

A **5-state onboarding machine** exists
(`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257`):
`no_voice → no_example → no_guardrails → needs_test_draft → configured`.
The chat route reads this state and the system prompt surfaces it to the model
(`src/app/api/aion/chat/route/prompts.ts:101`).

A **derived default voice** is synthesized from the workspace name on every read
(`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45`),
meaning new workspaces skip the 4-step forcing block automatically and reach
`configured` immediately. Owners who want to retune use the "Tune Aion's voice"
overflow in `AionSidebar`, which calls `resetAionVoiceConfig` to re-enter the
conversational flow.

`/api/aion/learn-from-edit/route.ts` extracts vocabulary swaps and patterns from
draft edits and persists them back to `aion_config.learned`.

## Intended state

The queue item's goal: Daniel opens the Aion tab, writes 3 paragraphs about how he
talks to clients, and immediately sees a draft that respects that voice.

The conversational onboarding machine exists and reaches `needs_test_draft` after
the user completes the three voice fields. At that point the model is instructed to
offer a test draft. The path works but requires 3 conversational turns plus a
fourth asking for the draft — five interactions before the payoff moment.

The intended experience is more direct: paste voice description, see draft. A
settings-style form with immediate feedback would collapse that to a single action.

## The gap

- No dedicated form UI for voice configuration. The only GUI path to set `voice.description`,
  `voice.example_message`, and `voice.guardrails` is a 4-step conversational flow
  (or direct JSON editing, which Daniel doesn't have access to).
- The `/settings/aion` page (`AionSettingsView.tsx`) covers beta consent and
  cadence learning but has no voice configuration panel.
- The sidebar "Tune Aion's voice" overflow resets the voice and re-enters the same
  4-step conversational flow — no form, no draft preview.
- `needs_test_draft` state triggers a test draft offer via chat, not an immediate
  side-by-side preview tied to the voice fields.

## Options

### Option A: Expose a voice settings form in /settings/aion

- **What it is:** Add a "Voice" section to `AionSettingsView` with three labeled
  textareas (description, example message, guardrails) that call `saveAionVoiceConfig`
  on save. Add a "Generate test draft" button that POSTs to
  `/api/aion/draft-follow-up` with a synthetic deal context and shows the result
  inline.
- **Effort:** small — server actions and route already exist, this is a UI form only.
- **Main risk:** The test draft needs a deal context to be useful; a synthetic fixture
  may feel hollow. Real value comes only after the workspace has a live deal to
  reference.
- **Unlocks:** Immediate voice-to-draft feedback loop without entering the chat.
  Sidebar "Tune Aion's voice" can link to this page instead of resetting via chat.

### Option B: Keep conversational onboarding, reduce friction to the draft moment

- **What it is:** Keep the chat-driven flow but surface a persistent "Set up Aion's
  voice" chip in the landing state of the chat page (not buried in sidebar overflow).
  Pair with a `needs_test_draft` trigger that emits a `draft_preview` structured block
  automatically once all three fields are set, without requiring the user to ask.
- **Effort:** small — `ChatInterface` landing state + onboarding state machine
  already exists. Add the auto-emit at `needs_test_draft` entry.
- **Main risk:** Draft still arrives after 4 conversational turns, not instantly.
  Some users won't recognize the value until they see the draft and may drop off
  during the onboarding questions.
- **Unlocks:** Onboarding path feels intentional and guided without adding a second
  UI surface for voice configuration.

### Option C: Add a voice setup modal triggered from the first chat session

- **What it is:** On first open of `/aion` (when `voice_default_derived === true`
  and the user hasn't explicitly set a voice), show a modal with a single textarea:
  "Describe how you write to clients." On submit, POST to a new `/api/aion/voice-setup`
  route that uses the input to populate all three voice fields via LLM extraction
  and returns a live draft.
- **Effort:** medium — new API route, modal component, LLM extraction prompt.
- **Main risk:** LLM extraction of structured fields from free-form text adds latency
  and a failure mode. Three separate fields are clearer than one ambiguous prompt.
- **Unlocks:** The specific "3 paragraphs → immediate draft" experience from the
  queue item. Most opinionated design, highest wow-moment potential.

## Recommendation

**Build Option A.** It is the lowest-effort path that delivers the queue item's
goal. All server infrastructure exists. The form writes directly to
`saveAionVoiceConfig` (already tested), and the "generate test draft" button
uses the existing `/api/aion/draft-follow-up` route with a minimal synthetic
context. The settings page is the right home — it's where an owner goes to
configure workspace-level behavior.

Option B is a good follow-on once the form exists (surfacing onboarding from the
landing state is always worth doing), but it doesn't resolve the immediate form
gap. Option C is appealing but adds complexity (LLM extraction, new route, modal
state) for a feature that Option A delivers more simply.

Accept the limitation that the test draft uses a synthetic deal context. The
value of voice setup is seeing your words reflected back — deal specifics are
secondary to that first impression.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` and add a "Voice"
   `StagePanel` section below the beta status panel — three `<textarea>` fields for
   description, example message, and guardrails.
2. Wire the Save button to `saveAionVoiceConfig` from
   `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts`.
3. Add a "Generate test draft" button that POSTs to `/api/aion/draft-follow-up` with
   a hardcoded synthetic deal context (e.g., `{ followUp: { reason: "proposal sent 5 days ago" }, deal: { title: "Test show" } }`).
4. Render the returned draft inline below the form in a read-only textarea.
5. Update the sidebar "Tune Aion's voice" overflow in `AionSidebar.tsx` to navigate
   to `/settings/aion#voice` instead of (or in addition to) calling
   `resetAionVoiceConfig`.
6. Optionally: suppress the `needs_test_draft` conversational state in the chat
   route (`aion-chat-types.ts:getOnboardingState`) once the settings form exists.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`,
  `saveAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`,
  `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState`, `getOnboardingState`
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — existing draft route
- `src/app/api/aion/chat/route/prompts.ts:97` — voice config injection into system prompt
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page to extend
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx` — sidebar overflow menu
