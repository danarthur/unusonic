# Aion Phase A: voice setup + first draft — where things actually stand

_Researched: 2026-07-28 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How I understood this question:** The primer's state description is stale. Before scoping new work, I need to establish what's actually built. If Phase A is done, the next step is the real answer.

## Current state

Phase A is largely shipped. Every premise in the question is outdated.

**`aion_config` exists.** `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` adds a `jsonb NOT NULL DEFAULT '{}'` column to `public.workspaces`. It is typed in `src/types/supabase.ts` and read/written throughout the codebase.

**The `AionConfig` type is fully defined** at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50` with three voice fields: `description`, `example_message`, and `guardrails`.

**A 5-state onboarding machine is live.** `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:226` defines `OnboardingState` and `getOnboardingState()`. The states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`. The chat route reads this state on every cold open (`src/app/api/aion/chat/route/helpers.ts:122`) and both the greeting and system prompt adapt to it.

**`save_voice_config` is a live chat tool.** `src/app/api/aion/chat/tools/core.ts:118` — when the user describes their style in chat, Aion calls this tool to persist `description`, `example_message`, and `guardrails` to `aion_config`.

**`draft_follow_up` is a live chat tool** wired to `/api/aion/draft-follow-up/route.ts`, which is authenticated, tier-gated, and injects the workspace voice config into the prompt (`src/app/api/aion/lib/generate-draft.ts:63`).

**The "Brain tab" no longer exists as a separate paused surface.** It is the `/aion` chat interface (`src/app/(dashboard)/aion/AionPageClient.tsx:73`). The ChatInterface is live.

**One subtle behavior:** `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` synthesizes a default voice from the workspace name on first load, setting `voice_default_derived: true`. This causes `getOnboardingState()` to return `'configured'` immediately, bypassing the 4-step flow for new workspaces. Users re-enter onboarding via "Tune Aion's voice" in the sidebar overflow (`src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998`).

## Intended state

The stated goal — Daniel opens the Aion tab, writes 3 paragraphs about how he talks to clients, and immediately sees a voice-respecting follow-up draft — is achievable today. The conversational onboarding flow works. The draft tool works. The voice is injected into drafts.

The design intent beyond Phase A (inferred from code comments and adjacent patterns) is that voice config becomes a first-class, directly editable setting — not just something learned through conversation. The settings page (`/settings/aion`) currently only surfaces consent/card-beta state, not the stored voice.

## The gap

- **No direct voice config UI in settings.** Users cannot see, read, or edit their stored `voice.description`, `voice.example_message`, or `voice.guardrails` except by asking Aion in chat or resetting and re-doing the full flow. `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` contains zero reference to voice fields.
- **Voice default fast-path.** New workspaces skip onboarding (get a synthesized default), so Daniel would not naturally encounter the 4-step voice-collection flow without deliberately clicking "Tune Aion's voice."
- **`needs_test_draft` has no deal guard.** If someone completes the 3-step onboarding but has no active deals, the test draft step silently falls back — there is no "no deals yet" empty state in the greeting response at `src/app/api/aion/chat/route/prompts.ts:329`.

## Options

### Option A: Add a voice config panel to /settings/aion

- **What it is:** A read/edit section on the existing settings page showing the stored description, example, and guardrails with inline text areas. Saves via `saveAionVoiceConfig`. Resets via `resetAionVoiceConfig`.
- **Effort:** Small (one new section component, two existing server actions already exist)
- **Main risk:** None — both server actions are already built and tested
- **Unlocks:** Users can audit and fix their voice without going through chat. Reduces confusion about what Aion actually has on file.

### Option B: Add a "first run" prompt on the /aion page for default-derived workspaces

- **What it is:** When `voice_default_derived === true`, show a non-blocking banner in the Aion sidebar or above the input: "Aion is using a default voice — teach it yours." A single CTA triggers `resetAionVoiceConfig()` + `startNewChat()`, entering the 4-step flow.
- **Effort:** Small (one banner component, uses existing reset action)
- **Main risk:** Slightly intrusive; could annoy users who are fine with the default
- **Unlocks:** First-time users discover they can personalize without hunting through a sidebar overflow

### Option C: Surface voice config status in the Aion sidebar header

- **What it is:** In the `AionSidebar` header area (near the existing "Tune Aion's voice" overflow item), show a small status chip: "Voice: configured" or "Voice: default." Clicking "configured" opens a read-only voice summary inline.
- **Effort:** Medium (needs a voice summary component + sidebar data flow)
- **Main risk:** Adds complexity to the sidebar header, which is already doing a lot
- **Unlocks:** Power users can quickly verify what Aion knows without leaving the chat surface

## Recommendation

**Option A.** Add the voice config panel to `/settings/aion`.

The settings page is the natural place for configuration visibility — that is what settings pages are for. Both server actions (`saveAionVoiceConfig`, `resetAionVoiceConfig`) are already written and have no side effects that would require new infrastructure. The component is roughly 60-80 lines: three labeled text areas for description, example, and guardrails, a save button, and a "reset to retune via chat" affordance.

This is the right move before B or C because it solves the underlying problem (no way to see what's stored) rather than just improving discoverability of the existing chat flow. Once users can read and edit their voice config directly, the distinction between "configured via chat" and "configured via form" disappears — they can use whichever surface they prefer.

Tradeoff accepted: the form is simpler than the chat onboarding (no example conversation, no chips). That is fine for an edit flow. New users still get the richer conversational onboarding.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — add a new `VoiceConfigSection` component below the card-beta block.
2. The section needs two server actions: `saveAionVoiceConfig` (already exists in `aion-config-actions.ts:178`) and `resetAionVoiceConfig` (already exists at line 214). Import them.
3. Read the current voice via `getAionConfig()` in the page's server component (`src/app/(dashboard)/settings/aion/page.tsx`) and pass it as a prop.
4. Render three labeled `<textarea>` fields for `description`, `example_message`, and `guardrails`. Wire the save button to `saveAionVoiceConfig`. Add a secondary "Reset (retune via chat)" link that calls `resetAionVoiceConfig` then redirects to `/aion`.
5. Add a guard: if `voice_default_derived === true`, show a notice above the fields — "Aion is using a synthesized default. Edit below to set your own voice."
6. `npm run build` to confirm the new page server component correctly passes the voice prop; `npm run test` to check nothing regressed.

## References

- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — aion_config column
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — AionConfig type + all server actions
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:226` — onboarding state machine
- `src/app/api/aion/chat/tools/core.ts:118` — save_voice_config tool
- `src/app/api/aion/lib/generate-draft.ts:63` — voice injection into drafts
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — target file for the new section
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:998` — existing "Tune Aion's voice" overflow button
