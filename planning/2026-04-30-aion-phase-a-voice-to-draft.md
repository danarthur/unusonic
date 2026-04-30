# Scope Phase A: Aion Voice Setup to First Draft

_Researched: 2026-04-30 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer's April 10 snapshot is significantly stale. The infrastructure is substantially complete:

**Schema:** `public.workspaces.aion_config` exists as a `Json` column (`src/types/supabase.ts:7617`). The `AionConfig` type is fully defined in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74`, including `voice` (description, example_message, guardrails), `kill_switch`, `onboarding_state`, and a `voice_default_derived` flag.

**Chat endpoint:** `/api/aion/chat/route.ts` is 450 lines, fully implemented — auth gated (`route.ts:68-73`), tier gated (`route.ts:98-105`), and kill switch checked at `route.ts:109`. This is not the 16-line stub the primer describes.

**Voice onboarding:** A 4-state machine runs inside the chat route via `src/app/api/aion/chat/route/prompts.ts:275-338`:
- `no_voice` → greets with "how do you talk to clients?" + 3 quick-pick chips
- `no_example` → asks for a sample message that landed well
- `no_guardrails` → asks for any always/never rules
- `needs_test_draft` → offers a draft for the top-priority deal ("Yes, try one")
- `complete` → normal configured mode

**Draft pipeline:** `/api/aion/draft-follow-up/route.ts:60-63` calls `generateFollowUpDraft({ context, voice: aionConfig.voice })`. `generate-draft.ts:63-74` injects the voice config (description, example, guardrails) directly into the system prompt as a named block: "--- How This Company Communicates ---".

**Auto-deal selection:** The `draft_follow_up` chat tool (`src/app/api/aion/chat/tools/core.ts:318-336`) resolves a deal automatically — it checks page context first, then falls back to `getFollowUpQueue()[0]`, the highest-priority pending item. If the queue has at least one item, no deal ID is needed.

**The pause:** The kill switch at `aion_config.kill_switch = true` blocks all Aion endpoints. The "Brain tab is paused" message the primer references is the result of the kill switch being active, not a missing component. There is no separate "Brain tab" in the deal page — "Brain" appears only as a lucide icon for "Thinking" model mode (`ChatInterface.tsx:4,783`). The Aion surface is the standalone `/aion` page.

**Voice reset:** "Tune Aion's voice" in the sidebar (`AionSidebar.tsx:1043`) calls `resetAionVoiceConfig()` which clears `voice`, `voice_default_derived`, and resets `onboarding_state`, returning to the `no_voice` greeting.

**One wrinkle:** If the workspace has no explicit voice configured, `getAionConfigForWorkspace` synthesizes a default voice from the workspace name and sets `voice_default_derived = true` (`aion-config-actions.ts:67-73`). This flag causes the chat route to skip the onboarding forcing block — the 4-step flow is bypassed. So even with the kill switch off, Daniel won't see the onboarding unless voice is reset first.

## Intended state

Daniel opens `/aion`, sees the `no_voice` greeting ("Let's start with how you talk to clients"), writes or picks a style in 3 steps, then sees a real follow-up draft for his top pending deal — all without leaving the chat interface.

## The gap

- Kill switch is ON, blocking all Aion endpoints.
- `voice_default_derived` may be set, which skips the onboarding flow even after kill switch is disabled.
- If `ops.follow_up_queue` has no pending items, the `needs_test_draft` step returns "No deals in the follow-up queue" — dead end in onboarding.
- No missing infrastructure otherwise. The pipeline is complete.

## Options

### Option A: Enable the existing system (no code changes)
- **What it is:** Toggle kill switch off via `/settings/aion`, then call `resetAionVoiceConfig()` (via "Tune Aion's voice" in sidebar or direct action) to clear any synthesized default. Walk through the 4-step onboarding in `/aion`. Ensure at least one deal is in the follow-up queue before reaching `needs_test_draft`.
- **Effort:** Small — 30 minutes end-to-end.
- **Main risk:** If the follow-up queue is empty when `needs_test_draft` fires, the draft tool errors out and the onboarding stalls.
- **Unlocks:** Validates the entire voice → draft pipeline today with zero code written.

### Option B: Graceful empty-queue fallback at needs_test_draft
- **What it is:** In `draft_follow_up` tool execute (`core.ts:334`), when the queue is empty, fall back to the first deal in `public.deals` with a synthetic queue item (`reason: 'Check-in'`, `suggested_channel: 'sms'`). Alternatively, add an empty-queue check to the `needs_test_draft` greeting and offer a "skip, I'm done" path instead of waiting for user action.
- **Effort:** Small — 1-2 hours.
- **Main risk:** A synthetic fallback deal may not be relevant enough to demo voice quality.
- **Unlocks:** Onboarding completes reliably on any workspace, including fresh or clean ones.

### Option C: Standalone voice setup form in /settings/aion
- **What it is:** Add three labeled textareas (description, example, guardrails) + a "Preview draft" button to the existing `/settings/aion` settings page. Reuse `saveAionVoiceConfig()` and `POST /api/aion/draft-follow-up` directly. No chat interface needed.
- **Effort:** Medium — half a day of UI work.
- **Main risk:** Creates two divergent paths to the same config. The chat onboarding is the intended UX; a settings form adds maintenance surface without solving the core gap.
- **Unlocks:** Users who don't want to go through chat can configure voice at any time. Useful as a "re-tune" shortcut later, but premature now.

## Recommendation

Option A, with Option B as a same-session follow-up if the queue is empty.

The system was built. The kill switch and the `voice_default_derived` default-synthesis flag are the only things standing between Daniel and the full onboarding experience. Before writing any new code, validate that the pipeline actually works end-to-end: kill switch off, voice reset, 4-step chat, draft fires. That sequence takes 30 minutes. If it works, Phase A is done — the code was already written.

Option B (empty-queue fallback) is worth a quick 2-hour fix immediately after, because "no deals in queue" is a real edge case on new workspaces and shouldn't block the onboarding. Option C is premature — the chat onboarding is the right experience and a settings form adds complexity without improving it.

## Next steps for Daniel

1. Check kill switch state: in Supabase SQL editor run `SELECT id, name, aion_config->>'kill_switch' FROM public.workspaces LIMIT 5`.
2. If kill switch is true: go to `/settings/aion` and toggle it off (or call `toggleAionKillSwitch(false)` in `aion-config-actions.ts:292+`).
3. Check for synthesized default: in the same query, look at `aion_config->>'voice_default_derived'`. If true, open `/aion` → sidebar gear icon → "Tune Aion's voice" to reset to `no_voice`.
4. Ensure at least one deal is in `ops.follow_up_queue` with status = 'pending'. If the table is empty, the `needs_test_draft` draft tool will error — run the follow-up cron (`/api/cron/follow-up-queue`) or manually insert a row to seed it.
5. Open `/aion`, walk through all 4 onboarding steps, choose "Yes, try one" at `needs_test_draft`.
6. If the draft doesn't reflect your voice: confirm `aionConfig.voice` is populated in the draft-follow-up route by checking logs, then verify `generate-draft.ts:63` is running (voice block only injects if at least one field is non-empty).

## References

- `src/types/supabase.ts:7617` — aion_config column on workspaces
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-74` — AionConfig types, getAionConfigForWorkspace, saveAionVoiceConfig, resetAionVoiceConfig
- `src/app/api/aion/chat/route.ts:68-113` — auth gate, tier gate, kill switch
- `src/app/api/aion/chat/route/prompts.ts:275-338` — onboarding state machine + greeting builder
- `src/app/api/aion/chat/tools/core.ts:318-336` — draft_follow_up tool, auto-queue fallback
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint, voice config injection
- `src/app/api/aion/lib/generate-draft.ts:52-76` — buildFollowUpPrompt, voice block injection
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" reset button
