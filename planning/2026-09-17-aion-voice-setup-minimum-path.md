# Aion Voice Setup: Minimum Path to First Real Draft

_Researched: 2026-09-17 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

> **Restatement note:** Two premises in this question are stale (the primer was written 2026-04-10; codebase has advanced significantly). `aion_config` does exist. The Brain tab was never fully built. The research below reflects current reality.

## Current state

**`aion_config` column exists.** `src/types/supabase.ts:7895` shows `aion_config: Json` on `public.workspaces` (Insert optional at line 7940, Update optional at line 7985).

**`AionVoiceConfig` type is defined.** `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–16`:
```
{ description: string; example_message: string; guardrails: string }
```

**`saveAionVoiceConfig()` is wired.** `aion-config-actions.ts:178` — reads current config, merges voice, writes to `workspaces.aion_config`. Also clears `voice_default_derived` flag so the derived voice is replaced.

**`/api/aion/draft-follow-up` exists and is fully wired.** `src/app/api/aion/draft-follow-up/route.ts:60` calls `generateFollowUpDraft({ context, voice: aionConfig.voice })`. `src/app/api/aion/lib/generate-draft.ts:63–74` injects `voice.description`, `voice.example_message`, `voice.guardrails` into the system prompt under `--- How This Company Communicates ---`.

