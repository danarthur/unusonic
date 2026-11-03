# Aion Phase A: voice setup and first follow-up draft

_Researched: 2026-11-03 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note: The question's premise is outdated.** The primer dates from 2026-04-10. Since then, all Phase A prerequisites have shipped. What follows maps the current state accurately and identifies what is actually left.

## Current state

**`public.workspaces.aion_config` exists.** `getAionConfig` reads `aion_config` (JSONB) from `public.workspaces` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:89`. The column holds `voice` (description + example_message + guardrails), `learned` (vocabulary + patterns), `follow_up_playbook`, `onboarding_state`, `kill_switch`, and `voice_default_derived`.

**The chat route is a full production route.** `/api/aion/chat/route.ts:59` has auth, tier gating via `canExecuteAionAction`, workspace config loading, intent classification, multi-tier model selection, tool-calling loop via `streamText`, session scope resolution, and conversation summarization. It is not a stub.

**The `draft-follow-up` route is live and voice-aware.** `src/app/api/aion/draft-follow-up/route.ts:53` loads `aion_config` and passes `aionConfig.voice` to `generateFollowUpDraft`. The draft prompt injects `voice.description`, `voice.example_message`, and `voice.guardrails` directly (`src/app/api/aion/lib/generate-draft.ts:63`).

**The 4-step onboarding state machine exists and is wired.** `OnboardingState` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` has five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildGreeting` at `src/app/api/aion/chat/route/prompts.ts:301` returns the appropriate opener for each state. The system prompt at line 284 appends onboarding instructions. The `save_voice_config` tool at `src/app/api/aion/chat/tools/core.ts:118` saves voice fields and calls `updateAionConfigForWorkspace`.

**The synthesized-default bypass skips onboarding.** `applyVoiceDefaultIfEmpty` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a voice from the workspace name whenever `voice.description` is empty, and sets `voice_default_derived: true`. `getOnboardingState` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248` returns `'configured'` immediately when that flag is set. A new workspace never hits the 4-step flow unless Daniel manually triggers "Tune Aion's voice" in the sidebar overflow (which calls `resetAionVoiceConfig`).

**All model tiers currently route through Haiku.** `src/app/api/aion/lib/models.ts:69` — a comment from 2026-04-21 notes that API access to Sonnet 4.5/Opus 4.5 returned 404, so all tiers were temporarily clamped to `claude-haiku-4-5-20251001`. The voice config intent (`config`) is supposed to route to `standard` (Sonnet) per `INTENT_TO_TIER` at line 196.

## Intended state

Daniel opens the Brain tab, writes 3 paragraphs, and immediately gets an Aion-generated follow-up draft that mirrors his voice. The explicit 4-step flow handles first-time setup: Aion asks about style, then example message, then guardrails, then offers a test draft that gets approved. After that, every follow-up draft uses the stored voice. The intended models are Sonnet for config intents and Haiku for drafting.

## The gap

- The synthesized-default bypass (`voice_default_derived`) means a new workspace goes straight to `configured` without ever being asked about voice. Daniel won't hit the 3-paragraph setup unless he finds "Tune Aion's voice" in the sidebar overflow, which is not prominent.
- All model tiers are stuck on Haiku. The voice config conversation runs on the same model as a greeting. Sonnet/Opus are blocked at the API key level.
- No explicit onboarding nudge surfaces in the UI: there is no banner, tooltip, or landing-state on the Brain tab that guides a first-time user to voice setup. The sidebar has a `Mic2` icon and overflow menu but this is deep navigation.
- The end-to-end path (write paragraphs → save_voice_config fires → open a real deal → see a draft that reflects those paragraphs) has not been validated in one sitting.

## Options

### Option A: Validate end-to-end on a real deal today

