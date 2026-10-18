# Aion Phase A: Voice Setup + First Draft

_Researched: 2026-08-26 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The primer is out of date.** Most of the prerequisites already exist.

`public.workspaces.aion_config` DOES exist as a JSONB column. Code actively reads and writes it. `getAionConfigForWorkspace()` (`aion-config-actions.ts:106`) and `saveAionVoiceConfig()` (`:178`) are live server actions. The stored shape is `AionConfig` with `voice.description`, `voice.example_message`, and `voice.guardrails` exactly matching the 3-paragraph goal.

The chat route at `/api/aion/chat` is a full production implementation — auth, tier gates, tool calling, session summarization, page context (`chat/route.ts:57`). Not a stub.

A 5-state onboarding machine exists in `aion-chat-types.ts:247`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The machine is correct. **But**: `getOnboardingState()` returns `'configured'` immediately when `voice_default_derived === true` (`aion-chat-types.ts:248`), and `applyVoiceDefaultIfEmpty()` (`aion-config-helpers.ts:35`) sets that flag whenever a workspace has a name. In practice, all workspaces skip onboarding on first visit.

The `save_voice_config` tool exists in chat (`core.ts:118`). When Daniel describes his style in chat, the tool fires and persists `description`, `example_message`, and `guardrails` to `aion_config`. Voice is then injected into every system prompt (`prompts.ts:88–93`) and every draft call.

`draft_follow_up` chat tool exists (`core.ts:318`). It does not require a deal ID — when omitted it pulls the top-priority deal from the follow-up queue. `generateFollowUpDraft()` (`generate-draft.ts:25`) already injects `aion_config.voice` into the draft system prompt.

The "Tune Aion's voice" affordance exists in the sidebar overflow (`AionSidebar.tsx:1043`). It calls `resetAionVoiceConfig()`, which clears the voice fields and `voice_default_derived`, causing the next chat to enter the onboarding 5-step flow.

**What does not exist:**
- A form-based voice setup UI (no textareas, no structured entry)
- An obvious entry point for first-time voice setup
- An explicit system prompt directive for the `needs_test_draft` state — the machine reaches it but `buildSystemPrompt()` only passes `onboardingState` as a string with no per-state behavior instruction

## Intended state

Daniel navigates to Aion, finds a clear "set up your voice" entry point, pastes or types 3 paragraphs describing his communication style, and immediately sees a draft follow-up for his next queued deal that reflects that style. Setup takes under 5 minutes and requires no prior knowledge of the system. Voice persists and affects every draft going forward.

## The gap

- No explicit landing CTA for voice setup — "Tune Aion's voice" is a buried overflow item only visible after using the app
- `needs_test_draft` onboarding state has no binding system prompt instruction telling Aion to proactively generate a draft
- No form-based path — the only capture mechanism is conversational (which works but is slower for a "paste 3 paragraphs" goal)
- `voice_default_derived` silently bypasses onboarding for all new workspaces; owners don't know setup is available

## Options

### Option A: Wire the existing conversational flow (minimum viable, 1–2 days)

- **What it is:** Two targeted changes. First, add a "Set up my voice" starter to `AionLandingStarters.tsx` that sends a seed message triggering the `no_voice` flow. Second, add a `needs_test_draft` instruction block in `buildSystemPrompt()` (`prompts.ts`) telling Aion to immediately call `draft_follow_up` for the top-priority deal and show the result. No new routes, no new DB changes.
- **Effort:** Small — 2 files, both under 20 lines of change each
- **Main risk:** Onboarding flow is multi-turn (3 questions before reaching draft); if Daniel is impatient or goes off-script, the state machine stalls. The conversational UX is slower than a form for someone who already knows what they want to say.
- **Unlocks:** The full described user journey works end-to-end using existing infrastructure

### Option B: Build a voice setup form panel (better UX, 3–4 days)

- **What it is:** A `VoiceSetupPanel` component with 3 labeled textareas (communication style, example message, guardrails). Saves via `saveAionVoiceConfig()`. After save, fetches a draft from the top-priority follow-up queue via `/api/aion/draft-follow-up` and renders it inline. Surface from the sidebar "Tune Aion's voice" overflow as a full-panel view, or as an onboarding prompt on the /aion landing page when `voice_default_derived === true`.
- **Effort:** Medium — new component, one new client-side fetch, light page integration
- **Main risk:** A form feels less "Aion-native" than the conversational approach. It also separates voice setup from the chat surface, which may feel disconnected.
- **Unlocks:** Fast setup for users who know what they want to write, plus a visible immediate draft without navigating to a deal page

### Option C: Build the Brain settings tab (complete, 1–2 weeks)

- **What it is:** A `/settings/aion/brain` (or `/aion/settings`) route housing the voice setup form, `CadenceLearningToggle` (already built, `CadenceLearningToggle.tsx:14` even has a comment: "can live inside the Brain tab"), and the follow-up playbook editor. Full settings surface for the entire Aion configuration surface.
- **Effort:** Large — new route, navigation wiring, multiple panel sections, playbook editor UI
- **Main risk:** Large scope increases likelihood of shipping nothing in the near term
- **Unlocks:** The full settings experience Daniel would use week-over-week to refine Aion's behavior; also gives `CadenceLearningToggle` a home

## Recommendation

**Ship Option A now, plan Option B for the following sprint.**

The two-file change for Option A (a starter chip + a system prompt directive) is the fastest unblock and uses infrastructure that already works. Every component it touches is tested and production. It lets Daniel experience the full journey within a day and surfaces real signal about whether the conversational UX is sufficient or if a form is better.

The tradeoff you're accepting: the conversational path is 3–4 turns before the draft appears, which is slower than a textarea. If Daniel finds it frustrating — too many Aion questions before seeing results — that's Option B's trigger. But given the form would be new UI (and therefore new bugs), starting with zero-new-UI is the pragmatic call.

One clarification to make before coding: the primer says "Brain tab is paused — waiting for timeline engine." That concept doesn't map to any current component. The chat IS the brain interface. If "Brain tab" refers to a future settings surface, Option A routes around the need for one. If there's a specific tab planned in the nav, that's worth naming before building Option B.

## Next steps for Daniel

1. Open `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` and add a "Set up my voice" chip that fires the seed message `"Let's set up how Aion writes for me"` — this puts `onboarding_state` = `no_voice` in context and triggers the 4-step flow.
2. Open `src/app/api/aion/chat/route/prompts.ts`, find the `'Onboarding: ${onboardingState}'` line (~line 92), and add a block after it: when `onboardingState === 'needs_test_draft'`, append an explicit instruction: `"You are in needs_test_draft state. Immediately call draft_follow_up (omit dealId to use the top-priority deal) and show Daniel the result. Then ask if it sounds right."`.
3. Test the flow: open /aion → click "Set up my voice" → answer the 3 questions → confirm a draft appears.
4. Optionally: update the sidebar "Tune Aion's voice" label to make it more prominent (currently buried in overflow at `AionSidebar.tsx:1043`).
5. Ship, then watch whether Daniel uses the conversational path or asks for a form — that answers whether Option B is needed.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState()` 5-state machine
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig()`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty()` (sets `voice_default_derived`)
- `src/app/api/aion/chat/route/prompts.ts:88` — voice config injection in system prompt
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool (auto-selects top-priority deal)
- `src/app/api/aion/lib/generate-draft.ts:25` — `generateFollowUpDraft()` uses voice config
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" overflow item
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14` — designed for a Brain tab
