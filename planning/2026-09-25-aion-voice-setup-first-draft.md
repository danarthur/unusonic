# Aion voice setup and first real draft — Phase A scope

_Researched: 2026-09-25 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: this question was authored against an April 2026 codebase snapshot. The current state (September 2026) has advanced significantly. The doc reframes against what actually exists today._

## Current state

The planning primer's description of a paused Brain tab and a missing `aion_config` column is outdated. The full Aion chat system is live and the voice-setup machinery is complete.

**`aion_config` column exists.** `getAionConfigForWorkspace` and `saveAionVoiceConfig` read/write `public.workspaces.aion_config` as JSONB today (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`).

**`AionConfig` type is fully defined** with `voice` (description, example_message, guardrails), `learned` (vocabulary, patterns), `follow_up_playbook`, `onboarding_state`, and `kill_switch` (`aion-config-actions.ts:50`).

**5-state onboarding machine is implemented.** `getOnboardingState()` maps config → `no_voice | no_example | no_guardrails | needs_test_draft | configured` (`aion-chat-types.ts:247`). The chat route reads this state on every turn.

**Greeting and system prompt both handle all 5 states.** `buildGreeting()` returns state-specific opening messages with chips (`route/prompts.ts:301`). `buildSystemPrompt()` injects onboarding instructions per state (`route/prompts.ts:284`).

**`save_voice_config` tool exists and works.** It saves description/example_message/guardrails to `aion_config` via `updateAionConfigForWorkspace` (`chat/tools/core.ts:118`).

**`draft_follow_up` tool exists and works.** It generates a draft using `buildDraftPrompt` — which includes voice config, learned vocabulary, and drafting playbook rules — for a specific deal or the top-priority queue item (`chat/tools/core.ts:318`).

**However: the onboarding flow is bypassed for new workspaces.** `applyVoiceDefaultIfEmpty()` synthesizes a default voice from the workspace name and sets `voice_default_derived: true` (`aion-config-helpers.ts:35`). `getOnboardingState` returns `'configured'` immediately when this flag is set (`aion-chat-types.ts:248`). New workspaces never see the 4-step flow on first open.

**The only trigger for explicit onboarding is the Sidebar overflow.** "Tune Aion's voice" in `AionSidebar.tsx:1043` calls `resetAionVoiceConfig()`, clears the derived flag, and re-enters the forcing sequence on next load.

**`draft_follow_up` fails at the final onboarding step when the queue is empty.** If the workspace has no deals, the tool returns `{ error: 'No deals in the follow-up queue.' }` (`core.ts:334`). The `needs_test_draft` greeting offers "Yes, try one" — but it breaks for a fresh workspace.

## Intended state

Per the question: Daniel opens the Brain (Aion) tab on a fresh workspace, writes 3 paragraphs about how he talks to clients, and immediately sees a generated follow-up draft that respects that voice. This is a first-run onboarding loop that ends in proof-of-value.

The 4-step machine and all supporting tools already deliver this — for a workspace that has been explicitly reset to onboarding. The gap is: (1) first-run workspaces skip the flow by default, and (2) the test-draft step fails when there are no live deals to draft for.

## The gap

- New workspaces get a synthesized default voice and land in `configured` state — the 4-step onboarding flow never fires on first open.
- The entry point for the explicit flow (`AionSidebar` overflow → "Tune Aion's voice") is a secondary affordance, not a first-run CTA.
- `draft_follow_up` at the `needs_test_draft` step returns an error for workspaces with no deals; the chat stalls at the final proof-of-value moment.

## Options

### Option A: Add hypothetical-mode to `draft_follow_up`

- **What it is:** When `draft_follow_up` is called but the queue is empty, instead of returning an error, generate a short illustrative draft using the workspace's voice config against a fictional inquiry scenario ("A client just emailed about a rooftop corporate dinner for 80 guests…"). Label it clearly as a hypothetical so Daniel knows it is not a real deal.
- **Effort:** Small. Change is isolated to `core.ts:332–336`. One new branch, same prompt builder.
- **Main risk:** The hypothetical might feel hollow compared to a real deal — Daniel may not feel confident the voice is working until he sees it on actual data.
- **Unlocks:** The `needs_test_draft` step completes for any workspace, including fresh ones. The onboarding loop closes. Combined with manually triggering "Tune Aion's voice," Daniel can walk through the full experience today.

### Option B: Replace the default-voice bypass with a first-run setup notice

- **What it is:** Remove the `applyVoiceDefaultIfEmpty` bypass so new workspaces land in `no_voice` and see the full onboarding sequence on their first open. To avoid disrupting existing workspaces that got the synthesized default, add a one-time migration: set `voice_default_derived` = false only for workspaces that have had zero chat activity (check `cortex.aion_sessions` count). Active workspaces keep the synthesized default.
- **Effort:** Medium. Requires a migration RPC or backfill script, changes to `aion-config-helpers.ts`, and a test pass to confirm existing sessions are unaffected.
- **Main risk:** Migration scoping is error-prone. A miscalculated threshold re-prompts active users who already have working setups.
- **Unlocks:** New workspaces experience the "write → save → draft" loop as the default first session, not as an opt-in retune.

### Option C: Add an explicit "Set up Aion" CTA on the Aion landing state

- **What it is:** In `ChatInterface.tsx`, when `aionConfig.voice_default_derived === true` (loaded from the session's config context), show a dismissible banner above the input: "Aion is running on default settings — take 2 minutes to teach it your voice." One tap calls `resetAionVoiceConfig` and reloads. Combine with Option A's hypothetical-draft fallback.
- **Effort:** Small–medium. `ChatInterface.tsx` needs a config-awareness prop or hook, the banner component is ~30 lines, and the `resetAionVoiceConfig` call is already wired in the Sidebar.
- **Main risk:** Adding config-awareness to `ChatInterface` pulls in a prop that currently lives a layer up, requiring a pass-through from `AionPageClient` or a lightweight context read.
- **Unlocks:** The setup entry point becomes impossible to miss on first use, while leaving the existing pull-mode greeting intact for configured workspaces.

## Recommendation

**Ship Option A first, then Option C.** The voice setup state machine is complete, the onboarding conversation works when triggered, and the `save_voice_config` / `draft_follow_up` tools are fully wired. The only thing blocking Daniel from the intended experience is: (a) the entry point is buried in the Sidebar overflow, and (b) the final proof-of-value step breaks on a fresh workspace.

Option A (hypothetical draft fallback) is a single-file change that closes the loop immediately. Then Option C (setup banner for `voice_default_derived` workspaces) surfaces the entry point without removing the bypass entirely — so existing workspaces with the synthesized default are never disrupted.

Option B is the correct long-term answer but the migration risk for existing active workspaces is not worth taking before there are signals that the current bypass is a real problem (i.e., users staying on the synthesized default when they would have benefited from the explicit flow).

Tradeoff accepted: some workspaces will stay on the synthesized default indefinitely, because the banner is dismissible. That is fine — the synthesized voice is usable; the explicit onboarding is an upgrade, not a prerequisite.

## Next steps for Daniel

1. Verify the `needs_test_draft` failing case: in a test workspace with no deals, trigger "Tune Aion's voice" from the sidebar overflow, walk through voice setup, then tap "Yes, try one" and confirm the error message.
2. Edit `src/app/api/aion/chat/tools/core.ts` around line 332: replace the `queue.length === 0` early return with a hypothetical-mode call to `buildDraftPrompt` using a canned `AionDealContext` placeholder and a label like `"Hypothetical inquiry follow-up"`.
3. In `src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx` or `AionPageClient.tsx`, read `aion_config.voice_default_derived` (pass from a server component or fetch on mount) and render a dismissible setup banner when it is true.
4. Wire the banner's CTA to call `resetAionVoiceConfig()` (already exported from `aion-config-actions.ts`) and then `router.refresh()`.
5. Test the end-to-end: open `/aion` on a workspace with no explicit voice → see banner → tap setup → walk 4-step flow → tap "Yes, try one" → see hypothetical draft → confirm onboarding completes and banner disappears on next open.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, `OnboardingState`
- `src/app/api/aion/chat/route/prompts.ts` — `buildGreeting`, `buildSystemPrompt` (onboarding branches at line 284)
- `src/app/api/aion/chat/tools/core.ts` — `save_voice_config` (line 118), `draft_follow_up` (line 318)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx` — "Tune Aion's voice" entry point (line 1043)
