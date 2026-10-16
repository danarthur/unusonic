# Aion voice setup → first real draft: what's actually left

_Researched: 2026-10-16 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: this question was written against the April 2026 codebase snapshot. Several of its stated preconditions no longer hold as of October 2026. This doc describes what has shipped and what the remaining gap actually is._

## Current state

**The `aion_config` column exists.** `public.workspaces.aion_config` is a live JSONB column, read by `getAionConfig()` and `getAionConfigForWorkspace()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84,106`. The Brain tab (now just the `/aion` page) is fully functional — `ChatInterface.tsx`, `AionInput.tsx`, and `AionVoice.tsx` are all wired.

**The 4-step onboarding flow is built.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` defines a 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`). `buildGreeting()` at `src/app/api/aion/chat/route/prompts.ts:301` returns state-specific cold-open greetings for each step. When state is `needs_test_draft`, the greeting offers a test draft with two suggestion chips.

**Voice is injected into both the chat and draft routes.** `buildSystemPrompt()` at `prompts.ts:97` injects `voice.description`, `example_message`, and `guardrails` into Aion's system prompt. `buildFollowUpPrompt()` at `src/app/api/aion/lib/generate-draft.ts:63` injects the same three fields into follow-up generation. `/api/aion/draft-follow-up` already reads `aionConfig.voice` and passes it to `generateFollowUpDraft()` (`draft-follow-up/route.ts:53,61`).

**`save_voice_config` tool exists.** The tool at `src/app/api/aion/chat/tools/core.ts:118` accepts `description`, `example_message`, `guardrails`, and `onboarding_complete`. Its description already says "Call this whenever the user describes how they talk to clients."

