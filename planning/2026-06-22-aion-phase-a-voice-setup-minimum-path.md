# Aion Phase A: voice setup + first real draft — minimum path

_Researched: 2026-06-22 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The premise of this question is outdated. As of June 2026, the entire Phase A stack is built and wired.

**Schema:** `aion_config: Json` column exists on `public.workspaces` (`src/types/supabase.ts:7782`). The `AionVoiceConfig` type (`description`, `example_message`, `guardrails`) is defined at `aion-config-actions.ts:12-16`.

**Onboarding state machine:** `getOnboardingState` at `aion-chat-types.ts:247` drives five states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. It is called on every chat turn at `chat/route.ts:122`. The chat route injects per-state instructions into the system prompt at `prompts.ts:275-283` and serves differentiated greeting messages per state at `prompts.ts:300-332`.

**Voice config save:** A `save_voice_config` chat tool at `chat/tools/core.ts:122-137` writes voice fields directly to `aion_config` via `updateAionConfigForWorkspace`. The tool accepts `description`, `example_message`, `guardrails`, and `onboarding_complete`. No separate form required — the chat itself is the setup flow.

**Draft generation:** `/api/aion/draft-follow-up` is live (73 lines). `buildFollowUpPrompt` at `generate-draft.ts:62-75` injects `aion_config.voice` into the system prompt for every draft. The follow-up card calls this endpoint at `follow-up-card.tsx:338-370`.

**The `/aion` route:** `AionPageClient.tsx:66-76` renders `ChatInterface` at `viewState="chat"`. The page is live. The "Brain tab" is the Aion page at `/aion`, not a tab within another page.

**The shortcut that bypasses onboarding:** `applyVoiceDefaultIfEmpty` at `aion-config-helpers.ts:35-44` synthesizes a generic voice from the workspace name on every `getAionConfig` read. This sets `voice_default_derived: true`, causing `getOnboardingState` to return `configured` immediately. New owners never see the 4-step flow — they're silently pre-configured. To re-enter explicit voice setup, an owner must click "Tune Aion's voice" in the Sidebar header overflow (`AionSidebar.tsx:1043`), which calls `resetAionVoiceConfig()` and clears the flag.

**Kill switch:** `aion_config.kill_switch` is checked at every Aion API route (`chat/route.ts:109`, `draft-follow-up/route.ts:54`, `dispatch/route.ts:62`, `capture/transcribe/route.ts:167`). If it is ON, all routes return a paused error and nothing works.

## Intended state

Daniel opens `/aion`, the chat prompts him to describe his communication style, he writes a few sentences, the bot asks for an example message, then for rules. Once all three are captured via `save_voice_config`, Aion offers a test draft from an active deal. After approval, `onboarding_complete: true` flips the workspace to `configured`. Every subsequent draft from the follow-up card now reflects his voice.

## The gap

- The 4-step onboarding flow is **bypassed by default** via `voice_default_derived`. Daniel lands in `configured` state without ever writing a sentence about his communication style.
- "Tune Aion's voice" is **buried** in the Sidebar header overflow — not discoverable for a first-time user who doesn't know it exists.
- Kill switch status for Daniel's workspace is unknown from the codebase. If it is ON, nothing in Aion responds.
- `AionVoice` audio recording is `md:hidden` (`AionInput.tsx:193-201`) — desktop users cannot record voice input. Chat-only on desktop.

## Options

### Option A: Use what exists now — no code changes

- **What it is:** Check the kill switch in the Supabase Dashboard (SQL: `SELECT aion_config->>'kill_switch' FROM public.workspaces WHERE id = '<workspace_id>'`). If ON, call `toggleAionKillSwitch(false)` via the admin route or SQL. Then open `/aion`, click the Sidebar overflow → "Tune Aion's voice", and complete the 4-step chat flow. The follow-up card then generates a voice-aware draft.
- **Effort:** Small — minutes, no code
- **Main risk:** If the kill switch is a deliberate product gate (awaiting timeline engine per the April 2026 note), turning it off may surface incomplete behaviour elsewhere in the Aion system
- **Unlocks:** Immediate end-to-end test of the full Phase A loop as designed

