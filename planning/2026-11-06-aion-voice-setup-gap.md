# Aion voice setup: unblocking the first draft flow

_Researched: 2026-11-06 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on context gap:** The queue item was written against the April 2026 primer, which is significantly out of date. The codebase as of this research run is much further along — this doc describes what actually exists and where the real gap is.

## Current state

The queue item assumes two blockers that no longer exist:

**`aion_config` column does exist.** `getAionConfigForWorkspace()` reads from `workspaces.select('name, aion_config')` (`aion-config-actions.ts:106`) and writes to it via `saveAionVoiceConfig()` (`aion-config-actions.ts:178`). The column is a JSONB with a fully typed `AionConfig` shape.

**`/api/aion/route.ts` stub is gone.** It has been replaced by `/api/aion/chat/route.ts`, a 464-line authenticated streaming route with rate limiting, model routing, tool assembly, rolling summarization, and session scope resolution.

**The 4-step voice onboarding flow is fully implemented — but bypassed.** The system prompt builder at `prompts.ts:284-291` has explicit forcing blocks for each onboarding state: `no_voice` (ask for style), `no_example` (ask for an example message), `no_guardrails` (ask for rules), `needs_test_draft` (offer a sample draft). The `save_voice_config` tool at `core.ts:118` saves each answer. The `draft_follow_up` tool at `core.ts:318` generates a draft.

**The bypass:** `getOnboardingState()` checks `config.voice_default_derived === true` first and immediately returns `'configured'` (`aion-chat-types.ts:248`). `applyVoiceDefaultIfEmpty()` synthesizes a voice from the workspace name on every config read (`aion-config-helpers.ts:35`) and sets `voice_default_derived: true` in the in-memory config. This means every new workspace — including Daniel's — enters the chat in `'configured'` state and never sees the 4-step voice questions.

**Second gap:** The `needs_test_draft` system prompt says "Use draft_follow_up" (`prompts.ts:291`), but `draft_follow_up` requires a real deal in the queue (`core.ts:321`). A fresh workspace has none. The test-draft step would stall or produce a confusing "no deals" error.

**Existing escape hatch:** The Aion sidebar has a "Tune Aion's voice" affordance (using the `Mic2` icon, `AionSidebar.tsx:20`) that calls `resetAionVoiceConfig()`. This clears the voice and flags, so the next chat hit sees `no_voice` and enters the 4-step flow. But there is no form-based path.

## Intended state

Daniel opens Aion, writes a free-form description of how he communicates with clients, and immediately sees a draft that proves Aion absorbed it. The experience should not require knowing to click "Tune Aion's voice" first, and should not require an existing deal in the queue to produce the sample.

The machinery for this is entirely built. What's missing is the entry point that makes it intentional rather than hidden.

## The gap

- `voice_default_derived` bypass in `getOnboardingState()` (`aion-chat-types.ts:248`) silently skips the 4-step onboarding for new workspaces
- `needs_test_draft`'s forcing block calls `draft_follow_up` which requires a deal — empty workspaces stall here
- No form-based voice-setup path; the only entry points are the organic chat (bypassed) and the sidebar affordance (not obvious on first visit)

## Options

### Option A: Remove the bypass — restore the chat-based onboarding flow

- **What it is:** Delete the `voice_default_derived === true` early return from `getOnboardingState()` (one line, `aion-chat-types.ts:248`). Separately, update the `needs_test_draft` forcing block to allow Aion to generate a demo draft with invented context if no deals exist (a one-sentence change to `prompts.ts:291`).
- **Effort:** Small — 2 file edits, one test update
- **Main risk:** Existing workspaces currently on a synthesized default will get the 4-step voice questions on their next chat session. This is a one-time interruption; most users will complete or dismiss in under 2 minutes.
- **Unlocks:** Every new workspace hits the voice setup flow immediately on first chat. No new UI needed.

### Option B: Dedicated voice-setup form at `/settings/aion/voice`

- **What it is:** A new page with a single textarea ("Describe how you communicate with clients"), an LLM call (fast model) that parses the free text into the three structured voice fields, calls `saveAionVoiceConfig()`, and immediately renders a sample draft via `generateFollowUpDraft` with mock deal context. Reachable from the Aion sidebar overflow and from a first-session CTA.
- **Effort:** Medium — new page component, server action for LLM-to-voice-fields parse, mock-context draft preview, sidebar CTA wiring
- **Main risk:** The LLM parse step adds latency and a potential failure mode (bad parse → confusing fields). Requires test coverage.
- **Unlocks:** The exact "write → see draft" experience Daniel described. Composable as the first step in a broader onboarding wizard.

### Option C: First-session CTA chip in the Aion greeting

- **What it is:** When `voice_default_derived === true`, extend `buildGreeting()` to include a prominent suggestion chip: "Set up my voice". Clicking it sends a synthetic message that resets the voice config (calling `resetAionVoiceConfig()`) and enters the chat-based 4-step flow. No new page needed.
- **Effort:** Small-medium — `buildGreeting()` already supports chips; the reset + chat reentry is one async action
- **Main risk:** Still relies on the chat-based 4-step flow, which is back-and-forth rather than "write once → see draft." The `needs_test_draft` stall on empty workspace still applies.
- **Unlocks:** Surfaces the entry point without requiring a form. Lower bar than Option B.

## Recommendation

**Ship Option A immediately as the unblocking step, then follow with Option B.**

Option A is a 30-minute fix that restores the existing well-tested flow. The 4-step chat onboarding was built precisely for the described goal — Aion asks about style, example, and guardrails in sequence, calls `save_voice_config` after each answer, then offers a draft. The only reason it doesn't work today is a single early-return that bypasses it. Remove that line.

The only real work in Option A beyond the line deletion is fixing the `needs_test_draft` stall: change `prompts.ts:291` to say "if no deals exist in the queue, generate a hypothetical draft using the voice the user just described" so the final step lands even on a fresh workspace.

Option B is the right follow-on once the chat flow is validated with real users. The form gives the "one-screen" experience Daniel described, but it requires an LLM parse step that could produce malformed voice fields. Building it on top of a known-working chat flow is safer than building it cold.

Option C is a reasonable stop-gap but inherits the stall problem. Skip it; Option A is simpler and fixes the root cause.

## Next steps for Daniel

1. **Open `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:248`** — remove the `if (config.voice_default_derived === true) return 'configured';` line.
2. **Open `src/app/api/aion/chat/route/prompts.ts:291`** — change the `needs_test_draft` forcing block text to: `'Offer a test draft based on the voice the user just described. If no deals exist in the queue, generate a short hypothetical follow-up for a demo client. Use draft_follow_up if deals exist; otherwise draft inline.'`
3. **Run `npm run test`** — `aion-config-actions.test.ts` has onboarding-state assertions; verify they pass with the bypass removed and update if needed.
4. **Open `/aion` in a workspace with no manually-set voice** — confirm the chat opens with a question about communication style rather than jumping to general mode.
5. **Walk the full 4-step flow** — answer the style question, example, guardrails; confirm Aion calls `save_voice_config` after each; confirm the final step produces a draft.
6. **File Option B as the next queue item** — once the chat flow is validated, scope the `/settings/aion/voice` form.

## References

- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247-257` — `getOnboardingState()` with the bypass
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` — `applyVoiceDefaultIfEmpty()` and the `voice_default_derived` flag
- `src/app/api/aion/chat/route/prompts.ts:284-292` — onboarding forcing blocks
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft` and voice injection
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:31` — `resetAionVoiceConfig` wiring
