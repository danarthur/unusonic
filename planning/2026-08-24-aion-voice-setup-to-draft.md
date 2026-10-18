# Aion voice setup to first draft — unblocking the teaching flow

_Researched: 2026-08-24 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: The queue item was written against an April 2026 baseline. This research restates the question for the current August 2026 codebase, which is significantly ahead of that baseline._

## Current state

**The Brain tab is not paused.** `AionPageClient.tsx:73` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />` — no paused-state banner in the code.

**`aion_config` exists.** `aion-config-actions.ts:89-99` reads `workspaces.aion_config` (a JSONB column) on every request. The `AionConfig` type (`aion-config-actions.ts:50-74`) covers `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch`.

**Voice config infrastructure is complete.** `saveAionVoiceConfig()` (`aion-config-actions.ts:178`), `resetAionVoiceConfig()` (`aion-config-actions.ts:214`), and `synthesizeDefaultVoice()` (`aion-config-helpers.ts:20`) all exist. `synthesizeDefaultVoice` builds a default voice from the workspace name so new workspaces function immediately without onboarding.

**A 5-state onboarding machine exists.** `aion-chat-types.ts:225-257` defines `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` (`prompts.ts:292-338`) returns a different conversational greeting for each state. The system prompt tells Aion to call `save_voice_config` at each step.

**`save_voice_config` and `draft_follow_up` are registered chat tools.** `core.ts:118` defines `save_voice_config` (saves voice fields, marks onboarding complete). `core.ts:318` defines `draft_follow_up` — loads the top deal from the queue, enriches with memory + playbook rules, calls `generateFollowUpDraft()`, and returns a `draft_preview` message block.

**`generateFollowUpDraft()` injects voice.** `generate-draft.ts:55-76` builds a system prompt that includes `voice.description`, `voice.example_message`, and `voice.guardrails` when present.

**The critical bypass:** `aion-chat-types.ts:248` returns `'configured'` when `voice_default_derived === true` — meaning any workspace with no explicitly saved voice skips the 4-step teaching flow silently. `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35`) sets this flag on every read when no voice is stored.

## Intended state

Daniel opens the Brain tab, is clearly invited to teach Aion his communication style, writes 3 paragraphs across a short conversational flow (voice description → example message → guardrails), and immediately sees Aion draft a real follow-up for a live deal using that voice.

The infrastructure for this exists end-to-end. What's missing is a prominent, discoverable entry point into the 4-step flow for workspaces whose voice was synthesized rather than taught.

## The gap

- `voice_default_derived: true` bypasses the onboarding flow — no entry point is surfaced for workspaces that haven't set an explicit voice
- The only path to the teaching flow is via "Tune Aion's voice" in the AionSidebar overflow (`AionSidebar.tsx` imports `resetAionVoiceConfig`) — invisible to a first-time user
- `AionLandingStarters.tsx:48-52` has `NEW_WORKSPACE_STARTERS` but no "Set up voice" CTA for the `voice_default_derived` case
- There is no automatic draft trigger at the end of voice setup; the user must separately ask for a draft (though `needs_test_draft` greeting at `prompts.ts:329` does offer chips for this)

## Options

### Option A: Voice-setup starter in AionLandingStarters
- **What it is:** Pass a `showVoiceTuning` boolean into `AionLandingStarters` when the workspace's voice is synthesized (not explicitly saved). Render a fifth CTA — "Teach Aion how you talk to clients." Clicking it calls `resetAionVoiceConfig()` then `startNewChat()`. The new chat hits `messages.length === 0` with `no_voice` state and returns the explicit onboarding greeting. The 4-step flow runs; at `needs_test_draft`, Aion offers a test draft automatically via the existing chips.
- **Effort:** Small — two touches: `AionLandingStarters` (new prop + CTA), `ChatInterface` (reset-then-new-chat handler). No DB changes, no new API routes.
- **Main risk:** `ChatInterface` needs to know `voice_default_derived` from somewhere. Current architecture fetches config server-side in the API route; `ChatInterface` doesn't hold it client-side. Requires a small `getAionConfig()` server action call in the page shell or a dedicated GET endpoint.
- **Unlocks:** The full "3 paragraphs → immediate draft" path, discoverable from the landing state.

### Option B: Voice form in settings
- **What it is:** Add a "Voice and communication style" section to `/settings/aion` with three textareas (`AionVoiceConfig` fields). Submit calls `saveAionVoiceConfig()`. A "Generate test draft" button calls `/api/aion/draft-follow-up` against the top queue deal and renders the draft inline.
- **Effort:** Small-medium — form UI, server action wiring, inline draft preview component.
- **Main risk:** Creates two places to configure voice (chat onboarding + settings form). Users who've been told to "tell Aion your style" in chat find a separate form in settings confusing. Also bypasses the conversational teaching pattern where Aion asks one question at a time.
- **Unlocks:** Admin bulk-edit; faster if Daniel prefers forms to chat.

### Option C: Sidebar banner when voice is synthesized
- **What it is:** Add a dismissible banner inside `AionSidebar` when `voice_default_derived === true`. Copy: "Aion is using a default voice — teach it your style." Clicking calls `resetAionVoiceConfig()` + opens a new chat, same as Option A.
- **Effort:** Small — one banner component in AionSidebar; same config-reading problem as Option A.
- **Main risk:** Sidebar may not be open on first visit. The banner is in the path of users who already use Aion, not new users who land on the empty state.
- **Unlocks:** Same as Option A, but discovery is lower.

## Recommendation

**Go with Option A.** The conversational 4-step flow already works end-to-end — `save_voice_config`, `draft_follow_up`, and the `needs_test_draft` greeting are all wired. The only missing piece is a visible entry point from the landing state. Adding a "Teach Aion how you talk to clients" starter to `AionLandingStarters` puts the action exactly where a first-time user looks.

The one implementation detail to solve first: how does `AionLandingStarters` know whether `voice_default_derived` is true? The cleanest path is a server component in the `/aion` page shell that calls `getAionConfig()` and passes `voiceIsDerived: boolean` down to `AionPageClient`, which passes it to `ChatInterface`, which passes it to `AionLandingStarters`. This is a prop-thread through 3 components — no new API routes or DB changes.

Accept the tradeoff that some workspaces with an explicitly set voice (but not many deals) may still see a `needs_test_draft` greeting with no queue — the `draft_follow_up` tool handles the `queue.length === 0` case gracefully (returns an error the model surfaces as "no deals in queue yet").

## Next steps for Daniel

1. In `src/app/(dashboard)/aion/page.tsx` (the server page that wraps `AionPageClient`), call `getAionConfig()` and pass `voiceIsDerived={config.voice_default_derived === true}` to `AionPageClient`.
2. In `AionPageClient.tsx:66`, accept `voiceIsDerived` and forward it to `<ChatInterface>`.
3. In `ChatInterface.tsx:78`, accept `voiceIsDerived` and pass it to `<AionLandingStarters showVoiceTuning={voiceIsDerived} ...>`.
4. In `AionLandingStarters.tsx:65`, add a `showVoiceTuning?: boolean` prop. When true, prepend a CTA: `{ label: 'Teach Aion how you talk to clients', value: '__reset_voice__' }`.
5. In `ChatInterface`, intercept the `__reset_voice__` sentinel value in the `onStart` handler: call `resetAionVoiceConfig()` (server action), then call `startNewChat()`. The new chat will hit `no_voice` state.
6. Verify the full path in dev: open `/aion` fresh → see the CTA → click it → confirm Aion asks about communication style → complete all 3 steps → confirm Aion offers a test draft chip → click it → confirm the draft respects the voice you just entered.

## References

- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab shell
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — voice config CRUD
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — onboarding state machine
- `src/app/api/aion/chat/route/prompts.ts:292-338` — `buildGreeting` per state
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — voice injection into draft prompt
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` — CTA landing pane
