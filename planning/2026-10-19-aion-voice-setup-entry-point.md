# Aion Phase A: voice setup entry point and first draft

_Researched: 2026-10-19 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture. Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Goal: Daniel opens the Brain tab, writes 3 paragraphs about how he talks to clients, and immediately sees an Aion-generated follow-up draft that respects that voice.

_Note: the queue item was written against the April 2026 "notable state" in the primer. Both premises have since resolved — the Brain tab is live and `workspaces.aion_config` exists. The real open question is about the entry-point UX to voice setup, not unblocking infrastructure._

## Current state

**`aion_config` is real.** `workspaces.aion_config` is a live JSONB column. `getAionConfigForWorkspace()` reads it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94`. `saveAionVoiceConfig()` writes `{ description, example_message, guardrails }` at line 178.

**The chat route is fully wired.** `/api/aion/chat` at `src/app/api/aion/chat/route.ts` is authenticated, tier-gated, and tool-calling — not a stub. It loads `onboardingState` from `getOnboardingState(config)` on every turn (`route.ts:124`) and injects it into the system prompt.

**The onboarding machine exists.** `aion-chat-types.ts:247` defines a 5-state flow: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` accepts a freeform description, example, and guardrails and writes them via `updateAionConfigForWorkspace`.

**But the bypass fires first.** `synthesizeDefaultVoice()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20` synthesizes a generic voice from the workspace name whenever `aion_config.voice` is empty, and sets `voice_default_derived: true`. `getOnboardingState()` treats that flag as `'configured'` (`aion-chat-types.ts:248`). Result: any workspace that hasn't explicitly saved a voice skips the 4-step onboarding flow entirely. Daniel opens `/aion`, Aion greets him as if voice is already set up.

**Draft generation is ready.** `/api/aion/draft-follow-up` at `src/app/api/aion/draft-follow-up/route.ts` generates voice-aware follow-up drafts. The `draft_preview` content type in `aion-chat-types.ts:176` renders them inline in chat.

**The reset is buried.** `resetAionVoiceConfig()` re-enters onboarding by clearing stored voice and `voice_default_derived`. It's reachable only via `AionSidebar.tsx` overflow menu ("Tune Aion's voice") — not discoverable for a first-time setup.

## Intended state

Daniel opens `/aion` (or a settings page), pastes 3 paragraphs describing how he talks to clients, submits the form, and immediately sees a test draft for a real deal. From that point on, every follow-up draft and every Aion message reflects the stored voice. The `synthesize-default` path remains as a fallback for workspaces that skip setup entirely, but it should not silently swallow the setup intent for a founder who wants to configure it explicitly.

## The gap

- No dedicated voice-setup entry point. The form does not exist anywhere in `/settings/aion/` or on the `/aion` landing.
- The `synthesizeDefaultVoice` bypass fires before the user gets a chance to set their voice — Aion starts `configured` with a generic placeholder.
- The sidebar "Tune Aion's voice" reset exists but is invisible on a first visit and requires knowing to look.
- The full flow (paste description → save voice → see test draft) requires 3 separate plumbing steps that aren't connected end-to-end.

## Options

### Option A: Chat chip that leads into conversational setup

- **What it is:** On the `/aion` landing, when `voice_default_derived` is true, show a prominent chip: "Set up how Aion writes for you." Tapping it calls `resetAionVoiceConfig`, then fires a pre-seeded user message that kicks off the 4-step onboarding flow already in the chat route.
- **Effort:** Small — one chip component + one action call. No new server-side logic.
- **Main risk:** Multi-turn. A user who pastes one paragraph and closes the tab finishes at `no_example`, saving partial voice. Onboarding is designed for Q&A, not paste-and-go.
- **Unlocks:** First-use voice setup without a form page.

### Option B: Standalone voice-setup form with immediate test draft

- **What it is:** A `VoiceSetupForm` in `src/app/(dashboard)/settings/aion/` with three fields (description textarea, example message, guardrails). On submit, it calls `saveAionVoiceConfig`, then immediately calls `generateFollowUpDraft` against the top deal in the follow-up queue, and displays the draft inline. The `AionSidebar` "Tune Aion's voice" links to this page instead of silently resetting.
- **Effort:** Medium — new UI component, one server action that chains save → draft, inline draft rendering.
- **Main risk:** Test draft requires a deal in the follow-up queue. If the queue is empty (fresh workspace), the draft step fails silently. Fallback: generate a canned demo using the example_message field itself so the user still sees the voice reflected.
- **Unlocks:** Paste-and-go voice setup, immediate payoff, all three fields in one view.

### Option C: Voice-setup section inside AionSettingsView

- **What it is:** Add a collapsible "Voice" section to the existing `AionSettingsView` at `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`. Three inline textareas (description, example, guardrails) that save on blur via `saveAionVoiceConfig`. No test-draft step.
- **Effort:** Small-medium — inline form, no new route, no draft call.
- **Main risk:** No immediate feedback loop. Daniel saves a voice but never sees what it produces until the next real follow-up draft fires from a deal card.
- **Unlocks:** Voice is editable in settings; users can iterate without a dedicated page.

## Recommendation

**Option B.** The queue item's specific goal is "write 3 paragraphs → immediately see a test draft." That feedback loop is what makes voice setup feel real rather than theoretical. Options A and C skip the draft step — A is multi-turn, C is edit-only. Option B is the only path that closes the loop in one session.

The empty-queue fallback is easy to handle: if `getFollowUpQueue` returns nothing, skip the draft and show a static demo sentence built from `example_message` or `synthesizeDefaultVoice`. That's a five-line conditional, not a design decision.

The tradeoff is a medium-effort build: one form component, one chained server action, one inline result display. But everything it calls already exists. There's no net-new API work — just connecting three pieces that are currently unconnected.

After Option B ships: the `synthesizeDefaultVoice` bypass can stay as-is for workspaces that never open settings. For workspaces that submit the form, `voice_default_derived` gets cleared by `saveAionVoiceConfig` (it strips the flag at line 191), so the onboarding state machine moves to `configured` properly from then on.

## Next steps for Daniel

1. Create `src/app/(dashboard)/settings/aion/VoiceSetupForm.tsx` — three textareas (`description`, `example_message`, `guardrails`), a submit button, and an inline draft-result area. Use `StagePanel` + `stage-panel` pattern for the form card.
2. Add a `saveVoiceAndGetTestDraft(voice: AionVoiceConfig, workspaceId: string)` server action in the same directory. Steps: call `saveAionVoiceConfig(voice)`, then call `getFollowUpQueue(workspaceId, limit=1)` to find a deal, then POST to `/api/aion/draft-follow-up` with that deal's context.
3. If queue is empty, fall back to a `DraftResult` built from `{ draft: voice.example_message, channel: 'email' }` so the form always shows something.
4. Mount `VoiceSetupForm` inside `AionSettingsView` (above the beta toggle section) — only show it when `aion_config.voice_default_derived === true` (not yet configured) or when the user expands a "Voice" disclosure panel.
5. Update `AionSidebar.tsx`'s "Tune Aion's voice" overflow item to navigate to `/settings/aion#voice` instead of calling `resetAionVoiceConfig` in place.
6. Wire the inline draft display using the existing `DraftPreviewCard` component from `src/app/(dashboard)/(features)/aion/components/` so the result renders consistently with how drafts look in chat.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94,178` — `getAionConfig`, `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20,35` — `synthesizeDefaultVoice`, bypass logic
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, 5-state machine
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/draft-follow-up/route.ts` — authenticated draft generation
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, voice injection into prompt
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — mount point for the form
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx` — "Tune Aion's voice" overflow item
