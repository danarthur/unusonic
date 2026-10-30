# Aion Phase A: Voice Setup to First Real Draft

_Researched: 2026-10-30 · Unusonic Research Agent_

## The question

> Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on framing:** The primer's "Current notable state (as of 2026-04-10)" is stale. The codebase has shipped everything this question assumed was missing. This doc re-scopes to the actual remaining gap.

## Current state

**`aion_config` exists on `public.workspaces`** and is fully typed. `getAionConfig` and `getAionConfigForWorkspace` read it at `aion-config-actions.ts:84` and `aion-config-actions.ts:106`. Mutations: `saveAionVoiceConfig`, `resetAionVoiceConfig`, `updateAionConfigForWorkspace`, `setLearnOwnerCadence`, `toggleAionKillSwitch`.

**Voice config shape** at `aion-config-actions.ts:12`: `{ description, example_message, guardrails }`. `applyVoiceDefaultIfEmpty` in `aion-config-helpers.ts` synthesizes a default voice from the workspace name for new workspaces so first-time users hit a coherent experience instead of a blank prompt.

**5-state onboarding machine** in `aion-chat-types.ts:247`:
`no_voice → no_example → no_guardrails → needs_test_draft → configured`

The chat route at `chat/route.ts:124` calls `getOnboardingState` every turn and injects the current state into the system prompt. The system prompt at `prompts.ts:290-291` tells Aion to "Use draft_follow_up. After approval, call save_voice_config with onboarding_complete: true" when state is `needs_test_draft`.

**`save_voice_config` chat tool** in `core.ts:125`: accepts `description`, `example_message`, `guardrails`, and `onboarding_complete: boolean`. When `onboarding_complete: true`, writes `onboarding_state: 'complete'` to the config, which causes `getOnboardingState` to return `configured` on the next turn.

**`draft_follow_up` chat tool** in `core.ts:318`: generates a voice-aware draft. Calls `getDealContextForAion` with a synthesized fallback queue item when no queue item exists (`core.ts:343`). But at `core.ts:334`, if the follow-up queue is empty AND no `dealId` was passed AND no page context deal is active, it returns `{ error: 'No deals in the follow-up queue.' }` before reaching the draft generation logic.

**Draft generation** at `generate-draft.ts:37` uses `generateText` with the workspace voice config injected as a system prompt section. The voice is respected for both `description`, `example_message` (as a style model), and `guardrails`.

**The `/aion` page** renders `ChatInterface` via `AionPageClient.tsx:6`. Not paused. Fully wired.

## Intended state

Daniel opens the Aion tab on a fresh workspace. Aion asks one question at a time about communication style. After answering the three onboarding steps (voice description, example message, guardrails), Aion offers a test draft. Daniel says yes. Aion drafts a message for a real active deal — right there in the chat window, in Daniel's voice. Daniel approves (or tweaks and approves), onboarding completes, and Aion surfaces the full follow-up queue.

## The gap

- `draft_follow_up` fails with `{ error: 'No deals in the follow-up queue.' }` (`core.ts:334`) when the queue is empty and no deal is in page context. This is exactly the state a user is in at `needs_test_draft`: voice just configured, no follow-up queue items surfaced yet (cron hasn't run or no deals qualify).
- The `needs_test_draft → configured` transition is LLM-dependent: Aion must remember to call `save_voice_config({ onboarding_complete: true })` after the user approves the draft. There is no server-side enforcement.

## Options

### Option A: Fallback to any active deal in the tool
- **What it is:** In `draft_follow_up` at `core.ts:334`, when queue is empty, fetch the most recently-updated deal with `status IN ('inquiry', 'proposal', 'contract_sent')` from `public.deals` and proceed with a synthetic queue item (`{ reason: 'Voice setup test', reason_type: 'manual', suggested_channel: 'sms' }`).
- **Effort:** Small — ~15 lines in one file. No schema change.
- **Main risk:** Drafts a message for a deal that isn't actually due for follow-up. Labeled as "test draft" in the greeting so this is cosmetically fine, but could confuse a user who sees it reappear in the real queue later.
- **Unlocks:** The full onboarding flow works end-to-end without any dependency on queue hydration.

### Option B: Explicit `purpose` flag on the tool
- **What it is:** Add `purpose: z.enum(['draft', 'onboarding_test']).optional()` to `draft_follow_up`. When `'onboarding_test'`, bypass the queue requirement, pick any active deal, append a note to the draft that it's a "voice calibration draft — not a live follow-up", and call `save_voice_config({ onboarding_complete: true })` directly after generation (removing LLM responsibility for that step).
- **Effort:** Medium — 30-40 lines across `core.ts` plus a prompt instruction update.
- **Main risk:** Adds API surface for a one-time use case. Makes the tool harder to reason about.
- **Unlocks:** Removes the LLM-dependency on the `needs_test_draft` completion step, making onboarding completion deterministic.

### Option C: Pre-generate a draft card on the onboarding greeting
- **What it is:** When `onboardingState === 'needs_test_draft'` and `messages.length === 0`, the greeting handler in `prompts.ts:338` proactively calls `generateFollowUpDraft` for the workspace's most recent active deal and includes a `draft_preview` content block in the greeting response. No user prompt needed.
- **Effort:** Medium-large — touches `buildGreeting`, needs the deal query to be async and wrapped safely, and the greeting response shape needs to carry a `draft_preview` block.
- **Main risk:** Greeting becomes slow (adds a `generateText` call to cold-open). If the workspace has no active deals, falls back to text offer anyway. Adds significant complexity to the greeting path.
- **Unlocks:** Zero LLM turns needed to show the test draft — it appears immediately on tab open.

## Recommendation

**Option A.** The fallback is a surgical 15-line change in one place (`core.ts:334`). It directly unblocks the stated goal without adding API surface or slowing the greeting path.

The LLM-dependency on `onboarding_complete` is not a blocker in practice: Aion's system prompt already instructs it explicitly, and a failed completion just means the user sees the onboarding banner one more time. Fix that if it shows up in real use — don't front-load the complexity.

Accept the tradeoff: the test draft may be for a deal that isn't due for follow-up. The greeting already frames it as a voice calibration exercise, so this is semantically fine.

## Next steps for Daniel

1. Open `src/app/api/aion/chat/tools/core.ts` at line 332.
2. Replace the empty-queue early return with a fallback that queries `public.deals` for the most recent active deal in the workspace (`status IN ('inquiry', 'proposal', 'contract_sent')`, ordered by `updated_at DESC`, limit 1).
3. If no active deal exists either, return a text message: "No active deals to draft for yet — add your first deal and come back." (not an error object).
4. Run `npm run test -- core` to verify the existing draft tool tests still pass.
5. Open the Aion tab in the dev app on a workspace that has at least one deal, go through the three onboarding steps in chat, say yes to the test draft, and confirm a `draft_preview` card appears.
6. Confirm Aion calls `save_voice_config({ onboarding_complete: true })` after approval and the next chat open shows `configured` state (no onboarding prompt).

## References

- `src/app/api/aion/chat/tools/core.ts:318-396` — `draft_follow_up` tool
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — onboarding state machine
- `src/app/api/aion/chat/route/prompts.ts:285-292` — onboarding system-prompt injections
- `src/app/api/aion/chat/route/prompts.ts:338-341` — `needs_test_draft` greeting
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-74` — voice config types + save/reset actions
- `src/app/api/aion/lib/generate-draft.ts` — voice-aware draft generation