- **What it is:** Reset voice config via the sidebar overflow ("Tune Aion's voice"), go through the 4-step chat flow manually on the Brain tab, then open a real deal and trigger a draft from the follow-up queue. Confirm the draft reflects the stored voice fields.
- **Effort:** Small — 30 minutes of testing, no code.
- **Main risk:** Exposes a gap (save_voice_config silently fails, or draft generation doesn't pick up the new voice) without having code ready to fix it.
- **Unlocks:** Confirmed baseline. Everything that follows is iteration.

### Option B: Fix model tiers first, then validate

- **What it is:** Check the Anthropic dashboard for model access status. If Sonnet 4.5 / Sonnet 4.6 is available, update `MODELS.standard` and `MODELS.heavy` in `models.ts:69`. Then validate end-to-end.
- **Effort:** Small for the one-line change; unknown wait on API access.
- **Main risk:** API access may still be restricted. If so, the flow works with Haiku — slower but functional.
- **Unlocks:** Voice config conversations run on a model with significantly better instruction-following, reducing save_voice_config call failures.

### Option C: Surface onboarding explicitly instead of relying on the sidebar overflow

- **What it is:** Remove or condition the `voice_default_derived` bypass so that first-time workspaces hit the `no_voice` greeting. OR add a visible onboarding CTA on the Brain tab landing state (before any messages) that links to the voice setup flow. Either approach ensures Daniel's 3-paragraph write-up happens as intended.
- **Effort:** Medium — removing the bypass risks breaking workspaces that rely on the synthesized default; adding a landing-state CTA is smaller but requires a design decision.
- **Main risk:** The bypass was added (Wk 11 §3.8) specifically to avoid forcing users through onboarding. Removing it could degrade UX for workspaces that are happy with the default.
- **Unlocks:** Explicit, discoverable voice setup for every new workspace, which is the flow the queue question describes.

## Recommendation

Do Option A first, then Option B. The infrastructure is complete. The fastest path to Daniel writing 3 paragraphs and seeing a draft is: (1) trigger the reset today via "Tune Aion's voice" in the sidebar, (2) walk through the 4-step conversation, (3) open a deal with a follow-up queued and confirm the draft is voice-accurate. This costs 30 minutes and either validates the path or reveals the specific failure point. Option B (model tier fix) is a 1-line change to `models.ts:69` — do it as soon as the Anthropic dashboard confirms Sonnet 4.5/4.6 access, not before. Option C is a UX policy decision: the bypass was intentional and the right call is to discuss whether to condition it rather than remove it cold.

Skip any new infrastructure work. Phase A shipped; the only thing that has not happened is a deliberate end-to-end validation run.

## Next steps for Daniel

1. In the Brain tab sidebar, click the three-dot overflow on any session → "Tune Aion's voice" → this calls `resetAionVoiceConfig` and puts the workspace into `no_voice` state.
2. Start a new chat on the Brain tab. The greeting should ask "How would you describe your style?" — if it doesn't, inspect `getOnboardingState` return value in the network panel (`POST /api/aion/chat`, response `messages[0]`).
3. Write 3 paragraphs about how you talk to clients. Aion should call `save_voice_config` and confirm what it saved. Confirm `voice.description` is populated in the response `configUpdates`.
4. When Aion offers a test draft (state = `needs_test_draft`), approve it. This sets `onboarding_state: 'complete'`.
5. Open a deal that has an item in the follow-up queue. Confirm the draft shown by the Aion deal card reflects your voice.
6. Check `MODELS` in `src/app/api/aion/lib/models.ts:69` — if Sonnet 4.5/4.6 is now available on your Anthropic dashboard, update `standard` and `heavy` away from Haiku.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — AionConfig type, getAionConfig, saveAionVoiceConfig, resetAionVoiceConfig, updateAionConfigForWorkspace
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — synthesizeDefaultVoice, applyVoiceDefaultIfEmpty
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — OnboardingState, getOnboardingState
- `src/app/api/aion/chat/route.ts` — full chat route with auth, tier gate, onboarding handling
- `src/app/api/aion/chat/route/prompts.ts:284,301` — buildSystemPrompt (onboarding block), buildGreeting
- `src/app/api/aion/chat/tools/core.ts:118` — save_voice_config tool definition
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation route, voice injection
- `src/app/api/aion/lib/generate-draft.ts:63` — buildFollowUpPrompt, voice injection
- `src/app/api/aion/lib/models.ts:69` — MODELS constant, Haiku-only temporary bypass
