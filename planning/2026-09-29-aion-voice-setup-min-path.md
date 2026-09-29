# Aion voice setup: minimum path to first real draft

_Researched: 2026-09-29 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the premise is 5 months out of date. This research re-states the actual current state before scoping next steps._

## Current state

**The Brain tab is active.** `src/app/(dashboard)/aion/AionPageClient.tsx:66` renders `ChatInterface` directly with no paused-state guard. The primer's note that it was paused refers to a state from April 2026.

**`aion_config` exists.** `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:90-99` reads `public.workspaces.aion_config` (a JSONB column). `saveAionVoiceConfig` (line 178) and `updateAionConfigForWorkspace` (line 262) write to it via the system client. The column is live.

**A 5-state onboarding machine is fully wired.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` defines `OnboardingState` (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) and `getOnboardingState()`. The chat route's `buildSystemPrompt` (`src/app/api/aion/chat/route/prompts.ts:284-292`) and `buildGreeting` (line 301) handle all 5 states with distinct copy and suggestion chips.

**But the onboarding is silently bypassed for all workspaces.** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` — `applyVoiceDefaultIfEmpty()` synthesizes a voice from the workspace name on every read and sets `voice_default_derived: true`. `getOnboardingState()` returns `'configured'` immediately when that flag is set (line 248). New workspaces land in the pull-mode greeting, never the voice setup greeting.

**The draft pipeline is end-to-end wired.** `src/app/api/aion/draft-follow-up/route.ts:60-63` calls `generateFollowUpDraft` with `aionConfig.voice`. `src/app/api/aion/chat/tools/core.ts:318-344` exposes `draft_follow_up` as a chat tool backed by `getDealContextForAion` — Aion can call this during onboarding step 4 (`needs_test_draft`).

**The re-entry path exists but is buried.** `resetAionVoiceConfig` (`aion-config-actions.ts:214`) clears the stored voice so the next read re-synthesizes and presents `no_voice`. It is surfaced as "Tune Aion's voice" in the `AionSidebar` overflow (line 31 imports it).

## Intended state

Daniel opens Aion, sees a prompt asking how he talks to clients, writes a few paragraphs (style + example + guardrails), and the system immediately generates a follow-up draft for his top queued deal using that voice. The experience should feel like one flow, not a settings-then-chat detour.

The 4-turn conversational flow already covers this: greeting → describe style → paste example → add guardrails → test draft. The machinery works. The only missing piece is discoverability: a new workspace today goes straight to pull-mode without ever offering the setup path.

## The gap

- New workspaces receive a synthesized default voice and skip onboarding entirely — no user is aware this happened.
- Re-entry ("Tune Aion's voice") is a secondary overflow item in the session sidebar; owners who don't know to look there never find it.
- There is no affordance in the landing greeting for `configured + voice_default_derived` that says "your voice is a placeholder — want to set it up for real?"
- The `AionSettingsView` (`/settings/aion`) handles consent and cadence opt-in, but has no voice setup form.

## Options

### Option A: Voice-setup chip in the landing greeting

- **What it is:** When `buildGreeting` renders the `configured` state AND `config.voice_default_derived === true`, emit one extra suggestion chip — "Tell Aion how you actually write." Tapping it calls `resetAionVoiceConfig` on the client (a thin server action call) then `startNewChat()`. The new chat opens with `no_voice` greeting and the 4-turn setup flow proceeds.
- **Effort:** Small. One chip added to the greeting builder in `prompts.ts`. One client-side chip handler in `ChatInterface` or `AionLandingStarters`. No new components.
- **Main risk:** The chip disappears after the user completes setup once (as intended), but re-appears if they ever reset. This is correct behavior, but may confuse a user who set up voice and then reset it expecting a blank slate.
- **Unlocks:** The exact flow the queue item describes, with zero new surfaces.

### Option B: Structured voice setup form in Settings

