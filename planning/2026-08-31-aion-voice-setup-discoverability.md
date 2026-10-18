# Aion voice setup: the discoverability gap

_Researched: 2026-08-31 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How I read this:** The stated premise is outdated. Both blockers the question names are resolved. The real gap is discoverability of the voice-setup flow, which is fully wired but hidden.

## Current state

**`aion_config` exists.** Typed as `Json` at `src/types/supabase.ts:7782`. `getAionConfigForWorkspace` (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`) reads it; `saveAionVoiceConfig` (`:178`) writes to it via the anon/authenticated client. `updateAionConfigForWorkspace` (`:262`) deep-merges via service role.

**The chat route is fully built.** `src/app/api/aion/chat/route.ts` is a 450-line tool-calling, streaming route with auth, tier gating, onboarding state injection, rolling summarization, and model routing. Not a stub.

**Draft generation is live.** `src/app/api/aion/draft-follow-up/route.ts` calls `generateFollowUpDraft` (`src/app/api/aion/lib/generate-draft.ts:25`), which injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt (`generate-draft.ts:63–75`). The voice already controls every draft.

**The 4-step onboarding conversation is wired.** `getOnboardingState` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` maps config state to `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildSystemPrompt` at `src/app/api/aion/chat/route/prompts.ts:275–283` injects per-state instructions (`save_voice_config` tool, `draft_follow_up` tool).

**The bypass is the problem.** `applyVoiceDefaultIfEmpty` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState:248` returns `'configured'` immediately for any workspace with that flag — the 4-step conversation never fires.

**The tuning affordance is buried.** "Tune Aion's voice" (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043`) is inside a `SlidersHorizontal` overflow menu — not visible on first visit, not surfaced in the greeting.

## Intended state

Daniel's goal: open `/aion`, describe how he communicates with clients, immediately get a draft that sounds like him. The backend already supports this end-to-end. What's missing is the invitation — a first-run nudge that brings a new (or synthesized-voice) workspace into the explicit 4-step setup conversation.

The reference pattern is Linear's onboarding: if a configuration is synthetic/assumed, surface a low-friction "customize this" prompt at the natural discovery point rather than burying it in settings.

## The gap

- New workspaces silently get `voice_default_derived: true` → `onboarding_state: 'configured'` → no voice-setup conversation
- The `/aion` greeting for a configured workspace does not mention the synthesized voice or invite tuning
- "Tune Aion's voice" is in a sidebar overflow menu that most users never open on the first session
- `AionFirstVisitPrompt` (`aion/components/AionFirstVisitPrompt.tsx`) exists but handles Aion card-beta consent on `/events`, not voice setup on `/aion`

## Options

### Option A: Voice-setup invitation in the greeting (minimum viable)
- **What it is:** When `buildGreeting` runs for a `voice_default_derived: true` workspace, return a chip `[chips: Tune my voice|tune my voice]` alongside the greeting. In the client, intercept "tune my voice" chip clicks: call `resetAionVoiceConfig` (server action, already exists), then re-request the greeting. After the reset, `onboarding_state` becomes `no_voice` and the 4-step setup fires naturally. Changes: `prompts.ts:buildGreeting` (~15 lines), chip-click handler in `ChatInterface.tsx` or `AionLandingStarters.tsx` (~20 lines).
- **Effort:** Small (2–3 hours)
- **Main risk:** The chip pattern is new (chips currently just resend text); intercepting a chip to call a server action before sending requires a new conditional in the send path.
- **Unlocks:** Daniel opens `/aion`, sees "Tune my voice" in the greeting, clicks it, goes through 4-step setup, sees a test draft.

### Option B: Remove the bypass for truly new workspaces
- **What it is:** Change `getOnboardingState` (`aion-chat-types.ts:248`): when `voice_default_derived === true` AND `onboarding_state !== 'complete'`, return `'no_voice'` instead of `'configured'`. The 4-step conversation fires automatically for all workspaces that haven't explicitly completed setup. No client change needed.
- **Effort:** Small (30 minutes, one line)
- **Main risk:** Existing workspaces that are happily using Aion with a synthesized voice (and have never completed the 4-step flow) will be dropped back into onboarding on their next chat. This could surprise users mid-workflow.
- **Unlocks:** Same as A, but automatic — no chip needed.

### Option C: Standalone voice-setup form
- **What it is:** Add a `/settings/aion/voice` page with three textareas (description, example message, guardrails) that call `saveAionVoiceConfig`. After save, redirect to `/aion` where the user can ask for a test draft in natural language. "Write 3 paragraphs" maps cleanly to the description textarea.
- **Effort:** Medium (half day — new page, layout, form actions, a redirect with a success toast)
- **Main risk:** Splits the configuration experience across settings and chat; the 4-step conversational flow becomes redundant for first-time setup.
- **Unlocks:** A direct, form-based path that matches the "write 3 paragraphs" framing exactly. Also useful as a power-user edit surface later.

## Recommendation

**Option A.** It's the minimum path that matches the stated goal without surprising existing users. The chip approach keeps everything in the chat context (where Daniel already is), and the infrastructure — reset action, onboarding prompts, save tool, draft generation — all works today.

The one tricky part is the chip intercept. The cleanest implementation: add a `data-action="voice-setup"` attribute (or a prefix like `sys::voice_setup`) to the chip value in `buildGreeting`, then in `ChatInterface.tsx`'s chip-click handler, check for it, call `resetAionVoiceConfig`, and re-trigger the init fetch rather than sending the value as a user message.

Option B is tempting because it's one line, but it will break the "configured" state for workspaces that have been running Aion for weeks and will feel like a regression. Option C is the right long-term power-user surface (especially for agencies that want to template voice across multiple workspaces) but is not the minimum path.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/route/prompts.ts` at `buildGreeting` (~line 292). In the `'configured'` branch, check if the config passed in has `voice_default_derived: true` — if so, include `"Aion is using a generic voice — personalize follow-up drafts in a couple of minutes."` and a chip with a `sys::` prefix value like `sys::voice_setup`.
2. In `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx` (or `AionLandingStarters.tsx`), find the chip-click handler. Add a branch: if chip value starts with `sys::`, parse the action and run the corresponding server action. For `sys::voice_setup`, call `resetAionVoiceConfig`, then clear messages and re-trigger the greeting init fetch.
3. Verify locally: open `/aion` as a workspace with no explicit voice. The greeting should show the chip. Click it → the next greeting should open with "Tell me how you communicate with clients."
4. Work through the 4-step flow: description → example → guardrails → test draft. Confirm the draft is generated via `/api/aion/draft-follow-up` and the voice is injected.
5. Optionally: surface the same "Tune Aion's voice" sidebar affordance (`AionSidebar.tsx:1043`) as a persistent banner on the Aion page until `onboarding_state === 'complete'`.
6. After the flow works, add `onboarding_state: 'complete'` to the `save_voice_config` tool payload so the chip/banner disappears permanently once voice is set.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` (the bypass)
- `src/app/api/aion/chat/route/prompts.ts:275` — onboarding state injection into system prompt
- `src/app/api/aion/lib/generate-draft.ts:63` — voice injection into draft prompt
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — existing "Tune Aion's voice" affordance
- `src/types/supabase.ts:7782` — `aion_config: Json` confirming the column exists
