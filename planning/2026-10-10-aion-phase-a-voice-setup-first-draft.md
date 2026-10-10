# Aion Phase A: Voice Setup and First Draft

_Researched: 2026-10-10 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

---

**Note on premise:** This question was captured in April 2026 when the Brain tab was paused and `/api/aion/route.ts` was a stub. Six months of development have shipped. The infrastructure described as missing is fully operational. The question below is reframed around the _actual_ gap.

## Current state

**The chat route is fully built.** `src/app/api/aion/chat/route.ts:59` is a 465-line authenticated, tool-calling, streaming handler — not the stub. It guards auth, rate limits, reads `aion_config`, classifies intent, routes model tier, and streams structured blocks back.

**`aion_config` exists on `public.workspaces`.** `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94` reads it via `supabase.from('workspaces').select('name, aion_config')`. The `AionConfig` type (`aion-config-actions.ts:50`) carries `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, and `voice_default_derived`.

**The draft-follow-up endpoint is live.** `src/app/api/aion/draft-follow-up/route.ts:53` reads `aionConfig.voice` and passes it to `generateFollowUpDraft` (`src/app/api/aion/lib/generate-draft.ts:52`), which injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt.

**The 5-state onboarding machine is implemented.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` defines `getOnboardingState` mapping config state to `no_voice / no_example / no_guardrails / needs_test_draft / configured`. `src/app/api/aion/chat/route/prompts.ts:311` handles each state in `buildGreeting` with appropriate questions and chip options.

**`save_voice_config` tool is always available.** `src/app/api/aion/chat/tools/core.ts:118` defines the tool that accepts `description`, `example_message`, and `guardrails`, calls `updateAionConfigForWorkspace`, and emits the update back to the client. It is included for `config`, `draft_request`, `conversational`, and all other intents via `buildToolsForIntent` (`route/tools.ts:29`).

**The voice-from-edits loop is live.** `src/app/api/aion/learn-from-edit/route.ts` fires on every draft edit — it calls the LLM to extract vocabulary swaps and tone patterns and persists them back to `aion_config.learned`.

