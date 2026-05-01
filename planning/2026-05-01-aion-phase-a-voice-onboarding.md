# Aion Phase A: Voice Setup and First Draft

_Researched: 2026-05-01 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** The planning primer's "current notable state" was written 2026-04-10. As of 2026-05-01, most Phase A infrastructure has shipped. This document scopes what's actually left.

## Current state

**Infrastructure: fully shipped.**

`aion_config` exists as a `Json` column on `public.workspaces` (`src/types/supabase.ts:7617`). The `AionConfig` type (`src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74`) holds `voice?: AionVoiceConfig` with `description`, `example_message`, and `guardrails`. All CRUD for the column exists: `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `updateAionConfigForWorkspace` (same file, lines 84–290).

The `/api/aion/chat/route.ts` is a full 450-line authenticated route, not the 16-line stub the primer describes. It includes model routing, streaming, tool-calling loop, and session management. The `save_voice_config` tool is wired into the chat (`src/app/api/aion/chat/tools/core.ts:118-144`) and accepts `description`, `example_message`, `guardrails`, and `onboarding_complete` in a single call.

The 5-state onboarding machine (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257`) drives chat behavior via `getOnboardingState()`: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state has a distinct greeting and system-prompt instruction (`src/app/api/aion/chat/route/prompts.ts:275-338`). At `needs_test_draft`, the chat offers "draft a test message for my top priority deal."

`/api/aion/draft-follow-up/route.ts` exists (line 1): authenticated, tier-gated, loads voice config, calls `generateFollowUpDraft`. That function (`src/app/api/aion/lib/generate-draft.ts:26-46`) injects voice description, example, and guardrails into the prompt. `getDealContextForAion` exists at `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:545`.

**Two gaps that block Daniel's stated goal:**

