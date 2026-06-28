# Aion Phase A — voice setup and first draft: current state and next step

_Researched: 2026-06-28 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise of this question is significantly outdated. The codebase has fully implemented Phase A since at least Wk 11.

**`public.workspaces.aion_config` exists.** `aion-config-actions.ts:89-100` reads `workspaces.aion_config` (JSONB) on every request. The column is live in production.

**The chat route is fully authenticated and functional.** `src/app/api/aion/chat/route.ts:57-68` guards with `supabase.auth.getUser()`, tier gates, and kill-switch checks. The old 16-line stub is gone.

**A 5-state onboarding machine exists.** `aion-chat-types.ts:225-257` defines `no_voice → no_example → no_guardrails → needs_test_draft → configured`. `buildSystemPrompt` at `prompts.ts:275-283` injects an `=== ONBOARDING ===` block for each non-configured state. `buildGreeting` at `prompts.ts:292-340` returns guided questions at each step.

**`save_voice_config` and `draft_follow_up` are wired into the chat tools.** `core.ts:118-144` implements `save_voice_config` (captures description, example_message, guardrails, calls `updateAionConfigForWorkspace`). `core.ts:318-434` implements `draft_follow_up` (grabs top-queue deal, calls `buildDraftPrompt` with tone anchoring, generates via fast model).

**Voice is injected into every draft.** `generate-draft.ts:52-76` injects all three voice fields (`description`, `example_message`, `guardrails`) into the system prompt when present. Same in `core.ts:410`.

**The gap that blocks the stated goal is not missing infrastructure — it is a discoverability trap.** `aion-config-helpers.ts:35-45`: `applyVoiceDefaultIfEmpty` synthesizes a generic voice from the workspace name on every config read, setting `voice_default_derived: true`. `getOnboardingState` at `aion-chat-types.ts:248` returns `'configured'` when this flag is set. So all workspaces — including Daniel's — land in `configured` state and skip the guided onboarding entirely. The conversational setup can only be re-entered via a hidden affordance: sidebar overflow → "Tune Aion's voice" → `resetAionVoiceConfig()`.

**Secondary gap:** `draft_follow_up` at `core.ts:332-334` returns an error if the follow-up queue is empty and no deal is in `pageContext`. For a workspace with no queue entries, the `needs_test_draft` greeting offer fails silently.

## Intended state

Daniel opens `/aion`, sees a prompt inviting him to tune Aion's voice for his style, writes how he communicates with clients (description + an example message + guardrails), and immediately gets a test draft for a real deal. The draft reflects his voice, not the synthesized generic. This loop takes under 5 minutes on first use.

## The gap

- `voice_default_derived: true` bypasses onboarding for all workspaces — there is no natural entry to voice setup without knowing the hidden sidebar overflow
- No settings form at `/settings/aion` for explicit voice entry (the settings page today only covers the Aion card beta consent toggle)
- `draft_follow_up` errors if no queue entry exists and no deal is in scope — the test draft in `needs_test_draft` fails for zero-queue workspaces

## Options

### Option A: Voice-default nudge in the configured-state greeting
- **What it is:** Modify `buildGreeting` for the `configured` case to detect `voice_default_derived === true` and inject a first-turn message: "I'm running on a generic voice for your workspace. Want to tune it for how you actually write?" with a [Tune my voice] chip that sends the user toward the reset flow.
- **Effort:** Small — 10-20 lines in `prompts.ts`, single chip value that resets config.
- **Main risk:** The user taps the chip, which triggers `resetAionVoiceConfig`, then must re-enter the multi-turn conversational flow. Still 4 turns to completion.
- **Unlocks:** Discovery. Daniel learns the path exists.

### Option B: Voice setup form in `/settings/aion`
- **What it is:** Add a "Your voice" section to `AionSettingsView.tsx` (or a new tab at `/settings/aion/voice`) with three labeled textareas: communication style, example message, guardrails. On save, calls the existing `saveAionVoiceConfig` server action directly. After saving, show a [Draft a test message] link to `/aion`.
- **Effort:** Medium — new form component, connects to the existing action, no schema work needed.
- **Main risk:** Daniel writes good voice config but then finds the test draft fails on zero-queue workspace. Needs the queue fix (Option C) to complete the loop.
- **Unlocks:** The exact "3 paragraphs" UX Daniel described. No multi-turn conversation required.

### Option C: Fallback context for test drafts with no queue
- **What it is:** In the `needs_test_draft` greeting and in `draft_follow_up`, when the queue is empty, use a stub context ("imagine a recent inquiry, no proposal sent yet") so the draft generates something illustrative rather than erroring. Return it clearly labeled as an example.
- **Effort:** Small — modify `draft_follow_up` in `core.ts:332-334` to fall through to a synthetic context instead of returning `{ error: ... }`.
- **Main risk:** The draft is abstract (no real client name, date). Low signal but still demonstrates voice.
- **Unlocks:** The `needs_test_draft` completion loop for zero-queue workspaces.

## Recommendation

Do Option B first, then C as a follow-up fix. Skip Option A as a standalone — a chat nudge that leads into a 4-turn conversation is worse UX than a form.

Option B is the "3 paragraphs" UX Daniel described, and the infrastructure is already there: `saveAionVoiceConfig` (`aion-config-actions.ts:178-206`) takes the exact three fields, and after save the cleared `voice_default_derived` flag means the next Aion session opens in `configured` state with real data. The whole settings form is ~60 lines of TSX calling an action that already exists.

Option C is the obvious follow-on: once the form is wired, the test-draft link from settings goes to `/aion`, and for workspaces with no queue entries the `needs_test_draft` path should still produce something useful. Change `core.ts:332-334` from `return { error: 'No deals...' }` to falling through with a synthetic "first inquiry" context, labeled clearly.

The conversational onboarding path in chat continues to exist as the secondary entry point — it's already fully built and will work correctly for workspaces that reset their voice config.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — add a "Your voice" `StagePanel` section with three `<textarea>` fields (style, example, guardrails). Wire to `saveAionVoiceConfig` from `aion-config-actions.ts`.
2. Add a `getAionConfig()` call to `src/app/(dashboard)/settings/aion/page.tsx` and pass the current voice values as default form values so Daniel sees what's already stored.
3. After save, navigate to `/aion` (or show a [Draft a test message] chip inline).
4. In `src/app/api/aion/chat/tools/core.ts:332-334`, replace the queue-empty early return with a synthetic fallback context that still generates a demo draft.
5. Optionally: in `buildGreeting` for `configured` + `voice_default_derived === true`, add a subtle one-liner nudge toward Settings so discoverers can find the form.
6. Run `npm run test` — `aion-config-actions.test.ts` covers the save/reset paths; add a test for the fallback draft context.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `resetAionVoiceConfig`, `AionConfig`/`AionVoiceConfig` types
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:275-283` — onboarding section injection; `prompts.ts:340-434` — configured greeting
- `src/app/api/aion/chat/tools/core.ts:118-144` — `save_voice_config` tool; `:318-434` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — voice injection into draft prompt
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings page (consent only)
