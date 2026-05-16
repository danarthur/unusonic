# Aion Phase A: Voice Setup to First Real Draft

_Researched: 2026-05-16 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**Note on premise:** The question was written against the April 10 primer. The code has moved substantially since then — most of Phase A infrastructure is already shipped. The analysis below reflects current state and redirects to the real remaining gap.

## Current state

`public.workspaces.aion_config` **already exists** as a `Json` column (`src/types/supabase.ts:7689`). The `AionConfig` type is fully defined in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74` with `voice`, `learned`, `follow_up_playbook`, `onboarding_state`, and `kill_switch` fields.

The Brain tab is not paused in code. `src/app/(dashboard)/aion/AionPageClient.tsx:73` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />` unconditionally. The kill-switch check lives server-side in the chat route (`src/app/api/aion/chat/route.ts:109-113`), returning a text message rather than blocking the UI.

The chat route (`src/app/api/aion/chat/route.ts`) is a full ~400-line endpoint — not the 16-line GPT-4-turbo stub from the primer. It loads config (`route.ts:153`), builds a system prompt that injects voice config (`src/app/api/aion/chat/route/prompts.ts:88-91`), and gates on tier and rate limits.

Voice capture is conversational. The onboarding state machine (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257`) has five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The greeting responds with state-specific prompts (`prompts.ts:301-338`). Claude calls the `save_voice_config` tool (`src/app/api/aion/chat/tools/core.ts:118-144`) to persist each field; `saveAionVoiceConfig` (`aion-config-actions.ts:178-206`) is not called from any UI component directly.

`/api/aion/draft-follow-up/route.ts` exists and is implemented — it accepts `{ context: AionDealContext, workspaceId }`, gates on auth and tier, and calls `generateFollowUpDraft`.

## Intended state

After completing voice setup (3 paragraphs → description / example / guardrails captured via chat), the user immediately sees a real follow-up draft for their highest-priority open deal, styled in their voice. This is the "wow moment" that validates the setup effort. The draft should come from the follow-up queue's top item, not a synthetic/generic sample.

## The gap

- `needs_test_draft` state (`prompts.ts:329-338`) offers to "generate a test message" but it is a conversational offer — there is no evidence it pulls a real deal from `ops.follow_up_queue` and calls `/api/aion/draft-follow-up` with actual context.
- The test draft likely generates a generic fictional example rather than a workspace-specific draft tied to a real deal.
- No Settings UI exists to edit voice config after initial setup (only conversational editing via chat).
- No verification that the `no_voice` greeting actually fires on first chat open for a workspace with no prior config (the `voice_default_derived` bypass at `aion-chat-types.ts:247` may skip onboarding for new workspaces if synthesis runs before the user has a chance to set their own voice).

## Options

### Option A: Close the last mile — real deal in the test draft
- **What it is:** In the `needs_test_draft` greeting handler, fetch the top pending item from `ops.follow_up_queue` for the workspace and pass its `context_snapshot` to `/api/aion/draft-follow-up`. Return the draft inline in the chat message.
- **Effort:** Small (1 file change in `prompts.ts` or a new tool call that the `needs_test_draft` greeting triggers)
- **Main risk:** The workspace may have no queue items yet (new user), requiring a fallback synthetic context.
- **Unlocks:** The stated goal end-to-end — voice setup immediately produces a real draft.

### Option B: Add a Settings form for voice config
- **What it is:** Build a `VoiceConfigForm.tsx` with three textareas (description, example, guardrails), wire to `saveAionVoiceConfig()`, surface in the Brain tab sidebar or a settings route.
- **Effort:** Medium (new component + routing + form state)
- **Main risk:** Introduces a second path alongside the conversational one; two sources of truth for voice config; needs clear UX to indicate they're equivalent.
- **Unlocks:** Direct editing without having to talk to Aion; better for users who know what they want.

### Option C: Audit and fix the onboarding entry condition
- **What it is:** Verify and fix whether `voice_default_derived` bypass (when synthesis runs for new workspaces) silently skips the onboarding flow, meaning owners never see the voice-capture greeting. This is a correctness fix before the test-draft step matters.
- **Effort:** Small (read `applyVoiceDefaultIfEmpty` logic + one conditional change)
- **Main risk:** Low — but if this bypass fires too eagerly, Options A and B are moot because no user ever reaches `needs_test_draft`.
- **Unlocks:** Confidence that the conversational onboarding actually runs for real new workspaces.

## Recommendation

Do Option C first, then Option A. Option B is a nice-to-have but not Phase A.

The `voice_default_derived` bypass is a silent landmine: if `applyVoiceDefaultIfEmpty` synthesizes a default voice from the workspace name before the owner has spoken, the state machine returns `'configured'` and skips the entire onboarding conversation. Fixing this — likely a one-line condition ensuring synthesis only fires when onboarding is already `'complete'` — is low-effort and unblocks everything downstream.

Once that's confirmed clean, Option A closes the loop. The `needs_test_draft` step needs to call the real draft endpoint with real deal context. If the queue is empty (new workspace), fall back to a synthetic context with plausible placeholder deal data so the voice is still demonstrated. This keeps the flow entirely conversational (no new UI surface needed) and delivers the stated goal in the minimum number of changes.

Option B is worth building eventually for settings power-users, but it's not Phase A.

## Next steps for Daniel

1. Read `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-260` and trace `applyVoiceDefaultIfEmpty` (called from `aion-config-actions.ts:~84-100`). Confirm whether synthesis sets `voice_default_derived` and whether `getOnboardingState` returns `'configured'` for a fresh workspace with no explicit voice set.
2. If the bypass fires too eagerly: add a guard so `applyVoiceDefaultIfEmpty` only synthesizes when `onboarding_state === 'complete'` is already stored.
3. Read `src/app/api/aion/chat/route/prompts.ts:329-338` (the `needs_test_draft` greeting) to confirm it is a plain-text offer vs. an active draft call.
4. In that handler (or via a new `generate_test_draft` tool registered in `core.ts`): fetch the workspace's top `ops.follow_up_queue` item (status `pending`, highest `priority_score`) and call `generateFollowUpDraft` from `src/app/api/aion/lib/generate-draft.ts` with its `context_snapshot`.
5. Wire the result back as a formatted chat message alongside confirmation that setup is complete.
6. Smoke-test by creating a workspace with no `aion_config`, opening the Brain tab, completing the 3-paragraph voice flow, and confirming the final message is a real-deal draft in the entered voice.

## References

- `src/app/(dashboard)/aion/AionPageClient.tsx:73` — Brain tab render
- `src/app/api/aion/chat/route.ts:109-113, 152-174` — kill_switch check, config load
- `src/app/api/aion/chat/route/prompts.ts:88-91, 301-338` — voice injection, onboarding states
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — state machine + `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74, 84-120, 178-206` — AionConfig type, read/write paths
- `src/app/api/aion/chat/tools/core.ts:118-144` — `save_voice_config` tool
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint
- `src/types/supabase.ts:7689` — `workspaces.aion_config` column
