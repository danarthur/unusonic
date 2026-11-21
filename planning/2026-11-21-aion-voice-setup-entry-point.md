# Aion Phase A: voice setup entry-point for first real draft

_Researched: 2026-11-21 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** The primer is out of date (reflects April 2026 state). The Brain tab is not paused, `aion_config` exists, and most of Phase A is already built. This doc documents what actually exists and identifies the one real gap.

## Current state

**The Brain tab is live.** `src/app/(dashboard)/aion/AionPageClient.tsx:73` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />` with no paused state.

**`aion_config` column is live.** `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94` reads `workspaces.name, aion_config` via the server client. `updateAionConfigForWorkspace` writes it via the system client.

**The chat route is production-grade.** `src/app/api/aion/chat/route.ts` is a 464-line endpoint with auth, rate limiting, tier gating, tool-calling loop, streaming, and session summarization. Not the 16-line stub the primer mentions.

**The voice onboarding state machine exists.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` defines `getOnboardingState` with 5 states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `src/app/api/aion/chat/route/prompts.ts:284–292` injects an `=== ONBOARDING ===` block into the system prompt for each state. `src/app/api/aion/chat/route/prompts.ts:309–347` returns a purpose-built greeting for each state.

**`save_voice_config` and `draft_follow_up` tools both exist.** `src/app/api/aion/chat/tools/core.ts:118` defines `save_voice_config` — it accepts free-text `description`, `example_message`, and `guardrails`, and writes them to `workspaces.aion_config.voice`. `src/app/api/aion/chat/tools/core.ts:318` defines `draft_follow_up` — it reads the follow-up queue, loads deal context, applies the stored voice via `generateFollowUpDraft`, and returns a draft preview card.

**`generateFollowUpDraft` injects the voice config.** `src/app/api/aion/lib/generate-draft.ts:52` builds a prompt that injects `voice.description`, `voice.example_message`, and `voice.guardrails` as explicit system-prompt sections when set.

