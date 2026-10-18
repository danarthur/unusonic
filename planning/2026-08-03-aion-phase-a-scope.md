# Aion Phase A: Voice Setup and First Draft — Current State

_Researched: 2026-08-03 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note: the premise of this question is substantially stale. The research below corrects it and reframes the actual gap.**

## Current state

The planning primer's description of Phase A as "paused" and "not started" is inaccurate. The full voice-to-draft pipeline is live.

**`aion_config` column exists.** `public.workspaces.aion_config jsonb` was added via `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7`. The generated type at `src/types/supabase.ts:7782` reflects it. Its shape is `AionConfig` defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` — fields: `voice` (description, example_message, guardrails), `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, `learn_owner_cadence`, `voice_default_derived`.

**The Aion chat route is complete.** `src/app/api/aion/chat/route.ts` is a 450-line auth-guarded, multi-model, streaming handler — not the 16-line stub the primer describes. It reads `aionConfig` on every request and calls `getOnboardingState(aionConfig)` at `chat/route.ts:122`.

**The 5-state onboarding machine is live.** Defined at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257`. States: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:295–338` returns the appropriate first message and chips for each state. The system prompt at `prompts.ts:275–283` tells Aion which onboarding step to guide.

**`save_voice_config` tool is live.** `src/app/api/aion/chat/tools/core.ts:118–144`. Accepts `description`, `example_message`, `guardrails`, and `onboarding_complete`. The execute function patches `aion_config` and calls `refreshConfig()`. When `onboarding_complete: true` is passed, it sets `onboarding_state: 'complete'`, advancing the machine to `configured`.

**Voice feeds draft generation.** `src/app/api/aion/lib/generate-draft.ts:63–66` and `core.ts:42–47` inject the voice fields into the draft prompt under a `--- How This Company Communicates ---` header. Both the `/api/aion/draft-follow-up` route (confirmed at `src/app/api/aion/draft-follow-up/route.ts`) and the in-chat `draft_follow_up` tool read `aion_config.voice`.

**AionInput, AionVoice, ChatInterface are all wired.** `ChatInterface` is the live `/aion` page, rendered from `src/app/(dashboard)/aion/AionPageClient.tsx:73`. The primer's note that these are "unwired" is stale.

**No dedicated "Brain tab" component exists.** The planned tab was never built as a separate component. The `/aion` page — a single `ChatInterface` surface — is the entry point. The `kill_switch` path returns "Aion is paused for this workspace. Resume it to continue." (`chat/route.ts:111`) — that is the live paused-state behavior.

## Intended state

Daniel opens the Aion chat page, describes his communication style in his own words (a few paragraphs is fine — the tool description says "call this whenever the user describes how they talk to clients"), and walks out of that session with a voice-aware draft. The onboarding machine handles the conversation structure; the draft appears in the `needs_test_draft` step when Daniel accepts the "Yes, try one" chip.

The `follow-up-engine-design.md` doc's Phase A likely specified this exact pipeline (voice setup → test draft). That pipeline is implemented.

## The gap

- **Discoverability.** New workspaces get `voice_default_derived: true` synthesized from the workspace name at `aion-config-helpers.ts`. `getOnboardingState` treats this as `configured`, skipping the 4-step onboarding entirely. Daniel will land in pull-mode chat with no prompt to tune his voice unless he actively finds the sidebar overflow → "Tune Aion's voice" option. That affordance exists (`AionSidebar.tsx` imports `resetAionVoiceConfig`), but there is no ambient nudge pointing at it.
- **Planning primer is stale.** The primer's Phase A description will mislead every future queue item that references it. The `planning-primer.md` current-state section needs an update, which this branch does not cover (it is not an application file).
- **No gap in the core pipeline.** The voice-to-draft connection is functional today.

## Options

### Option A: Just do it — use the existing flow now

- **What it is:** Daniel navigates to `/aion`, uses sidebar overflow → "Tune Aion's voice" to reset the synthesized default, then walks through the 3-step conversational onboarding. No code change.
- **Effort:** Small — 10 minutes of Daniel's time.
- **Main risk:** He may not find the sidebar overflow affordance without being told it's there.
- **Unlocks:** The stated goal immediately.

### Option B: Add a discoverable nudge for the derived-default state

- **What it is:** When `voice_default_derived: true`, render a one-line "Your voice is auto-configured from your workspace name. Want to tune it?" banner (or a chip on the configured greeting) that calls `resetAionVoiceConfig` and reloads the chat. This is a new `~30-line` component or an extra chip in `buildGreeting` for the `configured` + `voice_default_derived` case.
- **Effort:** Small — 1–2 hours.
- **Main risk:** Adds noise to a clean chat surface for workspaces that are genuinely happy with the default.
- **Unlocks:** Every new workspace naturally discovers the onboarding flow without hunting through the sidebar.

### Option C: Standalone voice-setup form (settings page)

- **What it is:** A `/aion/settings` page with three labeled textareas (communication style, example message, guardrails), a submit button wired to `saveAionVoiceConfig`, and a redirect into chat. Bypasses the conversational onboarding entirely.
- **Effort:** Medium — 4–6 hours (new route, layout, form, server action, redirect).
- **Main risk:** Duplicates the conversational flow. Two ways to do the same thing creates inconsistency; the form can't teach Aion's capabilities the way the conversation does.
- **Unlocks:** A more settings-flavored UX for users who want an explicit form over a chat.

## Recommendation

Option A this week, Option B as the next commit after.

The pipeline is done. Daniel should open `/aion` today, use "Tune Aion's voice" in the sidebar overflow, walk through the conversation, and have a voice-aware draft within 5 minutes. That is the minimum viable path to the goal and it requires no code.

Option B should follow because the discoverability issue is real — new workspaces silently get a synthesized voice and have no indication that an onboarding flow exists. The fix is a single chip or a one-line banner in `buildGreeting()` at `prompts.ts` for the `configured && voice_default_derived` case. It is a 30-minute change that permanently solves discovery for every future workspace. Option C is not worth building — the conversational path is better than a form and adding a second path creates maintenance debt.

The planning primer should be updated separately to reflect where Phase A actually stands so future queue items start from accurate context.

## Next steps for Daniel

1. Open `/aion` in the browser.
2. Click the sidebar header overflow (three-dot menu) → "Tune Aion's voice" to trigger `resetAionVoiceConfig` and re-enter the 4-step onboarding.
3. Follow the conversation: describe your style, paste an example message, state your guardrails. Use as many paragraphs as you want — Aion extracts and saves all three fields.
4. Accept the "Yes, try one" chip in the `needs_test_draft` step to see the first voice-aware draft.
5. In `src/app/api/aion/chat/route/prompts.ts` around line 340–355, add a `voice_default_derived` branch to `buildGreeting()` that surfaces a "tune your voice" chip on first open for new workspaces (Option B).
6. Update `planning-primer.md` Phase A / current-state section to reflect that voice setup, draft generation, and the onboarding state machine are all live.

## References

- `src/app/api/aion/chat/route.ts:109–127` — kill switch, onboarding state, greeting dispatch
- `src/app/api/aion/chat/route/prompts.ts:275–338` — `buildSystemPrompt` onboarding block + `buildGreeting` state switch
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — `OnboardingState` type + `getOnboardingState`
- `src/app/api/aion/chat/tools/core.ts:118–144` — `save_voice_config` tool
- `src/app/api/aion/lib/generate-draft.ts:63–66` — voice injection into draft prompt
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft endpoint
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74, 178–206` — `AionConfig` type, `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty` (voice_default_derived synthesis)
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` — `aion_config` column DDL
