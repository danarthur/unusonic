# Aion Phase A: unblocking voice setup and first draft

_Researched: 2026-04-19 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The question's two core premises are no longer accurate. The codebase is further along than described.

**`aion_config` exists.** It is a `Json` column on `public.workspaces` (`supabase.ts:6074`), with known keys: `voice` (description, example_message, guardrails), `learned`, `follow_up_playbook`, `onboarding_state`, `kill_switch`, `learn_owner_cadence`.

**The onboarding flow is fully wired end-to-end.**
- `getOnboardingState()` derives one of five states from `aion_config.voice.*` fields (`aion-chat-types.ts:237–246`): `no_voice → no_example → no_guardrails → needs_test_draft → configured`.
- `/api/aion/chat/route.ts` (line 198) calls `getOnboardingState()`, then `buildGreeting()` (line 202) which returns a full greeting message with chips for each state. Lines 764–805 show greetings for `no_voice`, `no_example`, `no_guardrails`, `needs_test_draft`.
- The system prompt injects `=== ONBOARDING ===` guidance matching the current state (`route.ts:747–755`), so the LLM knows which step it is on.
- `save_voice_config` tool (`core.ts:115–141`) captures `description`, `example_message`, `guardrails` from the conversation and writes them to `aion_config` via `updateAionConfigForWorkspace()`.

**Draft generation is voice-parameterized.**
- `generateFollowUpDraft()` in `generate-draft.ts:25` accepts `voice: AionVoiceConfig | null`.
- It injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt (`generate-draft.ts:63–75`).
- The `draft_follow_up` chat tool (`core.ts:312–330`) auto-picks the top `follow_up_queue` item when no deal is specified. No deal ID needed at `needs_test_draft`.

**There is no "Brain tab" UI.** Aion lives at `/aion` (page.tsx + AionPageClient.tsx + ChatInterface.tsx). The "paused" state is enforced via two API-level gates:
1. **Kill switch** (`route.ts:185`): if `aion_config.kill_switch = true`, returns `"Aion is paused for this workspace."` before any other logic.
2. **Tier gate** (`route.ts:174`): `canExecuteAionAction(workspaceId, 'active')` requires `growth` or `studio` tier. Foundation (`passive`) returns `"Upgrade your plan to use the Aion chat."` (`aion-gate.ts:50–55`, `tier-config.ts:40`).

## Intended state

Daniel opens `/aion`. Because `aion_config.voice` is empty, `getOnboardingState()` returns `no_voice` and the greeting asks about communication style. He describes how he talks to clients across 3 turns (style → example message → guardrails). Each turn, `save_voice_config` tool writes the field. After the third turn, state advances to `needs_test_draft`. The greeting offers a test draft. Daniel accepts; `draft_follow_up` picks the top `follow_up_queue` item and calls `generateFollowUpDraft()` with his voice config. He reads a draft that sounds like him. He approves; `save_voice_config` with `onboarding_complete: true` advances state to `configured`.

## The gap

- Kill switch is likely `true` (primer notes "Brain Mode is paused — waiting for timeline engine")
- Workspace tier is likely `foundation` (passive Aion only — no chat, no drafts)
- `ops.follow_up_queue` may be empty if cron has not run — test draft has nothing to pick
- Three legacy naming stragglers remain but are cosmetic: `ION_SYSTEM`/`ION_FULL_SYSTEM` in `package-generator.ts`, `SIGNAL_SPRING_DURATION_MS` in `motion-constants.ts`

## Options

### Option A: SQL config unlock (zero code)
- **What it is:** In the Supabase dashboard SQL editor, clear `kill_switch` on Daniel's workspace and bump `subscription_tier` to `growth`. Takes two queries. Run the follow-up queue cron once to seed items if queue is empty.
- **Effort:** Small (under 10 minutes)
- **Main risk:** Tier change may affect billing display in settings UI — cosmetic only, no real charge since there is no active Stripe subscription.
- **Unlocks:** The entire described experience is immediately available. Walk the onboarding flow live today.

