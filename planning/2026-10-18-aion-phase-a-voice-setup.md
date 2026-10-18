# Aion Phase A: voice setup + first real draft

_Researched: 2026-10-18 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The premise of this question is outdated.** The codebase has shipped well past Phase A. Key facts:

- `public.workspaces.aion_config` exists as a JSONB column. `getAionConfigForWorkspace` reads it at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:106`. The `AionConfig` type includes `voice`, `learned`, `follow_up_playbook`, `kill_switch`, `onboarding_state`, and `voice_default_derived`.

- `/api/aion/chat/route.ts` is a 464-line authenticated, rate-limited, tool-calling route — not a stub. It handles model routing, streaming, session summarization, and scope resolution.

- Voice onboarding is a 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) defined at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`. Each state triggers a dedicated greeting and system-prompt instruction.

- `/api/aion/draft-follow-up/route.ts` is live. `generateFollowUpDraft` at `src/app/api/aion/lib/generate-draft.ts:25` injects the workspace voice into the prompt verbatim before calling the fast model.

- The `draft_follow_up` chat tool at `src/app/api/aion/chat/tools/core.ts:318` can generate a draft inside the chat, falling back to the top-priority deal in the queue when no dealId is given.

- `saveAionVoiceConfig` at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:178` is a working server action that writes back to `public.workspaces.aion_config`.

**The one mechanism that bypasses onboarding:** `applyVoiceDefaultIfEmpty` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35` synthesizes a generic voice from the workspace name on every config read when no voice is stored, and sets `voice_default_derived: true`. `getOnboardingState` treats that flag as `configured` and skips the 5-step flow. A new workspace landing on `/aion` sees the "configured" pull-mode greeting immediately — the teaching flow is only accessible via "Tune Aion's voice" in the sidebar header overflow.

## Intended state

The goal from the queue entry: Daniel opens Aion, writes 3 paragraphs about how he talks to clients, and immediately sees a follow-up draft that reflects his voice. The machinery for this exists end to end. The missing piece is discoverability: a new owner should be nudged to personalize the synthesized default voice rather than silently inheriting a generic template.

## The gap

- New workspaces are immediately in `configured` state due to `voice_default_derived`. The onboarding flow never fires unless the owner finds the sidebar overflow → "Tune Aion's voice".
- There is no first-run affordance on `/aion` that says "your voice is a placeholder — personalize it."
- The `draft_follow_up` tool returns `{ error: 'No deals in the follow-up queue.' }` if the queue is empty. A brand-new workspace with no deals cannot see a test draft at the end of onboarding.

## Options

### Option A: Onboarding nudge strip in the Aion sidebar

Add a dismissible banner at the top of the `AionSidebar` when `voice_default_derived === true`. The banner says "Your voice is a placeholder — personalize it." with a single CTA that calls `resetAionVoiceConfig` and triggers the 5-step chat flow.

- **Effort:** Small — one conditional banner in `AionSidebar.tsx`, reads from context already available in `SessionContext` or re-fetched on mount.
- **Main risk:** Requires the config to be readable client-side; currently `getAionConfig` is a server action, so the client needs a prop or a small fetch.
- **Unlocks:** First-run owners get guided into voice setup without hunting for it.

### Option B: Voice state in the `configured` greeting

When `buildGreeting` is called with state `configured` and the config has `voice_default_derived: true`, return a different greeting: introduce the synthesized voice, explain it is a placeholder, and offer "Personalize your voice" as a chip. Clicking it sends `resetAionVoiceConfig` via a server action, then the next greeting cycle opens at `no_voice`.

- **Effort:** Small — a condition branch in `buildGreeting` (currently at `src/app/api/aion/chat/route/prompts.ts:349`) plus a server action the chip message routes to.
- **Main risk:** The chat route would need to handle a reset action before the message array is populated (empty messages path). A dedicated `[reset-voice]` synthetic message pattern — parallel to the existing `[arg-edit]` and `[open-pin]` patterns — handles this cleanly.
- **Unlocks:** Voice personalization is surfaced inline in the first chat session, no UI widget needed.

### Option C: Dedicated voice-setup form (settings page)

Replace the conversational 4-step flow with a single form in Settings → Aion (already at `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`). Three textarea fields: communication style, example message, rules. On save, immediately trigger a test draft for the most recent deal and display it inline.

- **Effort:** Medium — new form component, a test-draft invocation after save, wiring the result back to the settings page.
- **Main risk:** Moves voice setup out of the flow context (the chat) where it is most natural to teach; owners may not navigate to settings.
- **Unlocks:** More structured input; removes dependency on the chat conversation for initial setup.

## Recommendation

**Option B.** The conversational 5-step flow is already built and tested. The only broken link is the greeting: `voice_default_derived` silently skips it. Adding a branch in `buildGreeting` to detect this flag costs under 30 lines and keeps setup inside the chat — the place owners already are. The `[reset-voice]` synthetic message pattern is two files (route.ts short-circuit, prompts.ts branch) and a server action call, matching the existing `[arg-edit]` pattern exactly.

The empty-queue edge case (no test draft for brand-new workspaces) is tolerable: the `draft_follow_up` tool already returns a graceful error; the system prompt for `needs_test_draft` can prompt Aion to ask the owner to add their first deal if the queue comes back empty.

Option A (sidebar banner) is fine as a complementary nudge but not a substitute — it requires adding client-readable config state. Option C fragments the voice UX and adds surface area that settings-averse founders may not touch.

## Next steps for Daniel

1. In `src/app/api/aion/chat/route/prompts.ts:349` — add a condition before the main `configured` branch: if `config.voice_default_derived === true`, return a greeting that names the synthesized voice, explains it is a placeholder, and offers a "Personalize your voice" chip.
2. In `src/app/api/aion/chat/route.ts` — add a `[reset-voice]` synthetic-message short-circuit (parallel to `[arg-edit]` at line 139). When matched, call `resetAionVoiceConfig` (already exists) and return the `no_voice` greeting.
3. In `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — confirm `getOnboardingState` returns `'configured'` only when `onboarding_state === 'complete'` OR voice is explicitly set; the `voice_default_derived` path should be a distinct return value (`'voice_default'`) so greeting and prompt can distinguish "configured by owner" from "synthesized placeholder." (Optional refinement.)
4. Smoke-test: create a fresh workspace, open `/aion`, verify the new "placeholder voice" greeting appears, click the chip, walk through all 5 onboarding states, confirm the test draft reflects the entered voice.
5. If the follow-up queue is empty at step 4, Aion should offer "Add your first deal to generate a test draft" rather than returning a raw error string.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig` type, `saveAionVoiceConfig`, `getAionConfigForWorkspace`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, 5-state machine
- `src/app/api/aion/chat/route/prompts.ts` — `buildGreeting`, `buildSystemPrompt`, onboarding state branches
- `src/app/api/aion/chat/route.ts` — synthetic-message short-circuit patterns (lines 137–152)
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, voice injection
- `src/app/api/aion/chat/tools/core.ts:318` — `draft_follow_up` tool, queue fallback
