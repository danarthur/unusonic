# Aion Phase A: Minimum Path to Voice Setup + First Real Draft

_Researched: 2026-07-26 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

**The primer is significantly stale. Almost all of this infrastructure is already built.**

`public.workspaces.aion_config` exists. The column was added in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7` and is in the generated types at `src/types/supabase.ts:7782`. Server actions for reading and writing it are at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts`, including `getAionConfig` (line 84), `saveAionVoiceConfig` (line 178), and `resetAionVoiceConfig` (line 214).

The voice config shape is `{description, example_message, guardrails}` — exactly three fields mapping to the "3 paragraphs" Daniel described (`aion-config-actions.ts:12-16`).

The draft generation pipeline is complete. `/api/aion/draft-follow-up/route.ts` (73 lines) calls `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts`, which injects all three voice fields into the LLM prompt (`generate-draft.ts:63-75`). `getDealContextForAion` is fully implemented at `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545`. The follow-up card in the deal lens has a "Draft with Aion" button that calls the endpoint (`follow-up-card.tsx:338-370`).

The Aion chat itself is fully operational at `/aion`. The "Brain tab" label in the primer refers to a now-shipped feature; there is no paused component blocking anything.

**The one concrete gap:** Voice setup is bypassed by default. `applyVoiceDefaultIfEmpty` (`aion-config-helpers.ts:35`) synthesizes a generic workspace-name voice on every read when `voice?.description` is empty, marks `voice_default_derived: true`, and the chat route treats that as "configured" — skipping the 5-state onboarding machine entirely (`aion-chat-types.ts:248`). Daniel's only path back is "Tune Aion's voice" in the AionSidebar header overflow (`AionSidebar.tsx:1043`), which is buried and undiscoverable.

So drafts work. Voice respects the workspace name but not Daniel's actual style. The setup flow exists but is unreachable without knowing where to look.

## Intended state

Daniel opens the Aion page, sees a prominent "Set up your voice" prompt, writes three paragraphs (communication style, example message, rules), submits, and immediately sees a follow-up draft rendered using that exact voice — without navigating to a deal card or going through a multi-turn chat session.

The three voice fields map directly to what Daniel wants to write:
- `description` — how he communicates in general
- `example_message` — an actual message he'd send
- `guardrails` — things Aion should never do

All backend infrastructure is in place. The gap is UX: there is no surface that combines voice input + draft preview in a single session.

## The gap

- No dedicated voice setup form anywhere in the app
- "Tune Aion's voice" is buried in a sidebar overflow menu (three clicks deep, unlabeled icon)
- Default synthesis bypasses setup for all new workspaces — first-time users never see the intentional onboarding
- Draft preview on the follow-up card (the only place drafts surface) requires navigating to a specific deal, is not reachable from the Aion page
- No sample-context draft preview capability (you need a real deal to see a draft)

## Options

### Option A: Surface the existing chat onboarding flow

- **What it is:** Add an onboarding banner to the `/aion` page when `voice_default_derived === true` ("Your voice is using defaults — set it up"). Clicking it calls `resetAionVoiceConfig()` and the existing 5-state chat flow (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) takes over. No new backend work.
- **Effort:** Small (1–2 days, UI only)
- **Main risk:** The conversational flow is multi-turn and doesn't end with an immediate draft preview — Daniel still has to go to a deal card to see a draft. The UX remains split across two surfaces.
- **Unlocks:** Fast entry to existing onboarding for workspaces with the default synthesis; costs almost nothing.

### Option B: Dedicated voice setup form with inline draft preview

- **What it is:** A `VoiceSetupPanel` component (placed inside `AionSidebar` or as a page-level panel on `/aion`) with three `<textarea>` fields for `description`, `example_message`, and `guardrails`. On submit: calls `saveAionVoiceConfig()` then POSTs to `/api/aion/draft-follow-up` with either the user's most recent deal context (from `getDealContextForAion`) or a hardcoded sample context if no deals exist. Renders the draft inline below the form.
- **Effort:** Medium (3–4 days — new component, sample context helper, draft preview state)
- **Main risk:** Needs a sample deal context for the preview; pulling the user's latest deal is straightforward but adds one more server call. If no deals exist, a hardcoded template works but feels hollow.
- **Unlocks:** The exact UX described in the question. Voice setup and draft preview in a single session. No back-and-forth with the chatbot.

### Option C: Just-in-time modal in the follow-up card

- **What it is:** When "Draft with Aion" is clicked and `voice_default_derived === true`, intercept with a modal showing the three voice fields. Save them, then generate the draft immediately with that voice. Voice setup happens in context of the first real draft request.
- **Effort:** Medium (3–4 days — modal, save flow, state integration)
- **Main risk:** Interrupts the deal workflow at the worst moment. The user is trying to draft a follow-up; being asked to stop and configure their voice is a context switch that will feel like a blocker, not an upgrade.
- **Unlocks:** Voice is always set before the first draft; zero separate setup step needed.

## Recommendation

**Build Option B.** The infrastructure is all there — this is a UX assembly task. Option A (chat onboarding) is fragmented: voice setup happens across multiple turns, the draft preview is on a different page, and the experience feels exploratory rather than purposeful. Option C is contextually logical but interrupts real work at exactly the wrong moment.

Option B matches what Daniel described literally: open a place, write three things, see a draft. The `VoiceSetupPanel` needs three textareas, one save call (`saveAionVoiceConfig`), one draft call (`/api/aion/draft-follow-up`), and a context helper that fetches the user's most recent deal via `getDealContextForAion`. If no deals exist, use a hardcoded template with a placeholder client name.

The one genuine decision: where to place the panel. The AionSidebar is natural (it already imports `resetAionVoiceConfig` and has the overflow affordance); replace that overflow item with a full inline panel that expands inline when `voice_default_derived === true` and shows as a smaller "edit" affordance once configured. This keeps the panel in the same surface where voice is currently managed.

Accept the tradeoff: this does not involve the chat. Voice is configured directly, not conversationally. That's the right call for a setup task — chat works well for discovery, not for structured field entry.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupPanel.tsx` — three labeled textareas for `description`, `example_message`, `guardrails`, plus a save button and a draft preview zone below the form.
2. In `AionSidebar.tsx`, render `<VoiceSetupPanel>` expanded in the header area when `aionConfig.voice_default_derived === true`; collapsed into a small "Edit voice" link once configured.
3. Add `getSampleDealContext(workspaceId)` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — fetches the user's most recent deal via `getDealContextForAion`, or returns a hardcoded template if none exist.
4. On VoiceSetupPanel form submit: `await saveAionVoiceConfig(voice)` then `POST /api/aion/draft-follow-up` with the sample context; render the response draft inline.
5. Replace the "Tune Aion's voice" overflow menu item in `AionSidebar.tsx:1043` with a direct click-to-expand into the panel, removing the indirection through `resetAionVoiceConfig`.
6. Add a `voice_default_derived` read to `AionSidebar`'s data fetch so the panel auto-expands on first visit.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `saveAionVoiceConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247` — `getOnboardingState` 5-state machine
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` — `getDealContextForAion`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1043` — current "Tune Aion's voice" entry point
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:338` — "Draft with Aion" button
