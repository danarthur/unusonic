# Aion Phase A — Voice Setup and First Draft: Shipping Status

_Researched: 2026-11-11 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

Both premises in the question are outdated. The infrastructure shipped before this run fired.

**`aion_config` column exists.** Added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` and confirmed in `supabase/migrations/20260101000000_baseline_schema.sql:15058`. Reads and writes are live at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:93, 158, 198`.

**Brain tab is not paused.** `/api/aion/chat/route.ts` is a 464-line fully authenticated tool-calling route. The 16-line GPT-4-turbo stub mentioned in the primer was replaced long ago.

**Voice onboarding machine is wired.** A 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) lives at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`. Each state injects a one-line instruction into the system prompt at `src/app/api/aion/chat/route/prompts.ts:284–292`, steering Aion to ask for the next field or generate a test draft.

**Voice save tool exists.** `save_voice_config` at `src/app/api/aion/chat/tools/core.ts:118` writes `{description, example_message, guardrails}` to `aion_config.voice` via `updateAionConfigForWorkspace`.

**Draft generation with voice exists.** `draft_follow_up` at `core.ts:318` calls `generateFollowUpDraft` from `src/app/api/aion/lib/generate-draft.ts:25`, which builds a system prompt that injects all three voice fields before asking the model to draft.

**Learn-from-edit loop exists.** `src/app/api/aion/learn-from-edit/route.ts` extracts vocabulary swaps from draft edits and persists them to `aion_config.learned` and `cortex.aion_memory`.

## Intended state

Daniel opens `/aion`, the chat prompts for his communication style, he describes it in one message (or three), Aion calls `save_voice_config`, advances through example and guardrails, then at `needs_test_draft` calls `draft_follow_up` and shows a real draft. Daniel edits it, the edit fires `learn-from-edit`, and vocabulary preferences accumulate. Full circle, one session.

## The gap

- **Thin onboarding prompts.** The 4 injections at `prompts.ts:284–292` are one-liners (`'Ask about communication style. Save via save_voice_config.'`). The model must decide on its own when to call the tool and which field to populate. It frequently asks multiple clarifying questions before saving, turning a 2-minute flow into a 6-turn conversation.
- **Empty-queue test draft fails.** At `needs_test_draft`, `draft_follow_up` falls back to the top of the follow-up queue (`core.ts:332–335`). A workspace with no deals in the queue receives `{ error: 'No deals in the follow-up queue.' }` and onboarding stalls — the transition to `configured` never fires.
- **No UI hint that onboarding is running.** The chat opens to a greeting with no visual indication that a 3-step setup is in progress, so it feels like an open-ended conversation rather than a guided flow.

## Options

### Option A: Strengthen the onboarding prompts only
- **What it is:** Rewrite the 4 one-line injections at `prompts.ts:284–292` into multi-sentence instructions that tell Aion to collect all 3 fields in one structured sequence, confirm what it saved, and move to the next state. No schema or tool changes.
- **Effort:** Small (1 file, prompt text only)
- **Main risk:** Model compliance is probabilistic — a focused prompt helps but does not guarantee single-turn capture on every run.
- **Unlocks:** Faster onboarding for workspaces that already have deals in the queue.

### Option B: Dedicated voice setup form in `/settings/aion`
- **What it is:** Add a 3-field form (`description`, `example_message`, `guardrails`) to `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`, wired to the existing `saveAionVoiceConfig` server action. The chat onboarding arc remains as a secondary path.
- **Effort:** Small–medium (new UI section, existing action, no schema work)
- **Main risk:** Splits the setup surface across settings and chat; users may not know which is canonical, and both need to stay in sync when voice is updated.
- **Unlocks:** Reliable voice capture without LLM judgment; onboarding state advances deterministically on form submit.

### Option C: Fix the empty-queue draft + improve prompts
- **What it is:** Two targeted changes: (1) expand the `no_voice` prompt at `prompts.ts:284` to tell Aion to collect all three fields before saving, and (2) in `draft_follow_up` at `core.ts:332–335`, when the queue is empty and state is `needs_test_draft`, fall back to the workspace's most recently created deal rather than erroring out. If no deal exists at all, generate a synthetic placeholder so the arc can complete.
- **Effort:** Small (2 files: `core.ts`, `prompts.ts`)
- **Main risk:** A fallback to the most recent deal (regardless of queue priority) may produce a less urgent-feeling draft. The user will know it was generated from an arbitrary deal, not a real follow-up signal.
- **Unlocks:** The complete onboarding arc (`no_voice → configured`) runs in a single session even on sparse workspaces.

## Recommendation

Option C. The infrastructure is 95% shipped. Two specific failure modes keep the arc from completing reliably: thin prompts that make the model work too hard per turn, and the empty-queue error that stops onboarding entirely. Option C closes both in the minimum diff — no new UI, no schema changes, no migration needed. The fallback deal for the test draft is an acceptable tradeoff: its goal is to prove the voice config is working, not to be a production-grade follow-up signal.

Option B would give a more reliable experience (a form is deterministic; the chat is not), but it creates a split surface and adds non-trivial UI work for a feature that otherwise works. Consider it in a polish pass after the arc is proven end-to-end.

## Next steps for Daniel

1. Open `/aion` on a workspace that has at least one deal and step through the onboarding. If `save_voice_config` is never called, the prompt at `prompts.ts:284` is the place to fix first.
2. Open `/aion` on a fresh workspace with no deals. Verify that `draft_follow_up` returns the error — that confirms the bug is real and `core.ts:332–335` is the fix site.
3. In `src/app/api/aion/chat/tools/core.ts:332–335`, replace the early return with a fallback: query `public.deals` for the most recent deal, build a minimal `AionDealContext` from it, and proceed.
4. In `src/app/api/aion/chat/route/prompts.ts:284–285`, expand the `no_voice` injection to: ask for description, example, and guardrails together in a single framing message, then call `save_voice_config` once all three are provided.
5. After both fixes, run the arc end-to-end: 3 paragraphs in chat → voice saved → test draft generated → edit the draft → verify `learn-from-edit` fires.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `getAionConfigForWorkspace`, `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`, the 5-state machine
- `src/app/api/aion/chat/route/prompts.ts:284–292` — onboarding state injections
- `src/app/api/aion/chat/tools/core.ts:118, 318` — `save_voice_config`, `draft_follow_up`
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/api/aion/draft-follow-up/route.ts` — direct draft endpoint used outside chat
- `src/app/api/aion/learn-from-edit/route.ts` — vocabulary extraction from edits
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — `aion_config` column origin
