# Minimum path to Aion voice setup and first draft

_Researched: 2026-08-18 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

> **Note on premise:** Both stated blockers are resolved. `aion_config` was added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` and is fully reflected in `src/types/supabase.ts:7782`. There is no "Brain tab" route — that label was aspirational. The real gap is UX: voice setup exists behind a hidden sidebar overflow menu, and no direct form-based entry point exists.

## Current state

**`aion_config` column is live.** `public.workspaces.aion_config` is a non-null JSONB column. The typed shape is `AionVoiceConfig = { description, example_message, guardrails }` defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16`.

**All three write paths exist.** `saveAionVoiceConfig(voice)` at `aion-config-actions.ts:178` merges and persists the voice struct using the server Supabase client. `resetAionVoiceConfig()` at `aion-config-actions.ts:214` clears voice + derived flag to re-enter setup. `updateAionConfigForWorkspace()` at `aion-config-actions.ts:262` is the system-client path used by API routes.

**Voice is injected into both draft surfaces.** The main chat system prompt at `src/app/api/aion/chat/route/prompts.ts:88-91` emits `Voice:`, `Example:`, and `Guardrails:` lines from the stored config. The draft-follow-up route at `src/app/api/aion/draft-follow-up/route.ts:62` passes `aionConfig.voice` to `buildFollowUpPrompt()` in `src/app/api/aion/lib/generate-draft.ts:63-75`, which injects description, example, and guardrails as a labeled prompt section.

**Conversational onboarding already exists.** A five-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) is defined at `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257`. The chat route's `buildSystemPrompt` injects step-specific instructions at `prompts.ts:275-283` so Aion guides the user through each field in chat. The fourth state triggers a test draft.