**The Aion chat has a complete conversational voice-setup flow.** `src/app/api/aion/chat/route/prompts.ts:301–347` — `buildGreeting()` returns a different cold-open for each of four states (`no_voice → no_example → no_guardrails → needs_test_draft`). `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives the transitions. When all three fields are saved and `onboarding_state !== 'complete'`, state is `needs_test_draft` and the greeting offers: "Want me to draft a test message for one of your active deals?"

**The deal page has no Brain/Aion tab.** `src/app/(dashboard)/(features)/events/components/prism.tsx:687–689` defines exactly three tabs: Deal, Plan, Ledger. No Aion/Brain entry exists.

**`/settings/aion` has no voice form.** `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` covers consent, cadence toggle, memory backfill, and admin controls — no voice setup UI.

**`toggleAionKillSwitch()` exists but has no UI caller.** `aion-config-actions.ts:292`. Since no UI ever sets `kill_switch: true`, it is almost certainly false in Daniel's workspace. All API routes check it and return 403 if true.

## Intended state

Daniel opens a surface, writes three freeform paragraphs covering style, example message, and guardrails, saves them, and immediately sees an Aion-generated follow-up draft for a real deal that reflects that voice. From that moment, every auto-drafted follow-up in the cron queue uses his voice. The "3 paragraphs" framing suggests a form, not a multi-turn chat conversation.

## The gap

- No form-based voice setup UI exists anywhere (only conversational, chat-driven onboarding)
- No Brain tab on the deal page
- `/settings/aion` lacks a voice section despite being the natural home for workspace-level configuration
- No direct "write voice → see draft" path outside the Aion chat

## Options

### Option A: Use existing Aion chat today (zero code)

- **What it is:** The 4-step conversational voice onboarding at `/aion` is already complete. Opening Aion chat with no voice configured triggers "How would you describe your style?" → example message → rules → test draft offer. Voice is saved automatically via the `save_voice_config` chat tool at each step.
- **Effort:** Small — navigate to `/aion`, follow prompts (10 minutes to first draft).
- **Main risk:** The experience is conversational, not form-based — Daniel fills in voice across 4 turns rather than 3 textareas at once. Also: if `kill_switch` is somehow true, every API call returns 403 with no UI to fix it.
- **Unlocks:** Voice configured and first draft today, with zero code written.

### Option B: Voice setup form in `/settings/aion` (recommended)

- **What it is:** Add a `VoiceSetupPanel` component to `AionSettingsView.tsx` — three labeled textareas for `description`, `example_message`, `guardrails` (pre-filled from existing voice if any), a Save button calling `saveAionVoiceConfig()`, and a "Generate test draft" section that reads the top item from `ops.follow_up_queue` and POSTs to `/api/aion/draft-follow-up`. Show the returned draft inline.
- **Effort:** Small — one new file (`VoiceSetupPanel.tsx`), ~100 lines, one edit to `AionSettingsView.tsx`, one new Server Action to fetch the top queue item + call draft-follow-up.
- **Main risk:** Test draft needs a real deal context; if the workspace has no deals yet, the preview falls back to a generic placeholder or shows a helpful empty state. The settings page is slightly awkward for a task that feels like it belongs in the deal flow.
- **Unlocks:** Form-based "3 paragraphs" UX, re-editable voice, immediate draft preview — all at `/settings/aion`. Can also add a kill-switch toggle here while the file is open.

### Option C: Aion tab on the deal page

- **What it is:** Add a 4th tab ("Aion") to `prism.tsx:687`. Mount `ChatInterface` inside it, create a session scoped to the current deal via `cortex.migrate_session_scope`, and pass `scopeHeaderVariant="lite"`. Voice onboarding fires on first open if not configured; subsequent opens show the scoped chat with deal context already loaded.
- **Effort:** Medium — `prism.tsx` is large and complex (~1000 lines), session creation logic needs care, scope wiring requires the `migrate_session_scope` RPC call.
- **Main risk:** Adds UI weight to an already-dense page. Scope wiring has been the source of prior bugs. Over-builds before voice config is even validated.
- **Unlocks:** The "Brain tab" concept exactly as described — deal-scoped Aion entry, voice-aware drafts in deal context.

## Recommendation

**Ship Option B first, then Option C.**

Option A works today and costs nothing, but it produces a conversational result rather than the "3 paragraphs" form flow Daniel described. More importantly: a form is the right UX for a workspace-level setting that gets edited once and then left alone. The `/settings/aion` page already exists and has the right shape for this.

Option B is about 2 hours of work: one new component, no schema changes, no new API routes. `saveAionVoiceConfig()` already exists. The draft endpoint already reads voice. The test draft fetch can be a simple Server Action that calls `supabase.schema('ops').from('follow_up_queue').select('*').order('priority', { ascending: false }).limit(1)` to get a deal context, then POSTs to `draft-follow-up`. This is the smallest complete loop: form → save → draft → done.

Option C (the real Brain tab) is correct long-term but adds deal-page complexity before the voice config is even validated. Build it in the sprint after Option B proves that voice-aware drafts actually improve Daniel's output.

One thing to check before starting: confirm `aion_config.kill_switch` is false in your workspace. No UI can fix it if it's true — you'd need to update the `workspaces` row directly in Supabase Dashboard or add the toggle as part of Option B.

## Next steps for Daniel

1. Confirm `kill_switch` is false: in Supabase Dashboard, run `SELECT aion_config->>'kill_switch' FROM public.workspaces WHERE id = '<your-workspace-id>'`. If it reads `"true"`, set it to false before proceeding.
2. (Optional, zero code) Open `/aion` now — if no voice is configured, the 4-step onboarding fires immediately and produces a test draft. This validates the backend works before touching UI.
3. Create `src/app/(dashboard)/settings/aion/VoiceSetupPanel.tsx` — three `<textarea>` fields wired to `saveAionVoiceConfig()`, pre-populated from `getAionConfig()`.
4. Add a "Test your voice" section to `VoiceSetupPanel`: fetch the top `ops.follow_up_queue` row for the workspace, call `POST /api/aion/draft-follow-up`, render the returned draft.
5. Import `VoiceSetupPanel` into `AionSettingsView.tsx` and add it as a new section above the cadence toggle.
6. While editing `AionSettingsView.tsx`, add a `toggleAionKillSwitch()` button (owner-only) so the kill switch is manageable from the UI.

## References

- `src/types/supabase.ts:7895` — `aion_config` column definition
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–16, 178` — `AionVoiceConfig` type + `saveAionVoiceConfig()`
- `src/app/api/aion/draft-follow-up/route.ts:60` — draft endpoint, voice injection
- `src/app/api/aion/lib/generate-draft.ts:52–74` — `buildFollowUpPrompt()`, voice → system prompt
- `src/app/api/aion/chat/route/prompts.ts:301–347` — `buildGreeting()`, 4-step onboarding flow
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247–256` — `getOnboardingState()`
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings page (no voice section today)
- `src/app/(dashboard)/(features)/events/components/prism.tsx:687–689` — deal page tab definitions
