# Unblock Aion voice onboarding → first real draft

_Researched: 2026-09-04 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The queue item's premise is outdated.** The infrastructure it assumes is missing is largely production-ready as of 2026-09.

`aion_config` exists as a JSONB column on `public.workspaces`, typed in `src/types/supabase.ts:7862`. Its runtime shape (`AionConfig`) is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` with `voice: AionVoiceConfig` (`{ description, example_message, guardrails }`).

The 5-state onboarding machine is fully implemented:
- State machine: `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–256`
- Greeter: `src/app/api/aion/chat/route/prompts.ts:301–347` — each state returns a tailored greeting with quick-reply chips
- System prompt injection: `prompts.ts:284–292` — chat route steers the model to collect each field in sequence
- `draft_follow_up` chat tool: `src/app/api/aion/chat/tools/core.ts:318–649` — registered and fully wired; picks top-priority deal from queue if no `dealId` passed
- `/api/aion/draft-follow-up` route: `src/app/api/aion/draft-follow-up/route.ts:1–73` — standalone endpoint, reads `aion_config.voice`, calls `generateFollowUpDraft`
- Voice config writes: `saveAionVoiceConfig` at `aion-config-actions.ts:153`, `resetAionVoiceConfig` at `aion-config-actions.ts:209`
- Re-entry affordance: AionSidebar overflow "Tune Aion's voice" calls `resetAionVoiceConfig` (`AionSidebar.tsx:979`)

**The actual blocker** is in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45`. `applyVoiceDefaultIfEmpty` synthesizes a generic voice from the workspace name on every `getAionConfig` call, setting `voice_default_derived: true` in memory (but not to the DB). `getOnboardingState` then sees `voice_default_derived === true` and returns `'configured'` immediately (`aion-chat-types.ts:248`). New workspaces never hit the 4-step flow — they are silently pre-configured and routed to the `configured` greeting.

A secondary gap: at `needs_test_draft`, the `draft_follow_up` tool returns `{ error: 'No deals in the follow-up queue.' }` if no deals exist yet (`core.ts:334`). There is no graceful fallback — just a tool error the model must handle ad hoc.

## Intended state

Daniel opens the Aion chat for the first time. Aion asks him how he talks to clients (3 sequential conversational turns collect `description`, `example_message`, `guardrails`). After the third field is saved, Aion offers a test draft against his top-priority deal. He approves it, Aion marks `onboarding_state: complete`. From then on, every draft Aion generates reflects his real voice.

## The gap

- `applyVoiceDefaultIfEmpty` runs on every config read, masking the `no_voice` state for all fresh workspaces — the onboarding flow never fires.
- No fallback at `needs_test_draft` when the follow-up queue is empty (no deals yet).
- No prominent re-entry CTA in the `configured` greeting for workspaces that want to retune their voice (the sidebar overflow option exists but is buried).

## Options

### Option A: Surface a "personalize your voice" chip in the configured greeting
- **What it is:** When `voice_default_derived === true`, inject a chip into the `configured` greeting: "Personalize Aion's voice." Clicking it calls `resetAionVoiceConfig` in the session and re-enters the flow. No logic changes to the auto-synthesis path.
- **Effort:** Small — one greeting variant in `prompts.ts`, one chat message handler.
- **Main risk:** A chip is easy to dismiss. The onboarding still never fires automatically on first open; Daniel has to notice and click.
- **Unlocks:** Re-entry into the 4-step flow without requiring a settings page visit.

### Option B: Remove auto-skip for truly empty configs (recommended)
- **What it is:** In `getAionConfig` or the chat route's config read, skip `applyVoiceDefaultIfEmpty` when the DB row has no `voice` field at all (i.e., `aion_config` is `{}` or `null`). Existing workspaces that already had `voice_default_derived` written into their config row continue as before. Fresh workspaces get the real 4-step flow. Add a canned fallback at `needs_test_draft` for the empty-queue case ("Your voice is saved — Aion will use it when your first deal is created. Want to see a sample draft now?") that generates a mock draft from the voice config without a deal.
- **Effort:** Small — `aion-config-helpers.ts:35–45` gains a DB-vs-derived check; `core.ts:334` gains a fallback path.
- **Main risk:** Workspaces that were comfortable with auto-derived voice now see onboarding on first open. (Mitigated: they can skip immediately with "I am good for now.")
- **Unlocks:** The exact UX described in the queue: open Aion, 3 conversational turns, see a real draft.

### Option C: Dedicated voice setup form in settings
- **What it is:** A `<VoiceSetupForm>` in `/settings/aion` with three labeled textareas (`description`, `example_message`, `guardrails`) + a "Save and generate test draft" button that calls `saveAionVoiceConfig` then `draft_follow_up` against the top deal.
- **Effort:** Medium — new UI surface, new route, wires existing actions.
- **Main risk:** Splits the voice config UX across two surfaces (chat + settings); discoverability not better than the existing sidebar option.
- **Unlocks:** A power-user settings page, but does not fix the first-open experience.

## Recommendation

Ship **Option B**. The 4-step conversational flow is already production-quality — the greeter text, the chips, the sequential tool calls, the `needs_test_draft` draft offer. The only thing between Daniel and the experience he described is the `applyVoiceDefaultIfEmpty` call that silently skips it. Remove that skip for fresh (DB-empty) configs and the stated UX works without writing a line of new UI.

The empty-queue fallback is a two-line addition: at `core.ts:334`, instead of returning an error, generate a sample draft using only the voice config and a placeholder context. That lets the flow complete even for new workspaces with no deals.

Option A (chip in the greeting) is a good follow-up addition for workspaces that are already past onboarding and want to retune — add it in the same PR since it touches the same `prompts.ts` file.

Option C is a future hardening task, not a blocker.

## Next steps for Daniel

1. **Confirm scope:** Open `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35–45` and decide whether to remove `applyVoiceDefaultIfEmpty` entirely from the read path or gate it on `config.voice_default_derived` already being persisted in the DB row.
2. **Update the read path:** In `aion-config-actions.ts:84` (`getAionConfig`), skip `applyVoiceDefaultIfEmpty` when the raw JSONB from the DB has no `voice` key. The synthesized default should only apply if it was explicitly persisted (or switch to persisting it on first write so the DB is the source of truth).
3. **Add the empty-queue fallback:** In `src/app/api/aion/chat/tools/core.ts:334`, replace the error return with a canned voice-only draft when the queue is empty: call `generateFollowUpDraft({ context: PLACEHOLDER_CONTEXT, voice: aionConfig.voice })` where `PLACEHOLDER_CONTEXT` is a minimal stub.
4. **Add the retune chip:** In `src/app/api/aion/chat/route/prompts.ts`, in the `configured` greeting branch, when `voice_default_derived === true`, append a chip: "Personalize Aion's voice."
5. **Smoke-test end-to-end:** Open the Aion chat as a fresh workspace, verify the `no_voice` greeting fires, complete all 3 turns, confirm Aion drafts something at `needs_test_draft`.
6. **Check `AionSidebar.tsx:979`** to confirm "Tune Aion's voice" still calls `resetAionVoiceConfig` cleanly and re-enters the flow from `no_voice` after the fix.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20–45` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–257` — onboarding state machine + `getOnboardingState`
- `src/app/api/aion/chat/route/prompts.ts:284–347` — system prompt injection per state + greeter per state
- `src/app/api/aion/chat/tools/core.ts:318–649` — `draft_follow_up` tool implementation
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74, 153, 209` — `AionConfig` type, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/api/aion/draft-follow-up/route.ts` — standalone draft endpoint
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:979` — "Tune Aion's voice" re-entry point