**Critical bypass in place (the actual gap).** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` (`applyVoiceDefaultIfEmpty`) synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. Because `getOnboardingState` returns `'configured'` immediately when this flag is true (`aion-chat-types.ts:248`), new workspaces land in pull-mode on their first Brain tab open — they never see the 4-step voice capture flow. The escape hatch (`resetAionVoiceConfig`, `aion-config-actions.ts:214`) exists but is accessible only from the AionSidebar overflow ("Tune Aion's voice") — no other entry point surfaces it.

## Intended state

Daniel opens the Brain tab, writes or pastes a few paragraphs about how he communicates with clients, and Aion captures that as a structured voice config. On the next request — or immediately in the same session — Aion drafts a follow-up for a real deal and Daniel can see the voice reflected in it.

The onboarding conversation (`buildGreeting` for `no_voice`) already delivers this: it asks one question at a time, receives free-form prose, and calls `save_voice_config` after each answer. After all three fields are set, it offers a test draft via `draft_follow_up`. The loop from "describe style" to "see draft" is under five conversational turns.

## The gap

- New workspaces bypass the 4-step onboarding because `voice_default_derived` makes `getOnboardingState` return `'configured'` before any explicit setup happens.
- The "reset to onboarding" escape hatch is buried in the AionSidebar overflow — no prominent call to action on the Aion page itself.
- There is no dedicated voice settings surface (the `/settings/aion` page covers the deal card beta and cadence learning, not voice config).
- The freeform path (Daniel types voice description in pull-mode chat) works technically — `save_voice_config` fires on intent `config` — but there is no cue to prompt him to do it.

## Options

### Option A: Surface the reset affordance on the Aion page

- **What it is:** Add a dismissable CTA banner to `AionPageClient.tsx` (or `ChatInterface`) that is shown when `aionConfig.voice_default_derived === true`. The banner reads "Aion is using a default voice — want to set yours?" with a "Set it up" button that calls `resetAionVoiceConfig()` and refreshes the session. On next open, `getOnboardingState` returns `no_voice` and the guided conversation starts.
- **Effort:** Small — one new component, one server action call, a session reload.
- **Main risk:** `resetAionVoiceConfig` also clears `onboarding_state`, which is correct, but clearing the synthesized default mid-use is a tiny bit surprising if a workspace has been using the default voice in drafts for a while.
- **Unlocks:** The existing 4-step onboarding flow (already working) becomes accessible to every new workspace owner without navigating settings.

### Option B: Freeform prose capture in chat (no reset needed)

- **What it is:** Add a one-time prompt in the Aion pull-mode greeting for workspaces where `voice_default_derived === true`. The greeting would include: "I built you a default voice from your workspace name. Tell me how you actually talk to clients and I'll replace it." When Daniel pastes his 3 paragraphs, the model calls `save_voice_config` — which clears `voice_default_derived` as a side effect (the `saveAionVoiceConfig` Server Action drops the flag at `aion-config-actions.ts:190`) — and then offers the test draft in the same session. No route to settings, no reset step.
- **Effort:** Small to medium — modify the `'configured'` branch of `buildGreeting` to detect `voice_default_derived` and add one extra text block + chip nudge. No new infrastructure.
- **Main risk:** The greeting is pull-mode; adding a setup nudge to it blurs the distinction. If the workspace is genuinely happy with the default, the nudge is noise.
- **Unlocks:** Daniel's literal use case ("write 3 paragraphs → see draft") without leaving the Aion tab or resetting state explicitly.

### Option C: Dedicated voice config form in settings

- **What it is:** Add a `/settings/aion/voice` page with three textareas (description, example message, guardrails), pre-populated from `aion_config.voice`, that saves via `saveAionVoiceConfig`. A "Generate test draft" button at the bottom calls `draft_follow_up` against the top deal and shows the result inline.
- **Effort:** Medium — new settings page, form, action wiring, test draft preview.
- **Main risk:** Separates voice setup from the context where it's needed (deal card drafts). Owners who set it here may not connect it to what they see in the Brain tab.
- **Unlocks:** A persistent, revisable voice config surface that doesn't depend on the chat model interpreting prose correctly. Makes voice editing feel like a setting, not a conversation.

## Recommendation

**Option B** — modify the `'configured'` greeting to detect `voice_default_derived` and add one direct nudge + "Set it up" chip that inlines Daniel into the existing `no_voice` flow.

Rationale: Option A requires a visual banner component and a reset step before the flow starts; Option C builds new infrastructure that duplicates what the chat already does. Option B works entirely within the existing conversation model: the model already has `save_voice_config`, the onboarding system prompt already fires on `no_voice`, and `saveAionVoiceConfig` already clears `voice_default_derived` on an explicit save. The only missing piece is a nudge in the `'configured'` greeting that surfaces the onboarding path for workspaces that haven't gone through it.

The implementation is a one-line condition in `buildGreeting` (`route/prompts.ts:349`) and one extra text + suggestions block. It carries zero risk of breaking existing configured workspaces (the condition gates on `voice_default_derived`, which is absent from any workspace that has set an explicit voice).

Tradeoffs accepted: the conversational capture is imprecise — the model parses prose and might save a thin description. If precision matters more than discoverability, Option C is the right follow-up sprint after this ships.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/route/prompts.ts` and locate the `'configured'` case in `buildGreeting` (line 349). Before the `const responseMessages: AionMessageContent[] = []` line, check whether the `config` argument has `voice_default_derived === true` — thread `config` in as a param.
2. In that branch, if `voice_default_derived` is true, return an early `{ messages: [text + suggestions] }` that reads: "I built you a default voice from your workspace name. Tell me how you actually talk to clients and I'll replace it." Add chips: `[{ label: "Set my voice", value: "Let me describe how I communicate with clients." }]`.
3. When the user accepts the chip, intent classification will route to `config`, `save_voice_config` is available, and the existing onboarding loop in the system prompt takes over without any further changes.
4. Verify by calling `resetAionVoiceConfig()` in a test workspace (or clearing `aion_config` in the DB), opening `/aion`, and confirming the new greeting fires.
5. After voice is saved, test that `draft_follow_up` (`src/app/api/aion/lib/generate-draft.ts:52`) picks it up by asking "Draft a follow-up for [deal name]" and checking the system prompt output includes the voice block.
6. (Optional cleanup) Rename `AionVoice.tsx` stub and delete the empty `ArthurInput.tsx` file the primer flagged as delete candidates.

## References

- `src/app/api/aion/chat/route.ts` — full chat route
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt` (voice injection)
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, `OnboardingState`
- `src/app/api/aion/chat/route/prompts.ts` — `buildGreeting`, `buildSystemPrompt`
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/learn-from-edit/route.ts` — edit-pattern learning loop
