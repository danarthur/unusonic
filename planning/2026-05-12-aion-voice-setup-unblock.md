# Aion Phase A: unblocking voice setup and first real draft

_Researched: 2026-05-12 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The queue item's two premises are outdated. Both blockers have been resolved since the primer was written.

**`aion_config` column exists.** Migration `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` adds `aion_config jsonb NOT NULL DEFAULT '{}'` to `public.workspaces`. `src/types/supabase.ts:7689` reflects it as typed `Json`. Read via `getAionConfig()` (`aion-config-actions.ts:84`), written via `saveAionVoiceConfig()` (`aion-config-actions.ts:178`).

**The chat route is fully functional.** `/api/aion/chat/route.ts` is a full tool-calling architecture with auth, rate limiting, tier gating, workspace snapshot, and streaming. Not a stub.

**`/api/aion/draft-follow-up` is implemented** (`src/app/api/aion/draft-follow-up/route.ts:1`). It accepts `{ context: AionDealContext, workspaceId }`, gates on tier + kill switch, calls `generateFollowUpDraft()`, and returns `{ draft, channel }`.

**`getDealContextForAion` is implemented** (`src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`), already used in the chat tools.

**The 4-step conversational onboarding flow is complete.** `getOnboardingState()` (`aion-chat-types.ts:247`) drives a 5-state machine: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` (`chat/route/prompts.ts:292`) returns polished greeting text + suggestion chips for each state. The system prompt injects onboarding instructions per state (`prompts.ts:275–283`).

**The flow is bypassed for all workspaces.** `getOnboardingState` line 248 short-circuits immediately if `config.voice_default_derived === true`. `applyVoiceDefaultIfEmpty()` (`aion-config-helpers.ts:35`) sets this flag whenever `config.voice?.description` is empty — which is every workspace that hasn't explicitly saved a voice. The synthesized default (`synthesizeDefaultVoice`) uses workspace name only. Result: every first-time Aion user skips onboarding entirely and sees the pull-mode greeting.

The only re-entry path is the sidebar overflow → "Tune Aion's voice" (`AionSidebar.tsx:1043`), which calls `resetAionVoiceConfig()` to clear the flag. This is buried and undiscoverable.

## Intended state

Daniel opens Aion, sees "Let's start with how you talk to clients" on first visit, writes his style in a few exchanges, shares an example message, sets guardrails, then sees Aion draft a real follow-up for his top priority deal. After that first session the voice is locked in and future greetings skip setup. The `CadenceLearningToggle` (`CadenceLearningToggle.tsx:24`) is designed to drop into this same surface when a "Brain tab" is eventually built.

## The gap

- `getOnboardingState:248` short-circuits to `configured` whenever `voice_default_derived === true`, so the 4-step flow never fires
- No explicit "first visit" check — any workspace without a saved voice gets the synthesized bypass silently
- No discoverability: the only setup entry point is the sidebar overflow, which is invisible to new users
- No standalone Brain tab route exists yet (it is a design doc concept, not a page)

## Options

### Option A: Fix the `voice_default_derived` bypass
- **What it is:** In `getOnboardingState`, change line 248 to short-circuit only when `voice_default_derived === true AND onboarding_state === 'complete'`. Workspaces that have never explicitly completed onboarding re-enter the 4-step conversational flow on next Aion chat.
- **Effort:** Small — one condition change in `aion-chat-types.ts:248`, no new files
- **Main risk:** Existing workspaces that skipped onboarding (all of them, currently) will see the voice setup questions on their next chat. Jarring if there are real users.
- **Unlocks:** Daniel's exact goal in one session: chat → style → example → guardrails → draft

### Option B: Voice setup form in `/settings/aion`
- **What it is:** Add a `VoiceConfigSection` to `AionSettingsView.tsx` — three labelled text areas (communication style, example message, guardrails) wired to `saveAionVoiceConfig`. A "Test this voice" link navigates to Aion chat scoped to a deal.
- **Effort:** Medium — one new component (~80 lines), wired into `AionSettingsView`
- **Main risk:** "Immediately see a draft" is broken: the user saves the form and then separately navigates to chat. The conversational test draft in the `needs_test_draft` state already handles deal selection intelligently; a form can't replicate that.
- **Unlocks:** Non-conversational entry point; useful for editing an existing voice

### Option C: Discovery chip in the Aion empty state
- **What it is:** In `ChatInterface.tsx`, when `voice_default_derived === true`, render a "Set up your voice" card in the empty state that explains the benefit and has a single button calling `resetAionVoiceConfig()` on click, then reloads the session greeting.
- **Effort:** Small-medium — modify `ChatInterface.tsx` empty state, one server action call
- **Main risk:** The fix is in the UI layer only; the bypass in `getOnboardingState` still exists. If the user misses the chip or dismisses it, they never onboard.
- **Unlocks:** Visible entry point without a settings rework

## Recommendation

**Option A.** The conversational flow is already written, polished, and shipped — it just needs to fire. One condition change in `aion-chat-types.ts:248` is the entire diff. The "write 3 paragraphs" experience Daniel described IS the `no_voice` → `no_example` → `no_guardrails` → `needs_test_draft` flow: it asks about style, collects an example message, asks about rules, then picks a real deal and drafts against it. No new UI, no new API work.

The risk of re-triggering onboarding for existing workspaces is real, but manageable: this is a dev environment with one workspace. In production, the `onboarding_state === 'complete'` gate already protects anyone who finished the flow explicitly. The only people who re-enter are those who never did.

Option B is a useful future complement (edit existing voice in settings) but it doesn't deliver "immediately see a draft" — the conversational flow does. Build it later as a settings affordance, not a prerequisite.

## Next steps for Daniel

1. Edit `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248` — change `if (config.voice_default_derived === true) return 'configured'` to `if (config.voice_default_derived === true && config.onboarding_state === 'complete') return 'configured'`
2. Run `npm run dev` and open `/aion` — you should see the `no_voice` greeting asking how you talk to clients
3. Complete the 3-step flow (style, example message, guardrails) — Aion calls `save_voice_config` after each step
4. Reach the `needs_test_draft` state — Aion offers to draft for your top deal; verify the draft respects your voice
5. Confirm `aion_config.onboarding_state === 'complete'` and `voice_default_derived` is cleared after the flow (check Supabase dashboard)
6. Optional follow-up: add `CadenceLearningToggle` to the `configured` chat empty state as a "next step" after voice setup completes

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–257` — `getOnboardingState` state machine
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45` — `applyVoiceDefaultIfEmpty` (source of the bypass)
- `src/app/api/aion/chat/route/prompts.ts:275–338` — system prompt + greeting per onboarding state
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–74` — `AionVoiceConfig` type, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint (fully implemented)
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` — `aion_config` column migration
