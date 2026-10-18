# Aion Phase A: Voice Setup to First Real Draft

_Researched: 2026-08-15 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The planning primer (2026-04-10) is substantially out of date. As of this research run, the full Phase A infrastructure is already shipped:

**`aion_config` column exists.** Migration `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` adds `aion_config jsonb NOT NULL DEFAULT '{}'::jsonb` to `public.workspaces`. The column is typed and used throughout.

**Chat route is fully built.** `/api/aion/chat/route.ts` is not a stub. It authenticates, reads `aionConfig`, determines onboarding state via `getOnboardingState()`, and routes the greeting accordingly (`src/app/api/aion/chat/route.ts:122`).

**4-step voice onboarding state machine is wired.** `getOnboardingState()` at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` drives `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state produces a targeted greeting via `buildGreeting()` (`prompts.ts:292`), and the system prompt in `buildSystemPrompt()` injects an `=== ONBOARDING ===` block telling the model what to ask next (`prompts.ts:275-283`).

**`draft_follow_up` is a registered chat tool.** It lives in `src/app/api/aion/chat/tools/core.ts:318`, uses `getDealContextForAion` + `buildDraftPrompt`, applies voice config (description, example, guardrails, vocabulary), and returns a `DraftPreviewCard` — an editable, copyable inline card in the chat thread.

**Learn-from-edit is live.** `/api/aion/learn-from-edit/route.ts` fires after every draft edit, extracts vocabulary swaps via LLM, persists them to `aion_config.learned.vocabulary`, and saves an episodic memory to `cortex.memory`.

**The Brain tab is ChatInterface.** `src/app/(dashboard)/aion/AionPageClient.tsx:74` renders `<ChatInterface viewState="chat" />`. There is no "paused" flag in the current code.

