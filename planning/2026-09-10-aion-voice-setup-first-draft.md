# Aion voice setup: first-run path to a voice-respecting draft

_Researched: 2026-09-10 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

**Note on premise:** The planning primer (snapshot 2026-04-10) described the Brain tab as paused and `aion_config` as non-existent. Neither is true today. This doc corrects the premise and identifies the actual gap.

## Current state

The Aion page is live at `/aion` (`src/app/(dashboard)/aion/page.tsx`). The primer's claim about `/api/aion/route.ts` being a 16-line GPT-4-turbo stub is obsolete — that file no longer exists. The real endpoint is `/api/aion/chat/route.ts`, a ~300-line authenticated, Claude-backed orchestrator using Vercel AI SDK `streamText`.

`public.workspaces.aion_config` exists as `jsonb NOT NULL DEFAULT '{}'` (migration `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7`). Its TypeScript shape is `AionConfig` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74`, with fields `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, `learn_owner_cadence`, `voice_default_derived`.

A 5-step onboarding state machine exists in `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route calls `getOnboardingState(aionConfig)` at line 124, then passes the result to `buildGreeting` (`src/app/api/aion/chat/route/prompts.ts:301`), which returns a different first message per state. At `needs_test_draft`, the greeting is: "Your voice config is set up. Want me to draft a test message for one of your active deals so you can see how it sounds?" (`prompts.ts:338-341`). The `draft_follow_up` tool and `/api/aion/draft-follow-up/route.ts` are wired and authenticated.

The path Daniel wants is architecturally complete. The blocker is discoverability: new workspaces never enter the flow.

`applyVoiceDefaultIfEmpty` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:41-44` synthesizes a voice from the workspace name and sets `voice_default_derived = true`. `getOnboardingState` short-circuits to `'configured'` when this flag is set (`aion-chat-types.ts:248`). New users open `/aion` and get the established-workspace greeting with no invitation to set their voice. The only current re-entry: Sidebar overflow menu → "Tune Aion's voice" → `resetAionVoiceConfig()` → clears `voice` + `voice_default_derived` → next session opens at `no_voice` state (`AionSidebar.tsx:1043`, `aion-config-actions.ts:214`).

## Intended state

A new workspace owner opens `/aion`, is immediately invited to describe their communication style, provides it conversationally over 3–4 turns, and Aion offers a draft follow-up for an active deal. No wizard page, no settings excursion — the chat IS the setup. The current 4-step in-chat flow already delivers this experience; it just never fires by default.

## The gap

- New workspaces get `voice_default_derived = true`, which bypasses all 4 onboarding states
- `buildGreeting` for `'configured'` uses the established-workspace greeting regardless of whether the voice is real or synthesized
- "Tune Aion's voice" in the sidebar overflow is the only way in — it is not surfaced to new users or explained
- The `buildGreeting` function signature does not receive the full `aionConfig`, only the derived `OnboardingState` string, so `voice_default_derived` is invisible to it today

## Options

### Option A: Detect default-derived voice in buildGreeting

- **What it is:** Pass `voice_default_derived?: boolean` as an extra param to `buildGreeting` (the route already has `aionConfig` at line 110). When `configured` + `voice_default_derived === true`, return the `no_voice` state greeting (or a softer variant: "I'm using a starter voice based on your workspace name. Want to tell me how you actually write to clients?"). Flows immediately into the existing 4-step onboarding.
- **Effort:** Small — two file changes (`prompts.ts`, `route.ts` call site)
- **Main risk:** The `no_voice` greeting fires for first-run users only once; if dismissed without completing, `voice_default_derived` stays set and the offer doesn't repeat. A "configured" greeting would show on subsequent sessions.
- **Unlocks:** Daniel opens `/aion`, is invited immediately to personalize Aion's voice, walks the 4-step flow, and gets a draft. Zero new routes or DB columns.

### Option B: First-run banner on ChatInterface

- **What it is:** `AionPageClient.tsx` fetches `aion_config` (or receives it from the server component) and conditionally renders a dismissible banner above the chat input: "Aion is using a starter voice. Describe how you really write to clients — takes 2 minutes." Banner click calls `resetAionVoiceConfig`, starts a new session, chat opens at `no_voice` state.
- **Effort:** Medium — requires client-side `aion_config` fetch or server-component prop threading, new banner component, dismiss-state persistence
- **Main risk:** Adds a second entry-point surface (banner + sidebar overflow), potential state sync issues if the banner and sidebar diverge
- **Unlocks:** More visually prominent than a chat greeting; survives if the user starts chatting before reading the greeting

### Option C: Dedicated /aion/setup wizard route

- **What it is:** A structured 3-step form at `/aion/setup` (description → example → guardrails), shown before first entry into main chat. Writes `aion_config.voice` on completion, then redirects to `/aion?trigger_test_draft=true`.
- **Effort:** Large — new route, new form components, redirect logic, `trigger_test_draft` signal in ChatInterface
- **Main risk:** Duplicates the in-chat flow; two separate voice-setup surfaces to maintain; overkill for a product at this stage
- **Unlocks:** Most structured first-run experience, but the in-chat flow already does this job

## Recommendation

Option A. The 4-step voice onboarding flow is production-grade and works end-to-end. The only missing piece is a first-run invite. Modifying `buildGreeting` to detect `voice_default_derived === true` and return a voice-setup prompt instead of the established greeting is a two-file change that directly enables Daniel's stated goal with zero new infrastructure.

Specifically: the `route.ts` already loads `aionConfig` at line 110; pass `aionConfig.voice_default_derived` as an optional fourth param to `buildGreeting`, then in the `case 'configured'` branch of the switch statement, check it and return a variant of the `no_voice` greeting. This way the 4-step conversational onboarding fires on first open, Aion saves the voice mid-conversation via `save_voice_config`, and then offers a draft at `needs_test_draft`. The sidebar overflow stays as the re-entry path for existing configured users.

The tradeoff: the invite appears only in the greeting (first message of a new session). If Daniel types something else before reading it, the onboarding defers. That is acceptable for a first pass — the sidebar affordance remains the rescue path, and a follow-up iteration can add the banner if usage data shows users missing the greeting.

## Next steps for Daniel

1. Read `buildGreeting` in `src/app/api/aion/chat/route/prompts.ts` lines 298–440 to understand the full switch statement shape.
2. Add `voiceIsDefaultDerived?: boolean` to `buildGreeting`'s options param; in the `case 'configured'` branch, return the `no_voice` greeting text when it is `true`.
3. Update the call site in `src/app/api/aion/chat/route.ts:128` to pass `aionConfig.voice_default_derived`.
4. On a workspace with no stored voice (i.e., `aion_config = {}`), open `/aion` in the browser and confirm the voice-setup greeting appears.
5. Walk the full 4-step flow (describe style → example → guardrails → test draft) and confirm the `needs_test_draft` greeting fires and a draft follows.
6. Ship. The sidebar "Tune Aion's voice" overflow stays unchanged as the re-tune path.

## References

- `src/app/api/aion/chat/route.ts:110-128` — onboarding state derivation and greeting dispatch
- `src/app/api/aion/chat/route/prompts.ts:290-341` — `needs_test_draft` system-prompt block and greeting
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — 5-state machine definition and `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74, 209-235` — `AionConfig` type, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `voice_default_derived` synthesis
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973-1045` — "Tune Aion's voice" overflow affordance
- `src/app/api/aion/draft-follow-up/route.ts` — authenticated draft endpoint
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` — `aion_config` column migration
