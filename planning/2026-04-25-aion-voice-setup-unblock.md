# Aion Phase A: voice setup and first draft — actual state and gap

_Researched: 2026-04-25 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The question's two premises are outdated. Both have shipped since the entry was written.

**`aion_config` column exists.** Migration `supabase/migrations/20260407140000_aion_voice_foundation.sql:7` adds the column with `NOT NULL DEFAULT '{}'::jsonb`. The typed wrapper (`AionConfig`) is at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:49`.

**The Aion page is live with no pause gate.** `src/app/(dashboard)/aion/AionPageClient.tsx:73` renders `<ChatInterface viewState="chat" workspaceId={workspaceId} />` directly, with no disabled check. The nav item at `src/shared/ui/layout/nav-items.ts:36` points to `/aion` without a disabled flag.

**The chat orchestrator is production-ready.** `src/app/api/aion/chat/route.ts` (1,284 lines) handles the full onboarding flow. The greeting builder at route lines 239–288 checks `aion_config.onboarding_state` and stages through `no_voice → no_example → no_guardrails → needs_test_draft → configured`. When the state is `no_voice`, Aion prompts for communication style.

**`save_voice_config` tool is wired.** `src/app/api/aion/chat/tools/core.ts:118` — Aion calls this whenever the user describes their voice. It calls `updateAionConfigForWorkspace()` (system client path), which bypasses RLS and correctly persists to `public.workspaces.aion_config`.

**`/api/aion/draft-follow-up` is live.** `src/app/api/aion/draft-follow-up/route.ts:60` calls `generateFollowUpDraft(context, voiceConfig)` and returns `{ draft, channel }`. The `getDealContextForAion()` function assembles the deal context DTO at `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:545`.

**One real bug.** `saveAionVoiceConfig()` at `aion-config-actions.ts:174` uses `createClient()` — the RLS-restricted server client. The comment directly above in `setLearnOwnerCadence()` at line 139 is explicit: "public.workspaces has RLS enabled but no UPDATE policy for authenticated callers — writes must route through the service-role client." This function will silently fail (0-row update, no error) when called from the settings form. The chat path (`updateAionConfigForWorkspace()` at line 192) uses the system client and works correctly.

## Intended state

Daniel navigates to `/aion`, sees an onboarding greeting asking about communication style, writes 3 paragraphs, and Aion: (1) saves the voice config to `aion_config.voice.description`; (2) advances the onboarding state and asks for an example message; (3) asks for guardrails; (4) offers a test draft against a real deal. That draft is assembled by `buildDraftPrompt()` in `core.ts:36` using the saved voice config, vocabulary, and drafting rules.

The same voice config should be editable from `/settings/aion` as a recovery path.

## The gap

- `saveAionVoiceConfig()` at `aion-config-actions.ts:174` uses the wrong Supabase client — settings-form voice saves will silently drop.
- The chat onboarding path (the primary first-run path) is functional end-to-end today. No migration, no new component, no unblocking required.
- No other blocking gap was found.

## Options

### Option A: Walk the flow today, fix settings form bug as cleanup
- **What it is:** Open `/aion` now and walk the onboarding — it works. Then fix `saveAionVoiceConfig()` in a follow-up commit by switching to `getSystemClient()` with a membership guard, matching the pattern in `setLearnOwnerCadence()` at line 116.
- **Effort:** Small (5-line fix + 10-minute verification)
- **Main risk:** If other workspace UPDATE callers also use the wrong client, a broader audit may surface more fixes, but they would not block this flow.
- **Unlocks:** Both chat and settings paths fully functional.

### Option B: Fix the bug first, then verify
- **What it is:** Patch `saveAionVoiceConfig()` before touching the flow, so no settings-triggered write could corrupt state mid-setup.
- **Effort:** Small (same fix, different sequence)
- **Main risk:** Adds a deploy cycle before Daniel can test, when the chat path doesn't need it.
- **Unlocks:** Same as A, in a slightly safer order.

### Option C: Audit all workspace UPDATE callers before patching
- **What it is:** Grep all `supabase.from('workspaces').update()` calls and verify each uses the correct client.
- **Effort:** Medium
- **Main risk:** Scope creep; the bug is already identified and isolated.
- **Unlocks:** Confidence across the codebase, but not required to ship the voice setup.

## Recommendation

Option A. The chat onboarding path is functional today. Phase A prerequisites shipped; there is nothing to unblock on the schema or route side. The `saveAionVoiceConfig()` bug is real but it only blocks the secondary (settings form) edit path — it does not affect the first-run chat experience, which uses `updateAionConfigForWorkspace()` via the system client. Fix it as a five-line cleanup commit: switch `saveAionVoiceConfig()` to use `getSystemClient()` with a membership check, exactly as `setLearnOwnerCadence()` does at line 116. Then the settings form edit path is also solid.

The only thing to verify before considering Phase A closed: open `/aion`, walk the `no_voice → no_example → no_guardrails → needs_test_draft` flow, and confirm `aion_config` updates in the DB at each step. If the kill switch is `true` on the workspace (check `workspaces.aion_config.kill_switch` in the SQL Editor), toggle it off with `toggleAionKillSwitch(false)` from `aion-config-actions.ts:222`.

## Next steps for Daniel

1. Open `/aion` in the app. Aion should greet with the `no_voice` onboarding prompt. If it gives a full warm greeting instead, `onboarding_state` is already set — check `SELECT aion_config FROM public.workspaces WHERE id = '<your_workspace_id>'` in the SQL Editor.
2. Type 3 paragraphs describing your communication style. After submitting, verify `aion_config->>'voice'` updated in the DB.
3. Continue through the onboarding (example message → guardrails). Confirm DB after each step.
4. When Aion offers a test draft, open a live deal in the CRM with a pending follow-up and trigger a draft. Confirm it reads in your voice.
5. Fix the settings form bug: in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:161`, replace the `createClient()` write with `getSystemClient()` guarded by a membership check (mirror `setLearnOwnerCadence()` at line 116 of the same file).
6. If the chat flow returns an error (not the onboarding prompt), check `aion_config.kill_switch` — if `true`, call `toggleAionKillSwitch(false)` or set it directly in the SQL Editor.

## References

- `src/app/(dashboard)/aion/AionPageClient.tsx:73` — no pause gate; ChatInterface renders directly
- `src/shared/ui/layout/nav-items.ts:36` — Aion nav active
- `src/app/api/aion/chat/route.ts:225` — kill switch check; `:239`–`:288` — greeting + onboarding state machine
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` tool; `:36` — `buildDraftPrompt()`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:49` — `AionConfig` type; `:116` — correct system-client pattern; `:161` — `saveAionVoiceConfig()` bug; `:192` — `updateAionConfigForWorkspace()` correct path
- `supabase/migrations/20260407140000_aion_voice_foundation.sql:7` — `aion_config` column added
- `src/app/api/aion/draft-follow-up/route.ts:60` — draft generation endpoint
- `src/app/(dashboard)/(features)/crm/actions/follow-up-actions.ts:545` — `getDealContextForAion()`