**The bypass that skips onboarding.** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` defines `applyVoiceDefaultIfEmpty`: when `voice.description` is absent, it synthesizes a default from the workspace name and sets `voice_default_derived: true`. Then `getOnboardingState` at `aion-chat-types.ts:248` returns `'configured'` immediately when `voice_default_derived === true`. New workspaces skip the 4-step voice setup flow entirely.

## Intended state

A new workspace owner opens `/aion`, sees a prompt to describe how they write, types 3 paragraphs, and receives a follow-up draft that sounds like them. The design doc intent (inferred from the state machine and tool descriptions) is a conversational 4-step setup: style description → example message → guardrails → test draft. All four steps are implemented. The only missing piece is a nudge that invites Daniel into the flow when his workspace has the auto-derived default voice.

## The gap

- `voice_default_derived: true` → `getOnboardingState` returns `'configured'` → greeting skips all onboarding prompts
- Greeting chips for `configured` workspaces (`src/app/api/aion/lib/greeting-chips.ts:67–71`) include "Draft a follow-up" but not "Set up your voice"
- `resolveGreetingChips` has no branch for `isNewWorkspace` or `voice_default_derived` state at the workspace-level (the `isNewWorkspace` param exists but is not passed from `buildGreeting`)
- No visible affordance tells Daniel his voice is auto-derived and that tuning it will make drafts match his style

## Options

### Option A: Voice-setup chip in greeting when default-derived

- **What it is:** Pass a `voiceDefaultDerived` flag into `resolveGreetingChips`. When true, replace the standard chip row with one chip: "Tell Aion how you write" with value "Here's how I talk to clients: [describe your style]". Aion receives that message, calls `save_voice_config` with the description, then offers a draft. 2-3 file changes: `greeting-chips.ts`, `prompts.ts` (`buildGreeting` to pass the flag), `workspace-data.ts` (pass config to greeting path).
- **Effort:** Small — under 30 lines total, no new components, no schema changes.
- **Main risk:** The LLM must correctly interpret 3 paragraphs of prose as a `description` save and not ask for each field sequentially. The `save_voice_config` tool description says "Call this whenever the user describes how they talk to clients" which is exactly the trigger, so the prompt match is tight.
- **Unlocks:** The described flow — open chat, describe style, see draft — works end-to-end without any new surfaces.

### Option B: Dedicated voice setup card in AionLandingStarters

- **What it is:** When `voice_default_derived: true`, `AionLandingStarters.tsx` renders a "Set up your voice" card above the standard starters. Clicking it pre-fills the input with a voice setup prompt. Requires fetching `aionConfig` on the client (or passing it as a prop from the server page).
- **Effort:** Medium — new UI section in `AionLandingStarters`, prop threading from the server page to the client component, state management for dismissal.
- **Main risk:** `AionLandingStarters` is not currently config-aware. Threading the flag adds surface area and may require a new server action.
- **Unlocks:** More visible than a chip; still delegates to chat to do the actual save.

### Option C: Voice setup form in `/settings/aion`

- **What it is:** Add a multi-field textarea form to `AionSettingsView` for `description`, `example_message`, `guardrails`. Saves via `saveAionVoiceConfig`. Includes a "Generate a test draft" CTA that calls `/api/aion/draft-follow-up` after save.
- **Effort:** Medium — new UI section, 3 form fields, save action already exists, needs a pick-a-deal dropdown for the test draft CTA.
- **Main risk:** Bifurcates the experience. The chat system is designed for conversational voice setup; a form is a parallel path that can drift. Also misses the "immediately see a draft" UX.
- **Unlocks:** Explicit, non-conversational setup. Good for owners who want to edit the voice config later without re-doing the chat flow.

## Recommendation

**Option A.** The chat infrastructure is production-ready. `save_voice_config` and `draft_follow_up` already do exactly what the question asks. The only real gap is a prompt to get Daniel talking about his style. A single chip is the minimum viable signal.

The change is surgical: add a `voiceIsDefaultDerived` boolean to `GreetingChipContext`, branch in `resolveGreetingChips` when it's true, and pass the flag from `buildGreeting` where `aionConfig` is already available. When Daniel taps "Tell Aion how you write", he types 3 paragraphs, Aion calls `save_voice_config(description: <3 paragraphs>)`, then he can tap "Draft a follow-up" and get a draft that uses his words.

One tradeoff: the chip only fires once on a cold open. If Daniel skips it, the auto-derived voice stays quietly in place. That's acceptable — `resetAionVoiceConfig` exists in the sidebar overflow for intentional re-setup, and Option C (a settings form) can follow in a later pass.

## Next steps for Daniel

1. `src/app/api/aion/lib/greeting-chips.ts` — add `voiceIsDefaultDerived?: boolean` to `GreetingChipContext` and a new branch before the default return: when `voiceIsDefaultDerived` and no `pageContext`, return `[{ label: 'Tell Aion how you write', value: 'Here's how I talk to clients: ...' }]` as the only chip.
2. `src/app/api/aion/chat/route/prompts.ts` — update the `buildGreeting` call for `case 'configured'` to pass `voiceIsDefaultDerived: config.voice_default_derived === true` into `resolveGreetingChips`.
3. Verify by calling `/api/aion/chat` with `{ messages: [], workspaceId }` for a workspace with `voice_default_derived: true` and confirm the chip appears.
4. Write 3 paragraphs in the chat and confirm Aion calls `save_voice_config` and surfaces a draft.
5. Confirm that `voice_default_derived` is cleared after `saveAionVoiceConfig` is called (`aion-config-actions.ts:190` — the `voice_default_derived: _drop` destructure confirms this).
6. Optional follow-on: add an inline voice config editor in `/settings/aion` (Option C) for owners who want to edit without re-doing the chat flow.

## References

- `src/app/(dashboard)/aion/AionPageClient.tsx:73` — Brain tab renders ChatInterface, not paused
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94–119` — `aion_config` read/write
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` bypass
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` with bypass
- `src/app/api/aion/chat/route.ts:1–464` — full production chat endpoint
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts:52` — voice injection in draft prompt
- `src/app/api/aion/chat/route/prompts.ts:284–295` — onboarding system-prompt blocks
- `src/app/api/aion/chat/route/prompts.ts:349` — `configured` greeting, no voice-derived branch
- `src/app/api/aion/lib/greeting-chips.ts:30` — `resolveGreetingChips`, no voice-derived branch