**However — new workspaces skip the onboarding flow.** `applyVoiceDefaultIfEmpty()` (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:36`) synthesizes a default voice from the workspace name and sets `voice_default_derived: true`. Because `getOnboardingState()` returns `'configured'` immediately when that flag is set (`aion-chat-types.ts:248`), a fresh workspace goes straight to the pull-mode greeting and never sees the "how do you talk to clients?" prompt.

## Intended state

The original goal: Daniel opens Aion, describes his communication style in a few paragraphs, and immediately sees a real draft for an active deal that reflects that voice. The 4-step onboarding flow was designed for exactly this — it exists but is bypassed for new workspaces by the synthesized-default path, which was added later (Wk 11 §3.8) to reduce friction for owners who just want to use Aion without setup.

The two behaviors are in tension: synthesized default reduces cold-start friction; explicit voice capture produces better early drafts and sets up the learn-from-edit loop.

## The gap

- New workspace → `voice_default_derived: true` → `getOnboardingState()` returns `'configured'` → 4-step onboarding never fires.
- The "Tune Aion's voice" path (sidebar overflow → `resetAionVoiceConfig()`) re-enters the onboarding flow but is not discoverable on first open.
- The `needs_test_draft` greeting (which proactively offers a draft after voice is configured) is only reachable via the explicit 4-step path, not the synthesized-default path.
- The draft tool requires at least one deal in the follow-up queue to draft against. If Daniel has no deals yet, the test draft will say "nothing in your queue."

## Options

### Option A: Accept the synthesized default, add a voice-setup chip to the landing starters

- **What it is:** Add "Teach Aion your voice" to `AionLandingStarters.tsx` when `voice_default_derived === true` (pass the flag from the greeting fetch response or from `getAionConfig()`). The chip sends: "I want to set up my communication style for follow-up drafts." The chat route handles it conversationally — it would call `resetAionVoiceConfig()` internally (or the user can be prompted to confirm), then re-enter the `no_voice` onboarding branch.
- **Effort:** Small. One prop added to `AionLandingStarters`, one server action call to expose `voice_default_derived` through the greeting response, one conditional chip render.
- **Main risk:** The chip is conversational — it depends on the model correctly interpreting the reset intent and triggering the 4-step flow, not just answering the question in-line.
- **Unlocks:** First-time owners have a clear path to explicit voice capture from the landing screen without hiding the option in a menu.

### Option B: Explicit voice setup form in Settings (non-chat)

- **What it is:** A form at `/settings/aion` (or a sheet on `/aion`) with three fields — description, example message, guardrails — that calls `saveAionVoiceConfig()` directly. After save, redirect to Aion chat and fire a greeting that checks `needs_test_draft` and offers a live draft. The `/settings/aion` page already exists (`AionSettingsView.tsx`) but focuses on beta consent, not voice.
- **Effort:** Medium. New form component, one route segment or sheet, wire to existing server action. The `saveAionVoiceConfig` action already exists at `aion-config-actions.ts:178`.
- **Main risk:** Two-surface friction — user leaves chat to fill out a form, comes back. Breaks the conversational pattern the system was built for.
- **Unlocks:** Bypasses all chat-flow dependency. Voice is set in a deterministic form flow. Safe even if model behavior drifts.

### Option C: First-visit gate on Aion chat — force the onboarding turn before pull-mode

- **What it is:** When `voice_default_derived === true` AND the chat session is the first one (no prior sessions for this workspace in `cortex.aion_sessions`), override `getOnboardingState()` to return `'no_voice'` instead of `'configured'`. This makes the first-open greeting the explicit voice prompt: "How would you describe your style?" The synthesized default still applies to draft generation until the user sets their own voice.
- **Effort:** Small-medium. One DB count check in the chat route (whether any prior sessions exist for this workspace); if zero, ignore `voice_default_derived` and let the state machine run. The 4-step flow is already built and tested.
- **Main risk:** Surprises returning owners who were already configured — mitigated by scoping to zero-prior-sessions only. Also: if a workspace's first session was for something other than voice setup, it gets one voice-setup greeting and then never again.
- **Unlocks:** The stated goal: first open → voice capture → draft. No new UI surface needed.

## Recommendation

**Option C** — first-visit gate in the chat route.

The 4-step onboarding is fully built, well-tested, and produces the exact experience the question describes. The synthesized-default bypass was correct for the "just let me use it" persona but wrong for the "help me set up my voice" first-visit. Scoping the override to `aion_sessions count == 0` is safe, cheap, and reversible.

Concrete change: in `src/app/api/aion/chat/route.ts`, before computing `onboardingState`, run a fast count query on `cortex.aion_sessions` filtered to this workspace. If count is zero, strip the `voice_default_derived` flag from the config before passing it to `getOnboardingState()`. The synthesized voice stays in effect for drafts — only the greeting branch changes. After the user completes onboarding and `save_voice_config` fires with `onboarding_complete: true`, the flag is cleared anyway.

Tradeoff accepted: a returning user who onboarded via another path and has no prior sessions will see the onboarding prompt on their next cold open. This is rare and low-harm — the "Tune Aion's voice" sidebar affordance is the graceful exit.

## Next steps for Daniel

1. Verify the end-to-end draft path works today: open `/aion`, type "draft a follow-up for my top deal", check that the DraftPreviewCard renders with a voice-injected prompt. Confirm via browser devtools that the system prompt sent to the model includes your workspace name in the voice description.

2. Open `src/app/api/aion/chat/route.ts` and find where `getOnboardingState(aionConfig)` is called (line ~122). Add the session-count check just above it.

3. Add the count query using the system client: `system.schema('cortex').from('aion_sessions').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)`. If count is 0, pass `{ ...aionConfig, voice_default_derived: false }` to `getOnboardingState()`.

4. Test the first-visit flow by clearing all sessions for your workspace (or using a fresh workspace) and opening `/aion` — you should see the "Hey, how would you describe your style?" greeting.

5. Follow the onboarding prompts (style → example → guardrails → test draft). The test draft fires `draft_follow_up` with your top-priority deal. If there are no deals in queue, add a test deal first.

6. After approval, verify `aion_config.onboarding_state === 'complete'` in Supabase and confirm subsequent opens land in pull-mode.

## References

- `src/app/api/aion/chat/route.ts` — main chat route, onboarding state resolution
- `src/app/api/aion/chat/route/prompts.ts:247–283` — `buildSystemPrompt` onboarding branches
- `src/app/api/aion/chat/route/prompts.ts:292–436` — `buildGreeting` state → response map
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool
- `src/app/(dashboard)/(features)/aion/components/DraftPreviewCard.tsx` — inline draft card UI
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — `aion_config` column origin