**The bypass is deliberate.** `applyVoiceDefaultIfEmpty()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a voice from the workspace name when none is stored, sets `voice_default_derived: true`, and `getOnboardingState()` returns `configured` immediately for all such workspaces. This skips the 4-step flow for every new workspace by design (Wk 11 §3.8). Re-entry is via "Tune Aion's voice" in the sidebar overflow, which calls `resetAionVoiceConfig()`.

## Intended state

Daniel opens `/aion`, is either greeted with the voice-setup prompt or taps a clearly visible CTA, writes 3 paragraphs, and Aion — in the same conversational turn — confirms what it saved and generates a draft for a real deal so Daniel can see the voice in action. One session, no context switching.

## The gap

- **Entry point is buried.** "Tune Aion's voice" is in the AionSidebar overflow menu. There is no prominent CTA on the landing pane that says "teach Aion your style." `NEW_WORKSPACE_STARTERS` in `AionLandingStarters.tsx` has "Draft a first message to a client" but that goes to a generic draft, not the voice-setup flow.
- **In-turn pivot is missing.** After `save_voice_config` fires mid-conversation, the system prompt has no instruction to pivot immediately to a draft offer. The `=== ONBOARDING ===` block at `prompts.ts:284` only says "Ask about communication style. Save via save_voice_config." — nothing after that. The `needs_test_draft` state only surfaces on the *next* cold-open (messages.length === 0 greeting), so Daniel would have to start a second fresh session to see it.
- **Voice config does NOT update the system prompt mid-turn.** `refreshConfig()` is called after `save_voice_config` executes, but the system prompt was already assembled at turn start. Aion's in-turn behavior post-save is entirely LLM inference, not instructions.

## Options

### Option A: Add an in-turn pivot instruction to the system prompt
- **What it is:** In `prompts.ts` at the `no_voice` onboarding block (line 284), extend the instruction to say: "After calling save_voice_config, confirm what you saved, then immediately ask if they want you to generate a test draft for their top-priority deal right now."
- **Effort:** Small (1 file, ~3 lines)
- **Main risk:** The LLM has to successfully extract voice attributes from unstructured paragraphs and call the tool in the same turn. Ambiguous input (e.g. paragraphs that mix style with rules) may result in a partial save that doesn't fully satisfy the user.
- **Unlocks:** The "3 paragraphs → draft" path works in a single session without requiring a second cold-open.

### Option B: Option A plus a discoverable landing-pane CTA
- **What it is:** Option A plus adding a starter to `AionLandingStarters.tsx` (the `NEW_WORKSPACE_STARTERS` array, or a conditional shown whenever `voice_default_derived === true` so it appears before the user has customised their voice). CTA: "Teach Aion how you communicate." Value: "I want Aion to draft in my voice. Let me describe how I talk to clients."
- **Effort:** Small (2 files: `prompts.ts` + `AionLandingStarters.tsx`; the starter array and its props are already in place)
- **Main risk:** Showing the CTA after voice has already been tuned requires gating it on `voice_default_derived`, which means the landing pane needs to know that flag. Currently `AionLandingStarters` is pure props — the parent would need to pass the flag.
- **Unlocks:** Discovery + correct flow in one session. Complete Daniel-described experience.

### Option C: Form-based voice config in /settings/aion
- **What it is:** Add a `VoiceConfigForm` component under `/settings/aion` with three labeled text areas (description, example, guardrails) and a "Preview a draft" button that calls `/api/aion/draft-follow-up` with the workspace's top active deal.
- **Effort:** Medium (new component + server action for fetching a sample deal, wiring `saveAionVoiceConfig`)
- **Main risk:** Creates a second canonical path to voice config alongside the conversational one. Users who find the settings path never learn the chat teaches Aion contextually. Long-term the two paths diverge.
- **Unlocks:** Predictable, form-like UX. Good fallback for users who don't trust conversational AI with configuration.

## Recommendation

**Option B.** The infrastructure is fully in place. The only missing pieces are two small edits that together give Daniel the experience described in the question: a visible entry point, and an instruction that keeps Aion in a draft-offering posture after saving voice config.

The form (Option C) is tempting for predictability, but it bypasses the thing that makes Aion's voice training distinct — it learns from prose, not checkboxes. The conversational path is the product vision. The form becomes a crutch that defers the real fix.

The tradeoff to accept with Option B: the mid-turn pivot relies on LLM behavior after `save_voice_config` fires. If Aion interprets the 3 paragraphs but calls the tool with only `description` and not `example_message`, the onboarding state will be `no_example` on the next cold-open, not `needs_test_draft`. Adding a short note to the `save_voice_config` tool description ("If the user provides an example message in the same input, extract and populate example_message too") reduces this risk without changing the tool schema.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/route/prompts.ts` at line 284. Change the `no_voice` ONBOARDING instruction to: `'After calling save_voice_config, confirm what you saved in one sentence. Then ask: "Want me to generate a test draft for one of your active deals right now so you can see how it sounds?"'`
2. At `src/app/api/aion/chat/tools/core.ts:119`, extend the `save_voice_config` description to add: `"If the user pastes a multi-part message covering style, an example, and rules — extract all three and populate all fields in one call."`
3. In `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx`, add a starter to `NEW_WORKSPACE_STARTERS`: `{ label: 'Set up Aion\'s voice', value: 'I want Aion to draft in my voice. Let me describe how I talk to clients.' }`. The `isNewWorkspace` prop already gates this array.
4. Make `AionPageClient.tsx` (or whichever component renders `AionLandingStarters`) pass `isNewWorkspace={config?.voice_default_derived === true}` — this ensures the CTA appears for any workspace that hasn't explicitly tuned their voice, not just brand-new ones.
5. Smoke-test by calling `resetAionVoiceConfig()`, opening `/aion`, tapping the new CTA, and pasting 3 paragraphs. Verify the draft appears in the same reply.
6. If the draft doesn't fire in the same turn, add `drafting` as a third onboarding-state instruction: after no_guardrails is resolved, the `needs_test_draft` system prompt block at line 290 should also say "proactively call draft_follow_up with the top-priority deal without waiting for the user to ask."

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:284,301` — `buildSystemPrompt` onboarding block, `buildGreeting`
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt` voice injection
- `src/app/(dashboard)/(features)/aion/components/AionLandingStarters.tsx` — starter CTAs
