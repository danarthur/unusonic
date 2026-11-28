# Aion Phase A: voice setup to first draft — what's left

_Researched: 2026-11-28 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The question's premise is significantly out of date. Almost all of Phase A is already built.

**`aion_config` exists and is live.** `getAionConfig` reads `public.workspaces.aion_config` with a full `AionVoiceConfig` shape (description, example_message, guardrails). `saveAionVoiceConfig` and `updateAionConfigForWorkspace` write to it. `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84` reads the column; `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a default from workspace name when empty.

**The Aion chat route is fully authenticated and working.** `/api/aion/chat/route.ts` uses `streamText`, has tier gating, workspace context, tool calling, and onboarding state machine wiring. It is not a stub.

**A 5-state voice onboarding machine exists.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` defines `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The system prompt injects an `=== ONBOARDING ===` block at each incomplete state (`src/app/api/aion/chat/route/prompts.ts:284`). The `no_voice` cold-open greeting is: "Let's start with how you talk to clients. How would you describe your style?" (`prompts.ts:313`).

**`save_voice_config` and `draft_follow_up` are live tools.** Both exist in `src/app/api/aion/chat/tools/core.ts:118` and `core.ts:318`. `save_voice_config` accepts description/example_message/guardrails/onboarding_complete and writes to the workspace config. `draft_follow_up` calls `generateFollowUpDraft` which injects voice config into the system prompt (`src/app/api/aion/lib/generate-draft.ts:62`).

**The "Brain tab is paused" state is gone.** The `/aion` page renders a full `ChatInterface` component (`src/app/(dashboard)/aion/AionPageClient.tsx:73`). There is no paused-tab UI anywhere in the current codebase.

**However: new workspaces bypass the onboarding flow entirely.** `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35`) synthesizes a voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState` returns `configured` immediately whenever `voice_default_derived === true` (`aion-chat-types.ts:248`). So new users see the standard workspace greeting, not the voice-setup prompt, and the state machine never advances to `needs_test_draft`.

**A secondary bug closes the loop on the problem.** When Daniel teaches Aion his style via chat, the `save_voice_config` tool calls `updateAionConfigForWorkspace`, which spreads `...current` before writing the update (`aion-config-actions.ts:275`). This means `voice_default_derived: true` persists even after Daniel saves real voice content. The state machine stays at `configured` and the `needs_test_draft` offer never fires. By contrast, `saveAionVoiceConfig` explicitly strips the flag (`aion-config-actions.ts:190`) but is not what the chat tool calls.

## Intended state

Daniel opens the Aion page. He pastes 3 paragraphs describing his communication style. Aion saves this as his voice description, asks for a sample message, and once he provides it, generates a live follow-up draft for one of his active deals. After he approves it, voice setup is complete and Aion drafts in his style going forward.

The existing state machine (`no_voice → needs_test_draft → configured`) is the right design. It just needs to fire.

## The gap

- `applyVoiceDefaultIfEmpty` bypasses the onboarding flow for all new workspaces by presetting `voice_default_derived: true`
- `updateAionConfigForWorkspace` does not clear `voice_default_derived`, so teaching Aion via chat never transitions out of the synthesized-default state
- No discoverability surface exists to prompt Daniel to start voice setup when `voice_default_derived === true`
- "Tune Aion's voice" in the sidebar overflow (which calls `resetAionVoiceConfig`) is the only way to re-enter the flow — it is an overflow menu item, not a first-visit nudge

## Options

### Option A: Fix the tool path, add a landing chip

- **What it is:** Two targeted changes: (1) in `save_voice_config` tool execute, clear `voice_default_derived` from the update when saving real voice content; (2) add a "Set up my drafting style" chip to the Aion landing page suggestions when `voice_default_derived === true`. The existing state machine and tools handle the rest.
- **Effort:** Small — roughly 20 lines total across `core.ts` and `AionLandingStarters.tsx`
- **Main risk:** The landing chip needs the server to pass `voice_default_derived` state to the client component; requires a small server→client prop thread.
- **Unlocks:** Daniel's described scenario works end-to-end in 3-4 chat turns. No new components needed.