### Option B: Surface voice setup on first `/aion` visit for `voice_default_derived` workspaces

- **What it is:** When `ChatInterface` receives a greeting in `configured` state but `voice_default_derived: true`, render a dismissible setup card (not a modal block) above the chat: "Aion is using a default voice based on your workspace name. Tell me how you actually talk to clients and I'll tune it." One tap enters the `resetAionVoiceConfig` + chat flow. No new route; one conditional block in the greeting render path.
- **Effort:** Small — one component + one condition
- **Main risk:** Adds a step to the Aion cold-open for any workspace that hasn't explicitly set voice
- **Unlocks:** Owners discover the voice setup path without knowing the sidebar overflow exists; closes the onboarding loop for all future sign-ups

### Option C: Dedicated `/aion/settings` voice form

- **What it is:** A standalone settings page with three labeled textareas (`description`, `example_message`, `guardrails`) and a save button calling `saveAionVoiceConfig`. More direct than the conversational flow.
- **Effort:** Medium — new route, new page component, validation
- **Main risk:** Loses the conversational framing that makes voice capture natural; duplicates the `save_voice_config` save path; more surface to maintain
- **Unlocks:** An explicit, non-chat path for users who prefer a form

## Recommendation

Start with Option A this week, then queue Option B as a product improvement.

The system is built. Daniel can achieve his stated goal — voice setup + first real draft — today, with no code changes, by (1) verifying the kill switch is off and (2) triggering the existing "Tune Aion's voice" reset from the sidebar. The 4-step chat flow runs exactly as designed: Aion asks about style, requests an example, collects guardrails, then calls `draft_follow_up` from within the chat for a live test.

Option B is worth doing, but it is a discovery problem, not a capability gap. Once Daniel has confirmed the full flow works end-to-end via Option A, the decision of whether to surface onboarding more prominently becomes informed by real usage rather than speculation. Put it in the queue as a follow-up question scoped to "how do we make voice setup discoverable for new owners."

Option C adds a form that duplicates an already-working conversational path. Skip it.

## Next steps for Daniel

1. Check kill switch: run `SELECT aion_config->>'kill_switch' FROM public.workspaces WHERE id = '<your_workspace_id>'` in the Supabase SQL editor. If `true`, set to off via `toggleAionKillSwitch(false)` at `aion-config-actions.ts:292` or direct SQL update.
2. Navigate to `/aion` in the dashboard.
3. Open the Sidebar (the left panel), click the settings/overflow icon in the header, choose "Tune Aion's voice". This calls `resetAionVoiceConfig` and re-enters `no_voice` state.
4. Respond to the chat prompts: describe your style, paste an example message, describe your rules. The `save_voice_config` tool fires after each step.
5. When Aion offers a test draft from an active deal (the `needs_test_draft` greeting), approve or reject it. Approval flips `onboarding_state: complete`.
6. Open any deal → Follow-Up Card → "Draft message" — confirm the draft reflects your voice from step 4.

## References

- `src/types/supabase.ts:7782` — `aion_config` column on `public.workspaces`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16` — `AionVoiceConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` — `saveAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:292` — `toggleAionKillSwitch`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-44` — `applyVoiceDefaultIfEmpty` (the bypass)
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/api/aion/chat/route.ts:121-122` — onboarding state called per turn
- `src/app/api/aion/chat/route/prompts.ts:275-332` — per-state system prompt + greetings
- `src/app/api/aion/chat/tools/core.ts:122-137` — `save_voice_config` tool
- `src/app/api/aion/lib/generate-draft.ts:62-75` — voice config injected into draft prompt
- `src/app/(dashboard)/aion/AionPageClient.tsx:66-76` — `/aion` page
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — "Tune Aion's voice" entry point