**Gap 1 — The `voice_default_derived` bypass.** `getAionConfig` calls `applyVoiceDefaultIfEmpty` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts`) which synthesizes a voice from the workspace name and sets `voice_default_derived: true`. `getOnboardingState` treats `voice_default_derived: true` as `'configured'` (`aion-chat-types.ts:248`). Result: a new workspace almost certainly skips the onboarding flow entirely. Daniel would need to know to use the sidebar overflow "Tune Aion's voice" item — which is not discoverable.

**Gap 2 — Sequential single-question onboarding.** The system prompt for `no_voice` tells the LLM: "Ask about communication style. Save via `save_voice_config`." (`prompts.ts:276`). It doesn't allow extracting all three fields from a multi-paragraph paste. Daniel pastes 3 paragraphs; the LLM saves description and then asks for an example separately. The "write it all, see a draft immediately" UX requires at least 4 chat turns under the current prompt design.

## Intended state

Daniel opens /aion (the "Brain tab"), is shown a clear setup CTA even if `voice_default_derived` has already fired, pastes 3 paragraphs describing how he works with clients, and Aion extracts description + example + guardrails in one turn, saves them, then immediately offers a test draft from the follow-up queue. Total friction: one paste plus one click.

## The gap

- No visible "Set up your voice" entry point for workspaces where `voice_default_derived` is set — the settings page (`/settings/aion/AionSettingsView.tsx`) covers card beta consent and cadence, not voice.
- System prompt for `no_voice` state instructs one-question-at-a-time; no multi-paragraph extraction path exists.
- No chip or CTA in the landing starters (`AionLandingStarters.tsx:41-52`) for voice setup.

## Options

### Option A: Patch the system prompt + add one CTA

Change the `no_voice` system prompt instruction from "Ask about communication style" to "The user may paste style, example, and rules in one message. Extract all three and call `save_voice_config` with all fields in a single call." Add a "Set up Aion's voice" chip to `NEW_WORKSPACE_STARTERS` in `AionLandingStarters.tsx` that fires `resetAionVoiceConfig()` then sends a priming message. That chip also needs to be surfaced when `voice_default_derived` is true — the sidebar overflow "Tune Aion's voice" already does the reset, so discoverability there just needs a docs note or a subtle settings link.

- **What it is:** Two-line system prompt change + one chip addition. No new components, no new routes.
- **Effort:** Small (1–2 hours)
- **Main risk:** LLM may still ask follow-up questions even with the new instruction; the test draft at `needs_test_draft` still requires an active deal in the queue.
- **Unlocks:** The "3 paragraphs → draft" flow works in one chat turn for users who find the entry point.

### Option B: Direct voice form in settings

Add a voice setup section to `AionSettingsView.tsx` — three labeled textareas (communication style, example message, rules) and a "Save" button calling `saveAionVoiceConfig`. Below the form, a "Generate test draft" button that calls `/api/aion/draft-follow-up` against the top queue item and renders the result inline. This bypasses the chat entirely for the initial setup.

- **What it is:** New form section in `/settings/aion/AionSettingsView.tsx` + a fetch to the existing draft route.
- **Effort:** Medium (3–4 hours including the inline draft display)
- **Main risk:** Disconnected from Aion's conversational identity — feels like filling in a config form, not teaching an agent. Also doesn't address the discoverability of the settings page itself.
- **Unlocks:** A reliable, non-chat path to voice setup. Useful for re-tuning without resetting.

### Option C: "Paste it all" chip in the existing onboarding greeting

When the greeting state is `no_voice`, add a fourth chip: "Let me write it all at once." Its value primes the conversation: "I'll describe my style, give you an example, and share my rules all in one message. Extract everything and save it, then show me a test draft." The system prompt update from Option A is still required to make the LLM comply.

- **What it is:** One chip added to the `no_voice` greeting (`prompts.ts:305-309`) + the system prompt patch from Option A.
- **Effort:** Small (1 hour)
- **Main risk:** Same LLM compliance risk as Option A. Doesn't solve the discoverability gap for `voice_default_derived` workspaces.
- **Unlocks:** Marginally better UX than Option A for users already in the onboarding flow.

## Recommendation

**Option A, with one addition:** patch the system prompt and expose a "Set up voice" affordance from the settings page that resets `voice_default_derived` and links to /aion.

The settings page is the right discovery surface because owners looking to configure Aion already navigate there. Add a small `StagePanel` section to `AionSettingsView.tsx` titled "Voice" — just a single "Set up voice in Aion" button that calls `resetAionVoiceConfig()` and routes to `/aion`. No form, no textareas. The conversation handles the rest.

The system prompt patch is two lines and directly enables the "3 paragraphs → draft" flow. The button is one `Button` + `startTransition`. Together they take under 2 hours and require zero new routes, zero schema changes. The `needs_test_draft` draft step already works if a deal is in the queue — that's the only dependency outside this scope.

The tradeoff: if Daniel has no active follow_up_queue items, the test draft offer is vacuous. Accept it — the queue cron runs daily and the Phase 1 follow-up engine is live, so any workspace with open deals will have queue items within 24 hours of first use.

## Next steps for Daniel

1. **Patch system prompt** (`src/app/api/aion/chat/route/prompts.ts:276`): replace `'Ask about communication style. Save via save_voice_config.'` with `'The user may paste style, an example message, and rules all at once. Extract all three fields and call save_voice_config in a single call. Then ask about guardrails if they were absent.'`
2. **Add voice setup panel to settings** (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`): insert a `StagePanel` section with a button that calls `resetAionVoiceConfig()` then `router.push('/aion')`. Show it whenever `voice_default_derived` is true or voice is unconfigured.
3. **Verify the test draft path** by checking that a deal exists in `ops.follow_up_queue` for the test workspace — run a quick query in the SQL Editor.
4. **Smoke test the full loop** locally: (a) reset voice via settings button, (b) open /aion, (c) paste 3 paragraphs, (d) confirm draft appears after the `needs_test_draft` greeting.
5. **Clean up** `ION_SYSTEM` / `ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts` and `SIGNAL_SPRING_DURATION_MS` in `src/shared/lib/motion-constants.ts` — these are brand-rename leftovers flagged by the primer and unrelated to Phase A but easy to clear in the same session.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `AionVoiceConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — `getOnboardingState`, 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:275-338` — onboarding state → system prompt + greeting
- `src/app/api/aion/chat/tools/core.ts:118-144` — `save_voice_config` tool
- `src/app/api/aion/lib/generate-draft.ts:52-76` — voice injection into draft prompt
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page target for the new panel
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx:48-52` — existing new-workspace starter chips
