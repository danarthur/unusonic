# Aion Phase A — Voice Setup + First Real Draft: Minimum Path

_Researched: 2026-08-11 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: Two premises in the question are outdated as of this run. `aion_config` exists and is fully wired. The Brain tab is not paused. Both were likely true at an earlier point; the primer (noted as circa 2026-04-10) reflects that earlier state. This doc scopes the actual remaining gap._

## Current state

**`aion_config` exists and is wired.** Migration `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` added the column. `getAionConfig()` and `getAionConfigForWorkspace()` read it in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84,106`.

**The full chat system is live.** `/api/aion/chat/route.ts` is a real authenticated, tier-gated, tool-calling route — not a stub. It loads voice config on every turn (`route.ts:108`), derives `onboardingState` via `getOnboardingState()` (`route.ts:122`), injects it into the system prompt (`prompts.ts:275–283`), and returns a structured greeting on empty conversations (`route.ts:126`).

**The onboarding state machine is complete.** Five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Greetings for each state are in `prompts.ts:300–338`. The `save_voice_config` chat tool (`chat/tools/core.ts:118`) captures description, example message, and guardrails and persists them via `updateAionConfigForWorkspace`.

**`/api/aion/draft-follow-up` is live.** Auth, tier gate, kill-switch check, and `generateFollowUpDraft()` call all exist (`draft-follow-up/route.ts`). Voice config is injected into the generation prompt (`lib/generate-draft.ts:62–74`). The `draft_follow_up` chat tool (`core.ts:318`) calls this route from inside a conversation turn.

**The real problem.** New workspaces skip onboarding entirely. `applyVoiceDefaultIfEmpty()` (`aion-config-helpers.ts:36`) synthesizes a voice from the workspace name and sets `voice_default_derived: true` on every config read when no explicit voice is stored. `getOnboardingState()` short-circuits to `'configured'` when that flag is set (`aion-chat-types.ts:248`). Result: Daniel opens the Brain tab, gets the pull-mode "what's on your mind" greeting, and has no prompt to teach Aion his voice.

**The sidebar "Tune Aion's voice" affordance doesn't escape this.** `resetAionVoiceConfig()` strips the voice fields from the DB, but the next `getAionConfig()` call immediately re-synthesizes a new default with `voice_default_derived: true`. The onboarding never re-fires.

## Intended state

Daniel opens the Brain tab for the first time (or clicks "Tune voice"), dumps three paragraphs about how he communicates, and Aion: (1) saves the voice config in one pass, and (2) immediately chains to a draft for a live deal so Daniel sees the voice in action before the conversation ends.

## The gap

- `buildGreeting` for `'configured'` state receives `OnboardingState` but not the config — it cannot distinguish a synthesized default from a deliberately set voice, so it treats both identically.
- No single-turn "paste your style → get a draft" shortcut. The conversational flow requires multiple turns.
- `resetAionVoiceConfig` cannot re-enter the onboarding flow because `applyVoiceDefaultIfEmpty` re-synthesizes the default immediately.
- No first-visit prompt or chip in the configured greeting when `voice_default_derived === true`.

## Options

### Option A: Zero-code — Daniel teaches Aion via chat today

- **What it is:** Daniel types his 3 paragraphs in the Brain tab. The `save_voice_config` tool description says "call this whenever the user describes how they talk to clients" — Aion should extract and save. He then asks "draft a follow-up for [deal]." Two turns, no code change.
- **Effort:** Zero
- **Main risk:** Discovery. Daniel doesn't know to do this. The greeting doesn't invite it. Aion's extraction accuracy across one large freeform blob is best-effort — all three fields (description, example, guardrails) may not be populated correctly.
- **Unlocks:** Daniel can test his voice today without waiting for a sprint.

### Option B: Soft-onboarding chip in the configured greeting

- **What it is:** Pass the `AionConfig` as a new param to `buildGreeting`. When `voice_default_derived === true`, inject a chip into the configured greeting: `{ label: 'Teach Aion your voice', value: 'Let me describe how I talk to clients — I want to write a few paragraphs.' }`. The system prompt already instructs Aion to save voice and offer a draft during onboarding, so clicking the chip naturally flows into save → draft without additional code.
- **Effort:** Small (change `buildGreeting` signature, update the single caller in `route.ts`, add the conditional chip row).
- **Main risk:** The chip only fires on first message (greeting). Return visits to a configured workspace won't see it. The re-entry path ("Tune voice") still needs its own fix.
- **Unlocks:** First-visit voice setup is discoverable without any infrastructure work.

### Option C: Fix the re-entry loop + add a single-turn voice intake

- **What it is:** Two coordinated fixes. (1) Introduce a `force_onboarding` flag to `AionConfig`. `resetAionVoiceConfig` sets it; `applyVoiceDefaultIfEmpty` skips synthesis when it is present. This makes the "Tune Aion's voice" sidebar affordance actually re-enter the onboarding flow. (2) Add a `voice_intake` intent to the chat route: when the user sends a large block about communication style AND no explicit voice is stored, Aion calls `save_voice_config` followed by `draft_follow_up` in the same tool-calling step.
- **Effort:** Medium (config schema change, migration to default `force_onboarding: null`, update `applyVoiceDefaultIfEmpty`, update `resetAionVoiceConfig`, add intent hint to system prompt).
- **Main risk:** Multi-tool chaining in one LLM turn is more likely to miss a step under latency pressure. Schema change requires a migration.
- **Unlocks:** Full lifecycle — first visit, re-entry, and the one-shot brain-dump experience Daniel described.

## Recommendation

Ship **Option B** this sprint. It delivers the specific experience in the queue (Daniel writes about his style, Aion responds with a draft) with a one-file, two-function change — no schema migration, no tool-chain risk. The synthesized-default detection chip is already semantically correct: `voice_default_derived === true` is the exact signal that means "no real voice input has been given yet."

Once Option B is live and Daniel has used it, the re-entry loop bug (Option C, part 1) is the right next thing — but it requires a deliberate decision about whether to add a `force_onboarding` column or use a different sentinel, and it is not blocking the day-1 experience.

Option A is useful as unblocking information for Daniel right now (he can do this today), but it should not be the shipped answer — it has no guardrails.

## Next steps for Daniel

1. **Today, to test immediately:** Open the Brain tab, type: "Here's how I communicate with clients: [your 3 paragraphs]." Aion will save it via `save_voice_config`. Then type: "Draft a follow-up for my highest-priority deal." That is Option A working today, no code needed.

2. **To implement Option B:** In `src/app/api/aion/chat/route/prompts.ts`, add `config: AionConfig` as a fifth param to `buildGreeting`. In the `'configured'` case, when `config.voice_default_derived === true`, push a chip: `{ label: 'Teach Aion your voice', value: 'Let me describe how I talk to clients.' }`.

3. **Update the caller** in `src/app/api/aion/chat/route.ts:126` to pass `aionConfig` as the fifth argument.

4. **Manual test:** On a workspace with `voice_default_derived: true`, open `/aion` and confirm the chip appears. Click it, paste style text, confirm `save_voice_config` fires, then check `aion_config` in the DB.

5. **Follow-up sprint (separate):** Fix `resetAionVoiceConfig` to prevent `applyVoiceDefaultIfEmpty` from immediately re-synthesizing. The cleanest path is a `force_onboarding: boolean` field on `AionConfig` (nullable, no migration needed — JSONB field added defensively).

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `getAionConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `updateAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route.ts:122` — onboarding state derivation and greeting branch
- `src/app/api/aion/chat/route/prompts.ts:275,292` — system prompt onboarding injection + `buildGreeting`
- `src/app/api/aion/chat/tools/core.ts:118,318` — `save_voice_config` and `draft_follow_up` tools
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — authenticated draft endpoint
