# Aion Phase A: Voice Setup + First Draft — Current Status

_Researched: 2026-06-23 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The question's premises are out of date. All Phase A infrastructure has shipped.

**`aion_config` exists** as a JSONB column on `public.workspaces`. It holds `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, and related flags. Every read goes through `getAionConfigForWorkspace` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`.

**The chat route is live.** `/api/aion/chat/route.ts` (451 lines) handles auth, tier gating, model routing, streaming, tool calling, and session summarization. It is not the 16-line stub.

**The voice setup onboarding machine is built.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` defines five states (`no_voice → no_example → no_guardrails → needs_test_draft → configured`). When the state is not `configured`, `buildGreeting` in `src/app/api/aion/chat/route/prompts.ts:292` returns a tailored opening that walks the user through each step. The system prompt at `:275` instructs Aion to save each piece via `save_voice_config`.

**`save_voice_config` tool is implemented** at `src/app/api/aion/chat/tools/core.ts:118`. It writes `description`, `example_message`, and `guardrails` to `aion_config.voice` via `updateAionConfigForWorkspace`.

**Draft generation is voice-aware.** `src/app/api/aion/lib/generate-draft.ts:52` builds the follow-up prompt by injecting `voice.description`, `voice.example_message`, and `voice.guardrails`. `/api/aion/draft-follow-up/route.ts` is live and uses this.

**The gap hiding it all:** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` synthesizes a generic voice from the workspace name on every config read when no real voice is stored, and sets `voice_default_derived: true`. `getOnboardingState` (`:247`) returns `'configured'` when that flag is set. Result: every workspace bypasses the 4-step chat onboarding and lands in pull-mode ("Hey Daniel.") instead of "How would you describe your style?" The only escape is AionSidebar overflow → "Tune Aion's voice," which calls `resetAionVoiceConfig` to clear the flags.

## Intended state

Daniel opens `/aion`, sees "How would you describe your style?", writes three paragraphs, and immediately receives a follow-up draft from a real deal that mirrors his voice. The 4-step chat-native onboarding was designed for exactly this. The `save_voice_config` tool, the draft endpoint, and the onboarding greeting logic are all in place. The flow just doesn't trigger by default because the Wk 11 §3.8 synthesized-default bypass short-circuits it for all workspaces.

## The gap

- `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35`) synthesizes a voice for every unconfigured workspace and sets `voice_default_derived: true`.
- `getOnboardingState` (`aion-chat-types.ts:247`) treats `voice_default_derived === true` as `'configured'`, bypassing the 4-step chat flow.
- New workspaces never encounter the intended setup dialogue by default.
- The "Tune Aion's voice" reset path (`AionSidebar.tsx:31` imports `resetAionVoiceConfig`) is the only entry point, and it's buried in a header overflow menu.

## Options

### Option A: Declare Phase A done, test the existing path
- **What it is:** No code change. Document that the flow works via AionSidebar → "Tune Aion's voice," test end-to-end, ship nothing.
- **Effort:** Small (30 min test run)
- **Main risk:** The discoverability problem persists. Anyone onboarding Unusonic for the first time won't encounter voice setup and will use the generic synthesized voice indefinitely.
- **Unlocks:** Confirms all Phase A wiring is correct before touching anything.

### Option B: Add a first-run nudge in ChatInterface
- **What it is:** When `aion_config.voice_default_derived === true` (passed down through the greeting response or a new config field on the chat response), render a dismissible in-chat banner: "Aion is using a generic voice. Tune it to your style." with a "Tune now" button that calls `resetAionVoiceConfig` and reloads.
- **Effort:** Medium (new component, configUpdates plumbing, one new field on greeting response)
- **Main risk:** Adds UI surface without addressing the root cause; users can dismiss and forget.
- **Unlocks:** Teaches the feature without breaking the existing default-voice behavior for workspaces that don't want setup.

### Option C: Remove the synthesized-default bypass for unconfigured workspaces
- **What it is:** Remove or condition the `if (config.voice_default_derived === true) return 'configured'` check in `getOnboardingState`. Workspaces with no stored voice flow through the 4-step chat onboarding on first open. Workspaces with a real stored voice (`config.voice?.description` set explicitly via `save_voice_config`) are unaffected.
- **Effort:** Small (one-line change in `aion-chat-types.ts:248` + test the 4 greeting states)
- **Main risk:** Any workspace that had silently adopted the synthesized voice now gets dropped into onboarding on next open. If workspaces actively use Aion on the default-derived voice, this is a regression.
- **Unlocks:** Makes Daniel's described first-open experience the actual first-open experience. The 4-step flow is already built and tested.

## Recommendation

Option A first, Option C if the synthesized voice isn't being actively relied on.

Run through the existing path today: AionSidebar → "Tune Aion's voice" → `resetAionVoiceConfig` → reopen `/aion` → walk the 4 states → see a draft. This confirms everything wires correctly and takes 20 minutes. 

If that test passes cleanly, Option C is the right long-term call. The synthesized default was added to reduce friction, but it makes the voice setup feature invisible and means every new workspace uses a generic prompt. One line change in `aion-chat-types.ts:248`. Existing workspaces that have explicitly saved a real voice (any `save_voice_config` call that stored a `description`) are unaffected because `applyVoiceDefaultIfEmpty` short-circuits on `config.voice?.description` being set.

Skip Option B — it adds complexity to paper over a clean fix.

## Next steps for Daniel

1. Open `/aion` in the dashboard, then click the sidebar overflow (three-dot menu on the sidebar header) → "Tune Aion's voice." Confirm the onboarding flow starts.
2. Walk all 4 states: describe style, paste example, set guardrail, approve a test draft. Confirm the draft reflects what you wrote.
3. If the flow works end-to-end, open `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`. Remove the `if (config.voice_default_derived === true) return 'configured';` check (or gate it on a new `onboarding_explicitly_dismissed` flag if you want a future escape hatch).
4. Check any workspace that already uses Aion on the default voice — if none are in production, the removal is safe to ship immediately.
5. Add a vitest case to `src/app/(dashboard)/(features)/aion/actions/__tests__/aion-config-actions.test.ts` asserting that a freshly read workspace with no stored voice hits `no_voice` state (not `configured`).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `getAionConfig`, `getAionConfigForWorkspace`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` (where the bypass takes effect)
- `src/app/api/aion/chat/route/prompts.ts:275,292` — `buildSystemPrompt` onboarding blocks + `buildGreeting` per-state responses
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt` voice injection
- `src/app/api/aion/draft-follow-up/route.ts` — live draft endpoint
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:31` — `resetAionVoiceConfig` import
