# Aion voice onboarding: first-run path to a real draft

_Researched: 2026-11-17 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How I understood it:** This is a seed question written against the April 2026 state of the codebase. Both premises are now false: the Brain tab is live and `aion_config` exists. The real question is: given the full infrastructure is shipped, why can't a new user open the Brain tab, describe their voice, and immediately get a draft — and what's the minimum fix?

## Current state

**`aion_config` is live.** `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94` queries `workspaces.aion_config` and types it as `AionConfig` — a JSONB column holding `voice: AionVoiceConfig`, `learned`, `follow_up_playbook`, `kill_switch`, `learn_owner_cadence`, `voice_default_derived`.

**Brain tab is live.** `src/app/(dashboard)/aion/AionPageClient.tsx:73` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />`. No paused state. The `/api/aion/chat/route.ts` is a full implementation: auth, rate-limiting, model routing, tool assembly, streaming.

**Voice onboarding state machine exists.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` defines five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route checks this state at line 124 and passes it to `buildGreeting` (cold-open) and `buildSystemPrompt`.

**Draft generation is live.** `src/app/api/aion/draft-follow-up/route.ts:53` loads `aionConfig.voice` and calls `generateFollowUpDraft`. The prompt builder at `src/app/api/aion/lib/generate-draft.ts:62` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt.

**Learn-from-edit is live.** `src/app/api/aion/learn-from-edit/route.ts` extracts vocabulary swaps and patterns from draft edits and writes them to `aionConfig.learned`.

**The bypass that breaks the flow.** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35`: `applyVoiceDefaultIfEmpty` synthesizes a voice from the workspace name on every config read and sets `voice_default_derived: true`. Then `aion-chat-types.ts:248`: `if (config.voice_default_derived === true) return 'configured'` — the onboarding state machine is skipped entirely. New workspaces never see the voice setup walk-through.

**Re-entry path exists but is buried.** `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:31` imports `resetAionVoiceConfig` and surfaces it via a sidebar header overflow menu. No first-run prompt, no visible call-to-action from the Brain page.

## Intended state

A new user (or Daniel on a fresh workspace) opens the Brain tab. Aion greets them, runs the 4-step voice walk-through (describe your style → give an example → set guardrails → see a test draft), and exits onboarding with a voice-informed draft in view. The existing state machine handles this correctly — it just never fires because the synthesized default bypasses it.

## The gap

- New workspaces receive a synthesized default voice on first read (`voice_default_derived: true`), skipping onboarding silently.
- No first-run prompt on the Brain page tells the user their voice is a placeholder.
- "Tune Aion's voice" (the re-entry affordance) is in a sidebar overflow — invisible to someone who hasn't explored the UI.
- The `needs_test_draft` state never emits a `draft_preview` message; there's no code in the chat route that auto-fires a draft when onboarding completes.

## Options

### Option A: First-run banner on the Brain page
- **What it is:** When `voice_default_derived === true`, render a dismissible top-of-chat banner ("Aion is using a placeholder voice — take 2 minutes to tune it"). Button calls `resetAionVoiceConfig()` server action and refreshes the page, dropping the user into the `no_voice` onboarding state. The existing 4-step chat flow handles everything after that.
- **Effort:** Small — one new component (~40 lines), one server prop check, no new API routes or DB changes.
- **Main risk:** User dismisses the banner, never tunes voice, gets mediocre drafts silently. The banner needs to be hard to miss without being annoying.
- **Unlocks:** The existing onboarding machine runs end-to-end. Users who complete it get to `needs_test_draft`, which can auto-fire a draft for any queued deal.

### Option B: Voice setup form in Settings
- **What it is:** Add three textarea fields (`description`, `example_message`, `guardrails`) to the existing `/settings/aion` page, wired to `saveAionVoiceConfig`. No chat interaction required — fill the form, save, done.
- **Effort:** Small-medium — the save action exists, the type is defined, the page exists. Add a `VoiceConfigForm` section (~80 lines).
- **Main risk:** Decouples voice setup from the chat experience entirely. The queue item's specific goal — "write 3 paragraphs, see a draft" — becomes "fill a form, go to events, tap Draft". Less cohesive.
- **Unlocks:** Every user with settings access can configure voice without going through chat. Good for teams where admins set voice policy workspace-wide.

### Option C: Wire `needs_test_draft` to auto-fire a draft
- **What it is:** When `getOnboardingState` returns `needs_test_draft` and `ops.follow_up_queue` has at least one deal, the chat greeting calls `generateFollowUpDraft` for the top-priority deal and embeds the result as a `draft_preview` message in the greeting response.
- **Effort:** Medium — requires changes to `buildGreeting`, the greeting chat types, and the `draft_preview` rendering path to handle a greeting-embedded draft.
- **Main risk:** Adds complexity to the greeting path. If the follow-up queue is empty (new workspace), this silently does nothing. Depends on Option A or B to even reach `needs_test_draft`.
- **Unlocks:** The specific "open Brain tab, see a draft" UX the queue item describes. Best paired with Option A.

## Recommendation

Ship Option A, then Option C as a fast follow.

Option A is the minimum fix: one banner component, one `voice_default_derived` prop check, no schema changes. It re-enters the existing state machine that was built for exactly this flow. The 4-step chat walk-through is already implemented and tested; the only missing piece was the entry point.

Option B solves a real need (admin-controlled workspace voice) but doesn't deliver the in-chat experience the queue item describes. Ship it after A, not instead of it.

Option C delivers the specific "open Brain, see a draft immediately" moment — but only after A establishes the voice. It's a one-turn enhancement to the greeting path once onboarding completes. Worth shipping in the same week as A once the voice flow is confirmed working.

Tradeoff accepted: the banner approach means users can dismiss and never tune voice. That's fine for now — the synthesized default is good enough to generate acceptable drafts. The banner makes the gap visible without forcing a wall.

## Next steps for Daniel

1. Open `src/app/(dashboard)/aion/AionPageClient.tsx` — add a server action call to fetch `aionConfig.voice_default_derived` and pass it as a prop to a new `VoiceSetupPrompt` component.
2. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupPrompt.tsx` — a dismissible banner that calls `resetAionVoiceConfig()` on click and does `router.refresh()`.
3. Verify that after `resetAionVoiceConfig()`, `getOnboardingState` returns `no_voice` (it should — the helper strips `voice` and `voice_default_derived` from the config).
4. Open a fresh workspace (or temporarily null out `aion_config` in the SQL editor) and walk through the 4-step chat flow to confirm it reaches `needs_test_draft`.
5. Once voice is configured, test `POST /api/aion/draft-follow-up` directly (use the network tab on the follow-up card) and confirm the voice fields appear in the draft.
6. After A is confirmed, wire Option C: in `buildGreeting` when `onboardingState === 'needs_test_draft'`, call `generateFollowUpDraft` for the top queue item and return a `draft_preview` message.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `OnboardingState`, `getOnboardingState`, `draft_preview` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `resetAionVoiceConfig`, `AionVoiceConfig` type
- `src/app/api/aion/chat/route.ts:124` — `getOnboardingState` call in route
- `src/app/api/aion/chat/route/prompts.ts` — `buildGreeting`, `buildSystemPrompt` with onboarding state injection
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt` voice injection
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain page entry point
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:31` — existing "Tune Aion's voice" re-entry
