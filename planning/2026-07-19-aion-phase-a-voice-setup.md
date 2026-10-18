# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-07-19 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The question's two core premises are both wrong — the system has moved significantly ahead.**

`public.workspaces.aion_config` exists. It is a `jsonb DEFAULT '{}'::jsonb NOT NULL` column in the baseline migration (`supabase/migrations/20260101000000_baseline_schema.sql:15058`). The `/api/aion` 16-line stub is gone — it has been replaced by a 450-line fully-authenticated route at `src/app/api/aion/chat/route.ts`.

The complete voice onboarding stack is live:

- **`AionVoiceConfig` type** (`{ description, example_message, guardrails }`) — `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16`
- **5-state onboarding machine** (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) — `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257`
- **State-aware greetings** — chat route calls `buildGreeting(onboardingState, ...)` at line 126; the `no_voice` greeting is `"How would you describe your style?"` (`src/app/api/aion/chat/route/prompts.ts:304`)
- **`save_voice_config` chat tool** — captures `description`, `example_message`, `guardrails` from the conversation, writes them via `updateAionConfigForWorkspace` (`src/app/api/aion/chat/tools/core.ts:120-139`)
- **`draft_follow_up` chat tool** — calls `generateFollowUpDraft` with the saved `AionVoiceConfig` injected directly into the system prompt (`src/app/api/aion/lib/generate-draft.ts:56-75`)
- **`resetAionVoiceConfig`** server action exists AND is already wired into `AionSidebar` as the "Tune Aion's voice" overflow item (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002`)

The `/aion` page (`src/app/(dashboard)/aion/AionPageClient.tsx`) renders `ChatInterface`, which IS the working Brain tab.

## Intended state

Daniel opens `/aion`, is immediately prompted about his communication style, types freely for 3 paragraphs, and within 4 chat turns has both a saved voice profile and an Aion-generated follow-up draft for a real active deal — all without leaving the chat.

## The gap

- `synthesizeDefaultVoice` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20-27` generates a default voice from the workspace name the first time `getAionConfig` is called, and sets `voice_default_derived: true`. `getOnboardingState` treats this as `configured` (`aion-chat-types.ts:248`), so the 4-step forcing block never fires for an existing workspace — Daniel lands on the generic pull-mode greeting, not the "How would you describe your style?" prompt.
- The `needs_test_draft` step instructs the LLM to call `draft_follow_up` (`prompts.ts:282`), but that tool fetches context from `getDealContextForAion` which requires an active deal with a qualifying follow-up queue item. If the queue is empty, the test draft step stalls silently.
- `resetAionVoiceConfig` is accessible only via the sidebar overflow — there is no prominent first-run CTA on the `/aion` empty-state directing Daniel to do this.

## Options

### Option A: Use the existing sidebar "Tune Aion's voice" to enter the onboarding flow
- **What it is:** Daniel opens `/aion`, opens the sidebar overflow, taps "Tune Aion's voice" (calls `resetAionVoiceConfig`), then types freely in the next chat turn. The 4-step flow handles everything else. Zero new code needed. Add one active deal to the follow-up queue first so the test draft at step 4 has something to work with.
- **Effort:** Small — no code changes, just verifying the end-to-end path works in production
- **Main risk:** If there is no qualifying deal in the queue when the test draft fires, Aion stalls at step 4 with no useful output
- **Unlocks:** Confirms the full onboarding loop works before building any UI on top of it

### Option B: Replace `synthesizeDefaultVoice` bypass with an inline empty-state prompt on `/aion`
- **What it is:** When `voice_default_derived === true`, render a prominent "Teach Aion your voice" entry card in the chat empty-state (above the landing starters in `ChatInterface.tsx:306+`). One button click dispatches a synthetic first message that puts the workspace into `no_voice` state and triggers the 4-step flow. Also add a "skip for now" affordance.
- **Effort:** Medium — new empty-state variant in `ChatInterface`, one synthetic-message dispatch, `resetAionVoiceConfig` call on confirm
- **Main risk:** Still depends on a qualifying deal existing for the test draft at step 4
- **Unlocks:** Self-discoverable first-run voice setup without needing to find the sidebar overflow

### Option C: Seed a test deal for the onboarding draft, then wire a standalone voice setup page
- **What it is:** Create a "seed" RPC that inserts a synthetic deal + follow-up queue item scoped to the workspace solely for the onboarding draft, then delete it after the draft is shown. Also add a form-based `/settings/aion/voice` page with the three fields so Daniel can iterate on voice outside the chat.
- **Effort:** Large — new RPC, seed/cleanup logic, settings sub-page form
- **Main risk:** Adds complexity; a synthetic seed deal leaks into the CRM if cleanup fails
- **Unlocks:** Fully self-contained onboarding that works even for day-0 workspaces with no deals

## Recommendation

Start with **Option A**, then ship **Option B**.

Option A costs nothing and tells you whether the end-to-end loop is production-ready today. Run it on Daniel's workspace: open the sidebar overflow on `/aion`, tap "Tune Aion's voice", confirm the `no_voice` greeting fires, type 3 paragraphs, step through to `needs_test_draft`. If there is a qualifying deal the draft will appear; if not, you learn exactly what the queue-empty failure mode looks like before building any UI.

Once that loop is confirmed, Option B is the right product move: a prominent "Teach Aion your voice" card in the `/aion` empty-state makes the path discoverable without adding form-based settings infrastructure. Option C's seed-deal approach adds cleanup risk with no meaningful UX benefit — real workspaces will have real deals within a session of use.

The `needs_test_draft` → empty-queue risk is worth fixing in the B pass: add a fallback that generates a generic "imagine you have a client who just went quiet" draft when no qualifying deal exists.

## Next steps for Daniel

1. Open `/aion` on your workspace and tap the sidebar overflow (the `•••` or similar control) to find "Tune Aion's voice". Confirm it exists and calls `resetAionVoiceConfig` — see `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002`.
2. Tap "Tune Aion's voice". Confirm the next greeting is the `no_voice` prompt ("How would you describe your style?") from `src/app/api/aion/chat/route/prompts.ts:304`.
3. Type 3 paragraphs about how you communicate with clients. Watch the voice fields save via the `save_voice_config` tool in `src/app/api/aion/chat/tools/core.ts:120`.
4. If you reach `needs_test_draft` and have an active deal in the follow-up queue, confirm the `draft_follow_up` tool fires and returns a `draft_preview` card. If the queue is empty, the stall is the bug to fix next.
5. For Option B: add a `voice_default_derived`-aware branch to the `ChatInterface` empty-state (`src/app/(dashboard)/(features)/aion/components/ChatInterface.tsx:306+`) that surfaces the "Teach Aion your voice" CTA before the landing starters.
6. For the `needs_test_draft` → empty-queue fallback: update `buildGreeting` in `src/app/api/aion/chat/route/prompts.ts:329` to generate a generic example draft when `getDealContextForAion` returns null.

## References

- `supabase/migrations/20260101000000_baseline_schema.sql:15058` — `aion_config` column
- `src/app/api/aion/chat/route.ts` — full chat route (450 lines)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — onboarding state machine
- `src/app/api/aion/chat/route/prompts.ts:275-332` — onboarding prompt injections and greetings
- `src/app/api/aion/chat/tools/core.ts:120-139` — `save_voice_config` tool
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft` + `buildFollowUpPrompt`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:20-27` — `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:214` — `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1002` — sidebar "Tune Aion's voice" wiring
- `src/app/(dashboard)/aion/AionPageClient.tsx` — Brain tab page shell