### Option B: Dev bypass env flag
- **What it is:** Add `AION_BYPASS_WORKSPACE_IDS` env var (comma-separated). In `canExecuteAionAction` and the kill-switch check, bypass both gates for listed workspace IDs. Lets dogfooding without touching the DB tier column.
- **Effort:** Small (~15 lines across `aion-gate.ts` and `route.ts`)
- **Main risk:** Bypass env var could be accidentally left in production; needs a comment and `.env.local`-only discipline.
- **Unlocks:** Same as Option A, plus a permanent dogfood escape hatch for future features.

### Option C: Kill switch UI in Settings
- **What it is:** Add a toggle to AionSettingsView that writes `aion_config.kill_switch` via a new server action. Turns Aion on/off without SQL access.
- **Effort:** Medium (new server action + UI control + RLS consideration for writing `public.workspaces`)
- **Main risk:** `aion_config` writes may be blocked by current RLS on `public.workspaces` — would need a `SECURITY DEFINER` RPC or service-role write. Adds scope beyond the immediate goal.
- **Unlocks:** Long-term quality of life; doesn't change the time-to-first-draft.

## Recommendation

Option A. The entire Phase A pipeline is built and working. The onboarding flow, voice capture, draft generation, and queue integration are all wired correctly. Nothing needs to be written. The two blockers are config values in the database.

Run these two queries in the Supabase dashboard SQL editor, substituting Daniel's workspace ID:

```sql
-- 1. Clear kill switch
UPDATE public.workspaces
SET aion_config = jsonb_set(COALESCE(aion_config, '{}'::jsonb), '{kill_switch}', 'false')
WHERE id = '<your_workspace_id>';

-- 2. Ensure tier allows active Aion (growth or studio)
UPDATE public.workspaces
SET subscription_tier = 'growth'
WHERE id = '<your_workspace_id>'
  AND subscription_tier = 'foundation';
```

If `ops.follow_up_queue` is empty, hit the cron endpoint once (or insert a row manually) so the test draft has something to pull. Then open `/aion` and walk through the 5-step onboarding. The draft at step 4 will use whatever voice was captured in steps 1–3.

Option B is worth a follow-up commit after confirming the flow works, as a permanent dev convenience. Option C can wait until the settings page gets a polish pass.

## Next steps for Daniel

1. Find your workspace ID: `SELECT id FROM public.workspaces LIMIT 5;` in Supabase SQL editor.
2. Run the two SQL queries above (kill switch + tier) with your workspace ID.
3. Check `ops.follow_up_queue`: `SELECT count(*) FROM ops.follow_up_queue WHERE workspace_id = '<id>' AND status = 'pending';`. If 0, POST to `/api/cron/follow-up-queue` with your cron secret.
4. Open `http://localhost:3000/aion`. Confirm the greeting is "Hey. I'm Aion…" (no_voice state).
5. Walk through the onboarding: describe your style → paste an example message → state any rules → say "Yes, try one."
6. Read the draft. If it sounds right, reply "Looks good" — Aion marks onboarding complete. If not, note what's wrong; that's signal for tuning `buildFollowUpPrompt`.

## References

- `src/app/api/aion/chat/route.ts:174–188` — tier gate + kill switch checks
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:237–246` — `getOnboardingState()`
- `src/app/api/aion/chat/route.ts:764–805` — `buildGreeting()` per state
- `src/app/api/aion/chat/route.ts:747–755` — onboarding system prompt injections
- `src/app/api/aion/chat/tools/core.ts:115–141` — `save_voice_config` tool
- `src/app/api/aion/chat/tools/core.ts:312–330` — `draft_follow_up` auto-queue fallback
- `src/app/api/aion/lib/generate-draft.ts:25–75` — `generateFollowUpDraft()` + voice injection
- `src/features/intelligence/lib/aion-gate.ts:42–71` — `canExecuteAionAction()`
- `src/shared/lib/tier-config.ts:31–65` — tier → AionMode mapping
