# Aion Phase A: voice setup + first real draft

_Researched: 2026-04-24 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The queue question's premise is outdated. Phase A is complete. Here is what already exists:

**`aion_config` column is live.** `public.workspaces.aion_config: Json` appears in `src/types/supabase.ts:6628`. The `AionConfig` type (description, example_message, guardrails, follow_up_playbook, kill_switch, onboarding_state, learn_owner_cadence) is fully defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:49`.

**Voice setup is fully wired — through chat, not a form.** The `/api/aion/chat` route runs a 5-state onboarding machine (`aion-chat-types.ts:241`):
1. `no_voice` → asks about communication style, offers suggestion chips
2. `no_example` → asks for an example message
3. `no_guardrails` → asks about rules
4. `needs_test_draft` → offers to run a test draft
5. `configured` → pull mode (queue-driven, not push)

The AI saves config through the `save_voice_config` tool in `src/app/api/aion/chat/tools/core.ts:118`. `saveAionVoiceConfig()` at `aion-config-actions.ts:161` persists to the DB.

**Draft generation is fully wired.** `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts:25` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt. `getDealContextForAion()` at `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:545` is built and used by both the follow-up card and the chat tools.

**The "Brain tab" was replaced.** Voice setup is the conversational onboarding flow in `/aion` (`ChatInterface.tsx`). There is no separate Brain tab — the concept lives in the settings page (`/settings/aion`) and the chat page combined.

**The only actual blocker: the tier gate.** `src/app/api/aion/chat/route.ts:212` calls `canExecuteAionAction(workspaceId, 'active')`. Active mode requires `growth` tier (`src/shared/lib/tier-config.ts:51`). New workspaces default to `foundation` (`supabase/migrations/20260101000000_baseline_schema.sql:14247`), which maps to `passive` and returns "Upgrade your plan to use the Aion chat." before any greeting fires.

## Intended state

Daniel opens `/aion`, sees "How would you describe your style?" with suggestion chips, describes his communication style in 3 paragraphs, Aion saves it, prompts for an example message, then guardrails, then offers a test draft against a real deal from the queue. All infrastructure for this is built.

## The gap

- Dev/test workspace is likely on `foundation` tier, which is hard-blocked at `chat/route.ts:212`
- If the tier gate passes (growth+ tier), the full onboarding flow fires immediately with no code changes needed
- No standalone form fallback exists — voice config can only be entered through the chat
- `/settings/aion` has no voice section (only consent + cadence toggle)

## Options

### Option A: Set dev workspace tier to `growth` in the DB
- **What it is:** Run `UPDATE workspaces SET subscription_tier = 'growth' WHERE id = '<your-workspace-id>';` in the Supabase SQL editor
- **Effort:** Small (5 minutes)
- **Main risk:** None for local/dev testing; does not affect billing logic
- **Unlocks:** The full conversational onboarding flow fires on next `/aion` visit — immediately see the described experience

### Option B: Add a tier bypass env var for dev
- **What it is:** Add `AION_TIER_BYPASS=true` env var check in `aion-gate.ts:42` that skips the tier check when running in development
- **Effort:** Small (10 lines in `aion-gate.ts`, one env var in `.env.local`)
- **Main risk:** Must be guarded to never run in production; any slip could let anyone use Aion for free
- **Unlocks:** Dev environments don't need DB manipulation to test Aion; also useful for CI

### Option C: Add a voice setup form to `/settings/aion`
- **What it is:** Add three textareas (description, example message, guardrails) to `AionSettingsView.tsx` wired to the existing `saveAionVoiceConfig()` action
- **Effort:** Medium (new UI section, Zod validation, optimistic state)
- **Main risk:** Creates a parallel entry path that may diverge from the conversational flow; also doesn't unblock the draft step (that still requires chat + tier)
- **Unlocks:** Voice config entry without Aion chat access; useful for non-Growth users who want to pre-configure before upgrading

## Recommendation

Option A. The codebase has everything. The tier gate is functioning exactly as designed — it is a billing boundary, not a bug. For a dev run, one SQL update unblocks the full Phase A flow you described. Do not add bypasses to production code for a test.

Run `UPDATE workspaces SET subscription_tier = 'growth' WHERE id = '<your-workspace-id>';` in the SQL editor, open `/aion`, and the first message will be the voice-style prompt. After the 3-paragraph exchange (description → example → guardrails → test draft), the workspace will be at `onboarding_state = 'complete'` and every follow-up draft will use the saved voice.

Option C becomes relevant later when you want non-admin team members to review or edit the voice config without going through chat. Hold it until there's a real user story for it.

## Next steps for Daniel

1. In Supabase SQL Editor: `UPDATE workspaces SET subscription_tier = 'growth' WHERE id = '<your-workspace-id>';`
2. Open `/aion` in the browser — you should see the voice-style greeting with suggestion chips
3. Describe your communication style (the 3-paragraph case from the queue item works perfectly here)
4. Paste an example follow-up message you've actually sent
5. Add any guardrails ("never use exclamation marks", etc.)
6. Accept the test-draft offer — Aion will pull a real deal from your queue and generate a draft using your voice

## References

- `src/app/api/aion/chat/route.ts:212` — tier gate call
- `src/shared/lib/tier-config.ts:32–62` — tier definitions (foundation=passive, growth=active, studio=autonomous)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:241` — `getOnboardingState()` (5-state machine)
- `src/app/api/aion/chat/route.ts:929` — `buildGreeting()` per state
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:49` — `AionConfig` type
- `src/app/api/aion/lib/generate-draft.ts:52` — `buildFollowUpPrompt()` with voice injection
- `src/types/supabase.ts:6628` — `aion_config` column confirmed live
