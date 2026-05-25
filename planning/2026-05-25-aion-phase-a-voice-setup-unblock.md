# Aion Phase A: minimum path to voice setup + first real draft

_Researched: 2026-05-25 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer notes are outdated. More has landed than described.

**`aion_config` exists and is wired end-to-end.** `public.workspaces.aion_config` is a `Json` column in the generated types (`src/types/supabase.ts:7689`). The `AionConfig` type and its nested `AionVoiceConfig { description, example_message, guardrails }` are defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16`. The server action `saveAionVoiceConfig(voice)` (`aion-config-actions.ts:178`) merges a voice object into the config and revalidates `/aion`. A deep-merge variant `updateAionConfigForWorkspace()` (`aion-config-actions.ts:262`) exists for API routes.

**The chat route reads and uses voice config.** `src/app/api/aion/chat/route.ts` calls `getAionConfigForWorkspace(workspaceId)` and passes the result to `buildSystemPrompt()`. That function injects the voice at `src/app/api/aion/chat/route/prompts.ts:88-91`: voice description, example message existence, and guardrails all flow into the system prompt. If voice is unset, it falls back to "clear, professional production-management register."

**The chat and draft infrastructure is live.** `ChatInterface.tsx`, `AionInput.tsx`, and `AionVoice.tsx` are all wired and functional. The `/api/aion/draft-follow-up` endpoint and `getDealContextForAion()` (`src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`) are fully implemented and used by chat tools.

**The `voice_default_derived` bypass.** When voice is absent, `applyVoiceDefaultIfEmpty()` (`aion-config-actions.ts:6`) synthesizes a default from the workspace name and sets `voice_default_derived: true`. The comment (`aion-config-actions.ts:68-72`) says this causes the chat route to skip a 4-step voice-tuning forcing block. A `resetAionVoiceConfig()` action exists (`aion-config-actions.ts:214`) to re-enable that flow; its comment says it is "surfaced as 'Tune Aion's voice' in the AionSidebar header overflow" — but no such button was found in `AionSettingsView.tsx`.

**The gap in the UI.** `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` renders: a beta consent toggle, `CadenceLearningToggle`, memory backfill, and pending access requests. There is no form for `voice.description`, `voice.example_message`, or `voice.guardrails`. The `saveAionVoiceConfig()` action has no UI caller anywhere in the codebase.

## Intended state

Daniel opens the Aion page, fills in how he writes to clients (description, an example message, and any guardrails), saves, and immediately sees a follow-up draft generated using that voice. The chat system then applies the voice to every subsequent draft and message.

## The gap

- No UI form surfaces `saveAionVoiceConfig()` — the action exists but has zero callers.
- `resetAionVoiceConfig()` has no UI button; the 4-step in-chat forcing flow it is supposed to trigger has never been surfaced.
- New workspaces get `voice_default_derived: true` automatically, permanently bypassing the in-chat tuning flow without the user ever knowing it exists.
- No "immediate draft preview" moment anywhere — the voice-to-draft feedback loop requires navigating to chat and typing a prompt manually.

## Options

### Option A: Voice form in /settings/aion

- **What it is:** Add three textarea fields (description, example message, guardrails) to `AionSettingsView.tsx`, wired to `saveAionVoiceConfig()`. After save, a success toast and a "Try it — ask Aion to draft a follow-up" deep-link to the chat.
- **Effort:** Small — one component file, zero new server actions, zero schema changes.
- **Main risk:** The draft feedback loop is still a manual step (navigate to chat, type a prompt). The "immediately see a draft" goal is soft-met, not tight.
- **Unlocks:** Voice is stored and used in all subsequent chats and proactive card drafts. `voice_default_derived` is cleared on save so the config is treated as explicitly set.

### Option B: Surface the in-chat voice tuning flow

- **What it is:** Add "Tune Aion's voice" to the AionSidebar header overflow (as the comment at `aion-config-actions.ts:68` already calls for). Clicking it calls `resetAionVoiceConfig()`, then navigates to a fresh chat. The chat's 4-step forcing block walks Daniel through describing his voice, confirms what it learned, and — once voice is saved — immediately generates a sample follow-up draft inside the same thread.
- **Effort:** Medium — need to verify the 4-step forcing block in the chat route is fully implemented (it may only be partial), add the sidebar overflow button, and confirm the draft step at the end of the onboarding sequence.
- **Main risk:** If the 4-step block is only partially implemented, this becomes a larger dig. The risk is discovering mid-implementation that the chat-side onboarding needs more work than a button.
- **Unlocks:** The exact UX Daniel described — one surface, write voice, see draft — and no settings page navigation required.

### Option C: Dedicated /aion/setup page with form + live draft preview

- **What it is:** A new route `/aion/setup` (or a sheet/modal off the Aion page) with a two-panel layout: left panel has the three voice fields, right panel renders a live Aion-generated draft for Daniel's most recent active deal the moment he clicks "Preview."
- **Effort:** Medium — new route, new server component to fetch the active deal for seeding the preview, client component for the preview panel, one new API call.
- **Main risk:** Requires at least one deal with a follow-up queue item to generate a meaningful preview. Empty workspaces get a generic draft, which is less compelling.
- **Unlocks:** The tightest version of the intended experience, and a natural onboarding surface for new workspaces.

## Recommendation

**Start with Option A, treat Option B as the immediate next step.** The only reason the voice-to-draft loop doesn't work today is that `saveAionVoiceConfig()` has no caller. Adding the form to `AionSettingsView.tsx` unblocks Daniel in under a day and proves the full pipeline (voice saved → chat reads it → draft uses it) before spending time on the in-chat onboarding flow. Once you confirm end-to-end that the system prompt change actually changes the draft output, pivot to Option B: add the sidebar "Tune Aion's voice" button and verify the 4-step forcing block. Option C is the polished version worth building later — but Option A + B deliver the core value with less risk of hitting an unfinished code path mid-sprint.

The `voice_default_derived` bypass is the subtle bug here: new workspaces silently get a synthesized default and the tuning flow is never offered. Option A fixes the data side; Option B fixes the UX side.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` and add a voice form section below the cadence toggle: three `<textarea>` fields for "How you talk to clients" (description), "A real message you've sent" (example\_message), and "What to avoid" (guardrails). Wire the form's submit handler to `saveAionVoiceConfig()` from `aion-config-actions.ts:178`.
2. After saving, test end-to-end: open Aion chat, type "draft a follow-up for [a real deal name]," confirm the draft matches the voice you entered. Check the system prompt log if the voice isn't reflected.
3. Open `src/app/api/aion/chat/route.ts` and confirm the 4-step forcing block exists and is complete — search for `onboarding_state` or `voice_default_derived` in the route file to find where the block fires.
4. If step 3 confirms the block is complete, add a "Tune Aion's voice" button to the AionSidebar header overflow. The click handler should call `resetAionVoiceConfig()` then `router.push('/aion')`.
5. Verify the end of the 4-step block auto-generates a draft follow-up. If not, add a tool call at the final onboarding step that calls `draft_follow_up` with the most recent `follow_up_queue` item.
6. Once both paths work, delete the call to `applyVoiceDefaultIfEmpty` from `getAionConfig()` (or make it opt-in only) so new workspaces land in the explicit tuning flow rather than the silent default.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`, `voice_default_derived` logic
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/api/aion/chat/route/prompts.ts:88-91` — voice injected into system prompt
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings UI (no voice form)
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/types/supabase.ts:7689` — `aion_config` column type