**New workspaces get a synthesized default and skip forced onboarding.** `applyVoiceDefaultIfEmpty()` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` synthesizes a voice from the workspace name on every read and sets `voice_default_derived: true`. `getOnboardingState()` at `aion-chat-types.ts:248` short-circuits to `configured` when that flag is set. So new workspaces never see the conversational onboarding unless the owner deliberately triggers it.

**The only entry point is buried.** "Tune Aion's voice" at `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` is an overflow menu item that calls `resetAionVoiceConfig()` then relies on the user knowing to start chatting. There is no form, no dedicated page, and no visible CTA inviting setup.

**The Aion chat UI is fully wired.** `ChatInterface.tsx`, `AionInput.tsx`, and `AionVoice.tsx` all exist and are functional. The gap is specifically in the voice setup entry point, not in the underlying infrastructure.

## Intended state

Daniel opens a visible voice setup surface — a form or a dedicated panel — writes free-form prose about his communication style (description, example message, guardrails), saves it in one action, and immediately sees an Aion-generated follow-up draft that reflects what he wrote. This is the "writes 3 paragraphs → sees a draft" loop described in the queue item. All backend infrastructure for this loop is already built. The missing piece is the UI surface that makes it accessible without hunting through sidebar overflow menus.

## The gap

- No visible entry point for voice setup — users who get a synthesized default never see an invitation to tune it.
- No form surface — the only setup path is conversational (3 separate chat turns with Aion guiding through each field), not a textarea where you write freely.
- No "save → test draft" shortcut — after saving voice config, generating a test draft requires navigating to a deal with a follow-up, or waiting for the cron.

## Options

### Option A: Voice setup form in the Aion sidebar

- **What it is:** A slide-out or collapsible form panel triggered by a visible "Set up your voice" button above the chat input (or a dedicated sidebar section). Three labelled textareas for description, example, and guardrails. Save button calls `saveAionVoiceConfig()`. On success, immediately POSTs to `/api/aion/draft-follow-up` with a sample deal to render an inline draft preview.
- **Effort:** Small — 1 new form component, 1 new sidebar section, wire to 2 existing server actions. The draft preview reuses `AionDealContext` already fetched for the follow-up queue. No new routes.
- **Main risk:** The draft preview requires at least one deal with a follow-up queued. If the workspace is empty, the preview silently fails — needs a graceful "no deals to preview against" fallback.
- **Unlocks:** Daniel can set up voice in under 2 minutes, then immediately see how it sounds against a real deal. This is the exact loop the queue item describes.

### Option B: Make the conversational onboarding the entry point

- **What it is:** Keep the existing 4-step chat onboarding, but make it prominent. Add a visible "Set up Aion's voice" banner or card in the Aion chat empty state that, when clicked, calls `resetAionVoiceConfig()` and auto-sends the first greeting. No new form needed.
- **Effort:** Small to medium — 1 new empty-state card, a click handler that resets + triggers the greeting. The existing chat onboarding already handles every subsequent step.
- **Main risk:** The experience is less direct. Daniel writes 3 separate chat turns (not 1 form). The Aion responses add latency. On a slow connection the onboarding feels broken.
- **Unlocks:** Lower code surface — no new form component. Leans on the existing chat flow which is already tested.

### Option C: Dedicated `/aion/settings` page with voice form

- **What it is:** A new route segment (`/aion/settings` or `/aion/brain`) with a full-page voice setup form, live draft preview, and a toggle for owner-cadence learning. Shows the current voice fields pre-populated; save revalidates the Aion chat.
- **Effort:** Medium — new page file, new route segment, new form component. Duplicate of much of Option A but with more real estate for explanatory copy and a richer preview.
- **Main risk:** Over-engineering for a first pass. A full settings page implies there are more settings to follow. The voice form alone doesn't fill a page gracefully.
- **Unlocks:** A natural home for future Aion configuration (playbook rules, cadence toggle, kill switch). Good if configuration surface is expected to grow.

## Recommendation

**Option A: voice setup form in the sidebar.** The backend is complete. The gap is purely UI. A sidebar panel keeps the interaction in context (Daniel is already in Aion), ships fastest, and delivers the exact experience the queue item describes — write text, hit save, see a draft. The draft preview is the critical feedback loop that makes the feature feel real.

Concretely: replace the "Tune Aion's voice" sidebar overflow item with a persistent, visible form panel that slides in when clicked. Three textareas, placeholder text that mirrors what the synthesized default currently generates (so Daniel knows what to improve), a save button. On save success, immediately call `/api/aion/draft-follow-up` against the highest-priority queued deal and render the draft inline. If no deal is queued, show a static "Your voice is set — it'll apply to your next draft" confirmation.

Accept that Option C is right once the configuration surface grows. That refactor is easy after Option A ships — the form component is reusable.

## Next steps for Daniel

1. Add a "Voice" section to `AionSidebar.tsx` — a collapsible panel with three textareas bound to `AionVoiceConfig` fields. Trigger it from both the overflow menu (existing) and a new visible button in the sidebar header for empty/default-voice workspaces.
2. In the panel's save handler, call `saveAionVoiceConfig(voice)` (already exported from `aion-config-actions.ts:178`).
3. After a successful save, fetch the top queued deal via the existing follow-up queue query and POST to `/api/aion/draft-follow-up`. Render the returned draft inline in the voice panel.
4. Add an `onboarding_state !== 'configured' || voice_default_derived` check in `ChatInterface.tsx` or `AionSidebar.tsx` to show the new "Set up your voice" affordance prominently for first-time and default-voice workspaces.
5. Rename `ION_SYSTEM` / `ION_FULL_SYSTEM` in `src/features/ai/tools/package-generator.ts:22` to `PACKAGE_SYSTEM` / `PACKAGE_FULL_SYSTEM` (legacy brand cleanup, not blocking, but visible in the same area).

## References

- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` — column creation
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16, 178, 214` — types + write actions
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35-45` — synthesized default
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — onboarding state machine
- `src/app/api/aion/chat/route/prompts.ts:88-91, 275-283` — voice in chat system prompt
- `src/app/api/aion/lib/generate-draft.ts:63-75` — voice in draft generation
- `src/app/api/aion/draft-follow-up/route.ts:62` — draft route
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973-1044` — current entry point
- `src/features/ai/tools/package-generator.ts:22` — ION_SYSTEM legacy name