### Option B: Dedicated voice setup card in the Aion sidebar

- **What it is:** A collapsible "Personalize Aion" card in `AionSidebar` shown when `voice_default_derived === true`. Single textarea: "Paste a message you're proud of, or describe how you talk to clients." Submit calls `saveAionVoiceConfig` directly (which already strips `voice_default_derived`) and dispatches a synthetic "offer me a test draft" message into chat.
- **Effort:** Medium — ~1 day. New sidebar section, server action call from client, synthetic message dispatch, loading/error states.
- **Main risk:** Adds a parallel voice setup path alongside the chat-based one; risk of inconsistency or duplication.
- **Unlocks:** More direct than Option A — single-step voice save with less LLM uncertainty about extracting fields from free text.

### Option C: Remove the synthesized-default bypass entirely

- **What it is:** Delete the `applyVoiceDefaultIfEmpty` call (or change it to never set `voice_default_derived`). Every new workspace starts at `no_voice` and always sees the voice onboarding prompts on first open.
- **Effort:** Small — but affects every new workspace and all first-visit greetings.
- **Main risk:** Existing workspaces that have `voice_default_derived: true` stored would re-enter onboarding unexpectedly. The synthesized default was introduced specifically so new users aren't blocked on voice setup before they can ask Aion anything — removing it means every new user must complete setup before using other chat features.
- **Unlocks:** Clean: no bypass, no flag to track.

## Recommendation

Option A. The state machine, tools, and prompt logic are already correct. The only missing pieces are (1) the `save_voice_config` tool path not clearing `voice_default_derived` and (2) no first-visit nudge. Both are localized fixes.

Specifically in the `save_voice_config` tool execute callback (`core.ts:127`): when `params.description` or `params.example_message` are set (i.e., the user is saving real content), include `voice_default_derived: false` in the update passed to `updateAionConfigForWorkspace`. This clears the bypass so the state machine proceeds normally on the next config read. Then add a `voice_default_derived` prop to `AionLandingStarters` and conditionally render a "Set up my drafting style" chip that sends the message "Let me tell you how I write to clients" — which triggers the `no_voice` onboarding path naturally.

Option C is tempting but blocks users from using Aion until voice setup is complete; the original bypass was deliberate. Option B is more code for not much additional UX improvement.

The tradeoff you're accepting: voice setup still lives in chat rather than a dedicated form. If the LLM misclassifies a user's intent and doesn't call `save_voice_config`, setup doesn't happen. That's a known risk in the tool-calling pattern and can be patched with better tool descriptions or a fallback form later.

## Next steps for Daniel

1. In `src/app/api/aion/chat/tools/core.ts` around line 127 (the `save_voice_config` execute): add `if (params.description || params.example_message) update.voice_default_derived = false;` before the `updateAionConfigForWorkspace` call.
2. In `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` around line 84 (`getAionConfig`): return `voice_default_derived` as part of the response (it's already in the spread; confirm it reaches the client via the config object).
3. In `src/app/(dashboard)/aion/page.tsx` (or wherever `AionPageClient` is mounted): pass `voice_default_derived` from the server config to `AionLandingStarters`.
4. In `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx`: when `voice_default_derived === true`, push a "Set up my drafting style" chip that sends `"Let me tell you how I write to clients — here's my style:"` as the user's first message.
5. Run the existing voice-intent gate test suite (`npm run test -- voice-intent-gate`) and add a test for the `voice_default_derived` clearing path in the `save_voice_config` tool.
6. Smoke-test: open `/aion` fresh, click the chip, type 3 paragraphs, confirm Aion calls `save_voice_config`, confirms saving, then asks for an example message.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `getAionConfig`, `saveAionVoiceConfig`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, the 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding section injection into system prompt
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool (execute path is the fix site)
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, voice injection into draft prompt
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx` — overflow "Tune Aion's voice" affordance