- **What it is:** Add a "Voice setup" section to `/settings/aion` with three textarea fields (`description`, `example_message`, `guardrails`) wired to `saveAionVoiceConfig`. After save, redirect to `/aion?triggerDraft=1`. The Aion page detects that param, sends a synthetic message, and the chat route (seeing `needs_test_draft`) generates and streams the first draft.
- **Effort:** Medium. New settings section (UI component, ~100 lines), a URL-param handler in `AionPageClient`, and a synthetic message in `ChatInterface` for the draft trigger.
- **Main risk:** The "3 paragraphs" textarea framing isn't the same UX as the conversational onboarding — there's no guardrails prompt, no guided example request. Free-form entry risks low-quality voice configs if Daniel doesn't know what to write.
- **Unlocks:** A settings-first path for users who prefer forms over chat.

### Option C: Inline voice setup card in the chat landing

- **What it is:** A collapsible card rendered above the `AionLandingStarters` when `voice_default_derived === true`. Three inline textareas for the three voice fields. On submit, calls `saveAionVoiceConfig` then auto-sends "Draft a test follow-up from my voice config." The chat route handles the rest.
- **Effort:** Medium-large. New card component, integration into `ChatInterface`, state management for submit/confirm flow, plus guard against the card appearing after voice is set.
- **Main risk:** Adds UI complexity to a surface that is already layered (sidebar, landing starters, scope header). Inline forms in chat surfaces are awkward on mobile.
- **Unlocks:** The most seamless "write here → draft here" flow, but costs more build time and surface complexity.

## Recommendation

**Ship Option A first.** The entire 4-turn onboarding flow already works and produces the exact outcome described. The sole missing piece is a discoverable door. Adding one chip to `buildGreeting`'s configured-with-default-voice branch is a 30-minute change that makes the flow available without adding any new UI components or surfaces.

The conversational format (one question at a time) actually serves the goal better than a form: it surfaces guardrails that Daniel wouldn't know to write unprompted, and it ends with a generated draft that validates the config immediately. The queue item imagined a "write 3 paragraphs" form, but the 4-turn chat achieves the same outcome with better output quality.

Option B is a valid polish pass after A is live. Once the onboarding flow has been used a few times and you have a sense of where users get stuck, a form shortcut at `/settings/aion` becomes worth building.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/route/prompts.ts`. In `buildGreeting`, find the `case 'configured':` branch (~line 349). The function signature doesn't currently receive `config` — add a `voiceDefaultDerived?: boolean` parameter.
2. In `buildGreeting`'s `configured` case, when `voiceDefaultDerived === true`, append a chip: `{ label: 'Tell Aion how you actually write', value: '__voice_setup__' }`. The double-underscore prefix signals a synthetic action to `ChatInterface`.
3. In `ChatInterface.tsx`, intercept chips whose value starts with `__voice_setup__`: call `resetAionVoiceConfig()`, then `startNewChat()`. No user message is added to the thread — the new chat opens with the `no_voice` greeting.
4. Update the `buildGreeting` call in `src/app/api/aion/chat/route.ts` (~line 128) to pass `config.voice_default_derived`.
5. Test by creating a fresh workspace (or calling `resetAionVoiceConfig` via the existing sidebar overflow), opening `/aion`, tapping the chip, and going through the 4-turn flow. Confirm the test draft at the end respects the voice you entered.
6. After confirming, add a `/settings/aion` voice form (Option B) as a follow-up to give the explicit-form path.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — `OnboardingState` and `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/api/aion/chat/route/prompts.ts:284-347` — onboarding system prompt + greeting cases
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178-206` — `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:214-256` — `resetAionVoiceConfig`
- `src/app/api/aion/chat/tools/core.ts:318-344` — `draft_follow_up` tool (uses `getDealContextForAion`)
- `src/app/api/aion/draft-follow-up/route.ts` — direct draft-follow-up route
- `src/app/(dashboard)/aion/AionPageClient.tsx` — confirms Brain tab is live
