# Aion Phase A — voice setup + first draft: where things actually stand

_Researched: 2026-04-20 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the question was written against the April 10 primer. This doc reports actual April 20 state._

## Current state

**The premise is 10 days out of date.** The system described as "not started" has largely shipped.

`aion_config` **exists.** Migration `supabase/migrations/20260407140000_aion_voice_foundation.sql:7` added `ADD COLUMN IF NOT EXISTS aion_config jsonb` to `public.workspaces`. Types are regenerated: `src/types/supabase.ts:6306` has `aion_config: Json` on the workspaces row.

`/api/aion/route.ts` (the 16-line stub) **does not exist.** It has been replaced by a full implementation at `src/app/api/aion/chat/route.ts` (1167 lines): auth at line 143, per-user rate limiting at lines 49–67, workspace kill-switch at lines 184–189, intent classification at lines 294–299, model routing at lines 311–319, and full streaming at lines 334–435.

**The Brain tab is the `/aion` page.** `src/app/(dashboard)/aion/page.tsx` renders `AionPageClient.tsx`, which renders `ChatInterface.tsx` directly — no "paused" state.

**Voice setup onboarding is wired.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:237` drives a 5-state machine: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state produces a tailored greeting from `buildGreeting()` in `src/app/api/aion/chat/route.ts:764`.

**`save_voice_config` tool is live.** `src/app/api/aion/chat/tools/core.ts:115` — accepts `description`, `example_message`, `guardrails` as optional fields and writes all three at once via `updateAionConfigForWorkspace`.

**`draft_follow_up` tool is live.** `src/app/api/aion/chat/tools/core.ts:312` — calls `getDealContextForAion` (exists at `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:535`) and generates a draft using `buildDraftPrompt` which injects `config.voice` into the prompt at line 39.

**`getDealContextForAion` exists.** Referenced "not started" in the primer; actually at `follow-up-actions.ts:535`, used by both the chat tool and the follow-up card.

## Intended state

A workspace owner opens the Aion page for the first time, types a few paragraphs describing how they communicate with clients (style + a real example + any rules), and Aion: (1) parses and saves all three voice fields in one exchange, (2) immediately generates a follow-up draft for a real deal that reflects that voice. This closes the loop between "teaching Aion" and "seeing value" in under 5 minutes.

## The gap

Two specific blockers prevent the experience as described:

- **Multi-field capture in a single message.** The system prompt for `no_voice` state tells Aion to "ask about communication style. Save via save_voice_config." — a narrow, single-field instruction. If Daniel writes 3 paragraphs covering style + example + guardrails in one message, Aion will likely save only `description` and ask for an example in the next turn. The tool already accepts all three fields at once; the system prompt guidance is the bottleneck. `src/app/api/aion/chat/route.ts:748`.

- **Test draft fails on empty queue.** `draft_follow_up` at `core.ts:328` returns `{ error: 'No deals in the follow-up queue.' }` if no items exist. The `needs_test_draft` greeting explicitly offers "draft a test message for my top priority deal" — which fails if no deals have been queued. Fresh workspaces (or a workspace where all items were dismissed) hit this dead end.

## Options

### Option A: Two targeted patches

- **What it is:** (1) Update the onboarding system prompt sections to say: if the user provides style description, example message, and guardrails in a single message, extract and save all three immediately. (2) Patch `draft_follow_up` to fall back to `search_deals` and use the top active deal when the queue is empty — drafting without a queue item using a synthetic context.
- **Effort:** Small — two isolated changes. System prompt is a string in `route.ts`; the tool fallback is ~15 lines in `core.ts`.
- **Main risk:** Synthetic draft context (no `queueItem.reason`) is less focused — draft won't have a "why this now" signal. Acceptable for a test draft.
- **Unlocks:** The exact experience from the question. One message → voice saved. One chip tap → draft appears.

### Option B: Voice setup form in settings

- **What it is:** A static form at `/settings/aion/voice` (alongside the existing `AionSettingsView`) with three labeled textareas: Communication style, Example message, Rules. Submits via `saveAionVoiceConfig` action. Chat onboarding continues as-is for new users who go through Aion first.
- **Effort:** Medium — new page + form component + link from settings nav.
- **Main risk:** Two ways to set the same config; they need to stay in sync. Not a data integrity risk, but UX surface area doubles.
- **Unlocks:** Owners who want to set voice without conversational onboarding. Good for bulk-editing guardrails later.

### Option C: First-visit wizard at `/aion`

- **What it is:** When `aion_config.voice` is empty, render a pre-chat wizard (3-panel or single long form) before `ChatInterface` is shown. On submit, write all three fields, then drop into chat with `onboarding_state === 'needs_test_draft'`.
- **Effort:** Large — new UI component, routing logic, wizard state.
- **Main risk:** Breaks the existing flow for already-configured users; conditional render adds complexity. Voice-from-chat is a better ongoing mechanic (teaches Aion things on the fly) — the wizard only solves day-1.
- **Unlocks:** Fastest new-user time-to-value. Only justified if chat onboarding has real retention problems.

## Recommendation

**Option A.** The infrastructure is almost entirely built. The two gaps are precise and fixable in under an hour without touching schema or architecture.

For the system prompt fix: in the `no_voice` branch at `route.ts:748`, replace the single-line guidance with: "Ask about communication style. If the user provides a style description, an example message, or rules in the same turn, save all of them at once via save_voice_config — don't make them repeat themselves in the next turn." Identical logic in `no_example` and `no_guardrails` states: if the user volunteers ahead-of-state fields, capture them.

For the empty-queue fallback: in `draft_follow_up` at `core.ts:328`, after the empty-queue check, call `search_deals` with an empty query to get the most recent active deal and synthesize a minimal context object. Mark it `reason: 'No queue item — test draft'` so the prompt is honest about the signal.

Both changes keep the conversational onboarding as the primary model, which is correct — voice-from-chat is how Aion continues learning after day-1, not just for setup. Option B (settings form) is worth adding later as a bulk-edit surface, not as a replacement.

## Next steps for Daniel

1. **Verify the live experience first.** Open `/aion` on the production workspace. The greeting should be "Hey. I'm Aion — let's start with how you talk to clients." If it shows something else, check `aion_config` in the DB for that workspace (`SELECT aion_config FROM workspaces WHERE id = '<workspace_id>'`).
2. **Patch the system prompt** in `src/app/api/aion/chat/route.ts:748` — change the `no_voice` onboarding instruction to allow multi-field capture. Same for `no_example:751` and `no_guardrails:754`.
3. **Patch `draft_follow_up`** in `src/app/api/aion/chat/tools/core.ts:326–330` — add fallback that calls `search_deals` with empty query and uses the first result when queue is empty.
4. **Update `planning-primer.md`** — the "current notable state" section still says Brain tab is paused and the API is a stub. Replace with the real state so future queue items start from accurate premises.
5. **Delete `ArthurInput.tsx`** if it still exists — confirmed empty/deleted already but worth verifying. (`grep -r ArthurInput src/` should return nothing.)

## References

- `src/app/api/aion/chat/route.ts` — full chat implementation; onboarding system prompt at lines 747–755
- `src/app/api/aion/chat/tools/core.ts` — `save_voice_config` (line 115), `draft_follow_up` (line 312), empty-queue guard (line 328)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:237` — `getOnboardingState()`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:49` — `AionConfig` type + `updateAionConfigForWorkspace`
- `supabase/migrations/20260407140000_aion_voice_foundation.sql` — `aion_config` column migration
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:535` — `getDealContextForAion`
