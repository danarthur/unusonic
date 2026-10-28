# Aion Phase A: voice setup + first real draft

_Researched: 2026-10-28 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**This question's April 2026 premise is now outdated.** The infrastructure described as "missing" has largely shipped. The real question is narrower: what's the UX gap that stops Daniel from writing a voice description and immediately seeing a voice-aware draft.

What already exists:

- `public.workspaces.aion_config` exists and is read/written. `getAionConfig()` reads it at `aion-config-actions.ts:84`; `saveAionVoiceConfig()` writes it at `:178`.
- `/api/aion/chat/route.ts` is a 464-line production implementation — streaming, tool-calling, model routing, session scope. Not a stub.
- A 5-state onboarding machine is live in `aion-chat-types.ts:247`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat greetings implement each state at `prompts.ts:310–346`.
- `generateFollowUpDraft()` at `generate-draft.ts:25` is implemented and injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the LLM system prompt.
- `learn-from-edit/route.ts` extracts vocabulary swaps from draft edits.
- A "Tune Aion's voice" affordance exists in the sidebar overflow menu (`AionSidebar.tsx:998`) — it calls `resetAionVoiceConfig()` to clear the stored voice and re-enter the onboarding flow.

**What breaks the goal today:**

1. **The default-voice bypass.** `applyVoiceDefaultIfEmpty()` synthesizes a voice from the workspace name on every fresh workspace and sets `voice_default_derived: true`. `getOnboardingState()` at `aion-chat-types.ts:248` returns `'configured'` immediately when that flag is set. Daniel will never see the onboarding unless he knows to click "Tune Aion's voice" in the sidebar — a hidden affordance with no signpost.

2. **No dedicated voice form.** Voice setup is purely conversational — the chat asks one question at a time. Daniel has no surface where he can write 3 paragraphs at once and immediately fire a test draft.

3. **`needs_test_draft` requires active deals.** The test-draft greeting (`prompts.ts:338`) says "let me draft a message for one of your active deals" — it calls the `draft_follow_up` tool, which requires a deal context (`AionDealContext`). An empty workspace gets a chat offer but no follow-through.

4. **`/settings/aion` has no voice fields.** The settings page (`AionSettingsView.tsx`) shows only deal card beta consent and cadence opt-in — voice config is invisible to users who look there first.

## Intended state

Daniel opens the Aion page, is prompted to set his voice (or finds an obvious place to do so in settings), writes a description + example in one sitting, hits "generate test draft", picks a deal, and sees a draft immediately. The system transitions to `configured` after that interaction.

## The gap

- No dedicated voice setup form — chat-only, one field at a time
- `voice_default_derived` bypass silently skips onboarding for new workspaces — no signpost to "Tune Aion's voice"
- Settings page has no voice section
- Test draft in chat requires deal context; no fallback for an empty workspace

## Options

### Option A: Settings form (add voice fields to `/settings/aion`)

- **What it is:** Add a `VoiceConfigForm` section to `AionSettingsView` with three textareas (description, example, guardrails), wired to `saveAionVoiceConfig`. Add a "Generate test draft" button that calls `/api/aion/draft-follow-up` using the workspace's most recent deal, then renders the draft inline.
- **Effort:** Small. One new component, one existing server action, one existing API route. No schema work.
- **Main risk:** The test draft button is contextless — it picks the most recent deal automatically, which may not be representative. User might be confused by an unfamiliar deal appearing.
- **Unlocks:** A clear, intentional surface for voice config that doesn't rely on the chat discovery path. Pairs well with the existing sidebar "Tune Aion's voice" affordance.

### Option B: First-chat onboarding modal (collect all 3 fields at once)

- **What it is:** When onboarding state is `no_voice` (after stripping the `voice_default_derived` bypass), show a one-time overlay/wizard that collects all three fields in a single form instead of spreading them across three chat turns. On submit, call `saveAionVoiceConfig`, then immediately render a draft preview in the same modal.
- **Effort:** Medium. New modal component, new client-side logic to detect onboarding state, needs the chat page to know when to show it (server action or context fetch on mount).
- **Main risk:** Two surfaces for the same data (the chat + the modal) — the onboarding machine would need to be bypassed when the modal path is used. Risk of drift between the two flows.
- **Unlocks:** The "3 paragraphs → immediate draft" UX the question describes, exactly.

### Option C: Remove the `voice_default_derived` bypass + accept the chat flow

- **What it is:** Don't build any new UI. Instead remove (or gate) the `voice_default_derived` shortcut so new workspaces are always sent through the 4-step chat onboarding. Document to Daniel that the chat IS the voice setup surface.
- **Effort:** Tiny — one-line change in `aion-chat-types.ts:248`.
- **Main risk:** New users hit the onboarding sequence cold, which is a rougher experience than having a default voice. Also, the chat still collects fields one at a time — not "write 3 paragraphs at once". The original goal isn't met.
- **Unlocks:** Nothing new — it just removes a bypass that was added to improve new-user experience.

## Recommendation

**Option A.** Add voice fields to the settings page. It is the smallest, most contained change, and it produces the outcome Daniel asked for without touching the chat onboarding state machine or the `voice_default_derived` logic (both of which are load-bearing).

The specific UX path:

1. Daniel visits `/settings/aion` (or follows a link from the sidebar overflow).
2. He fills in description, example, guardrails — a flat form, not a 3-turn conversation.
3. He clicks "Try a draft" — the form calls `saveAionVoiceConfig`, then calls `/api/aion/draft-follow-up` with the workspace's most recent deal.
4. The draft renders inline. He edits it. The edit fires `learn-from-edit` as a fire-and-forget.

This does not require removing the `voice_default_derived` bypass (it's useful for the ambient chat experience). It makes voice config discoverable without depending on users finding the hidden sidebar sliders menu. The test draft button should label itself "Try it on a recent deal" so the auto-selection of a deal doesn't surprise anyone.

The chat-based 4-step flow remains intact and valid for users who prefer it. Option A adds a form path alongside it, not instead of it.

## Next steps for Daniel

1. Create `src/app/(dashboard)/settings/aion/VoiceConfigForm.tsx` — three `<textarea>` fields wired to `saveAionVoiceConfig` from `aion-config-actions.ts`. Read existing values from `getAionConfig()` in the page's server component and pass as initial props.
2. Add a "Your voice" section to `AionSettingsView.tsx` (after the beta status card) that renders `VoiceConfigForm`.
3. Add a "Try a draft" button to `VoiceConfigForm`. On click: call `POST /api/aion/draft-follow-up` with the workspace's most recent deal id (fetched on the server alongside the settings data). Render the `draft` string inline below the form.
4. Update the settings page server component (`src/app/(dashboard)/settings/aion/page.tsx`) to also fetch `getAionConfig()` and pass `voice` as a prop.
5. (Optional) Add a link to the settings form from the sidebar "Tune Aion's voice" menu item, rather than just resetting voice — so the click lands Daniel on the settings form instead of clearing everything silently.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `getAionConfig`, `AionVoiceConfig` type
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — onboarding state machine
- `src/app/api/aion/lib/generate-draft.ts:25` — `generateFollowUpDraft`, voice injection
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998` — existing "Tune Aion's voice" affordance
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page, voice section goes here
- `src/app/api/aion/draft-follow-up/route.ts` — existing draft endpoint to call from the form
