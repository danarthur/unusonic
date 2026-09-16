# Aion Phase A: Unblocking Voice Setup and First Real Draft

_Researched: 2026-09-16 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: the queue context was based on the 2026-04-10 primer snapshot. The codebase has moved forward significantly since then — the assumptions in the question are no longer accurate. The actual gap is smaller. See current state below._

## Current state

**`aion_config` exists and is wired end-to-end.** The column `aion_config jsonb NOT NULL DEFAULT '{}'::jsonb` lives on `public.workspaces` (migration `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:7`; also in baseline schema at `supabase/migrations/20260101000000_baseline_schema.sql:15058`).

The `AionConfig` type is defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74`. Voice sits in a sub-object: `voice: { description, example_message, guardrails }`. Full read/write infrastructure is live:
- `getAionConfig()` / `getAionConfigForWorkspace()` — `aion-config-actions.ts:84–120`
- `saveAionVoiceConfig(voice)` — `aion-config-actions.ts:178–206`, writes to DB, revalidates `/aion`
- `resetAionVoiceConfig()` — `aion-config-actions.ts:214–256`, clears stored voice, re-enters onboarding flow
- Auto-synthesis: when `voice.description` is empty, `applyVoiceDefaultIfEmpty()` (`aion-config-helpers.ts:35–44`) synthesizes a sensible default from the workspace name — this happens on every read, never written to disk

The draft pipeline is fully functional: `POST /api/aion/draft-follow-up` (`src/app/api/aion/draft-follow-up/route.ts:21–73`) → `generateFollowUpDraft()` (`src/app/api/aion/lib/generate-draft.ts:25–46`) → `buildFollowUpPrompt()` (`generate-draft.ts:52–137`), which injects `voice.description`, `voice.example_message`, and `voice.guardrails` directly into the system prompt. The "Draft a message" button in `follow-up-card.tsx:348` already fires this route.

**What's missing: there is no voice setup form.** The Aion settings page at `/settings/aion` (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx`) shows only the Aion card beta consent flow and the cadence learning toggle. No UI surface lets Daniel read or write `aion_config.voice`. The "Brain tab" mentioned in the queue does not exist — it appears once as a JSDoc concept in `CadenceLearningToggle.tsx:14`.

The `/api/aion/chat/route.ts` (465 lines) is a fully-implemented streaming chat route — not a stub. The `AionInput.tsx`, `AionVoice.tsx`, and `ChatInterface.tsx` components are all live and wired.

## Intended state

Daniel opens an Aion settings surface, writes 3 paragraphs about how he talks to clients (maps to the three `AionVoiceConfig` fields), saves, then opens any deal with a queue item and clicks "Draft a message" — the draft reflects his voice immediately. No new DB columns or migrations are needed. No chat onboarding flow changes are needed.

## The gap

- No form exists to read or write `aion_config.voice` fields (`description`, `example_message`, `guardrails`)
- `/settings/aion` page has no voice configuration section
- No "Brain tab" page exists (not needed for Phase A — settings is the right surface)
- Daniel has no way to know what his current synthesized default voice says (it's computed silently on read)

## Options

### Option A: Add voice form section to `/settings/aion`

- **What it is:** Add a StagePanel section to `AionSettingsView.tsx` with three textareas — tone description, example message, guardrails — pre-filled with the current config (synthesized default or saved). Wire the save button to `saveAionVoiceConfig()` using the existing `useTransition` + `toast` pattern already in that file.
- **Effort:** Small — backend is complete. One component edit, roughly 80–100 lines of UI.
- **Main risk:** The settings page is server-rendered; it needs to pass the current config as a prop from the `page.tsx` server component. Low risk — same pattern as `state` and `pendingRequests` already passed to `AionSettingsView`.
- **Unlocks:** Daniel can write 3 paragraphs immediately and test them via the draft button in any deal with a queue item. End-to-end loop is closed.

### Option B: Wire voice setup into the Aion chat onboarding flow

- **What it is:** The chat route already references `onboarding_state` in `aion-config-actions.ts:54`. Activate the 4-step forcing block (currently skipped because `voice_default_derived = true`) to collect voice conversationally: Aion asks Daniel about his communication style, then distills answers into `AionVoiceConfig` and saves via `updateAionConfigForWorkspace`.
- **Effort:** Medium — requires reading and editing the chat route's onboarding state machine, adding extraction prompt logic, and wiring the save.
- **Main risk:** Conversational extraction is harder to test, easier to get wrong. Daniel has to know to open the chat rather than settings.
- **Unlocks:** More natural onboarding; Aion explains what voice config is before asking. Good for Phase B.

### Option C: Dedicated `/settings/aion/voice` page with live draft preview

- **What it is:** New route with a focused 3-field form plus a "Preview draft" button that fires `draft-follow-up` against a synthetic demo context and renders the result inline.
- **Effort:** Medium — new page, new nav entry, more UI surface.
- **Main risk:** Adds a route and nav item. Preview needs a synthetic `AionDealContext` fixture which is slightly fiddly to construct.
- **Unlocks:** Cleanest long-term experience; the preview removes guesswork about whether voice changes are working.

## Recommendation

Ship Option A. The entire backend — column, types, server actions, draft generation, prompt injection — is production-ready. The only thing blocking the end-to-end loop is a form. Adding the voice section to `AionSettingsView.tsx` is a focused, low-risk change that closes the loop without any migration or new routing. Daniel can write 3 paragraphs today and see the effect on the next draft.

Option C's live preview is the right evolution once the form is in place — it's worth a follow-up card in the queue after Option A ships. Option B (conversational setup) is worth revisiting for onboarding new workspaces, but it's a Phase B concern and adds complexity before the feature has had its first real use.

One thing to preserve: show the synthesized default in the form as initial values, not as placeholder text. Daniel should see what Aion is already using so he knows what he's refining, not replacing from scratch.

## Next steps for Daniel

1. In `src/app/(dashboard)/settings/aion/page.tsx` (server component), call `getAionConfig()` and pass `aionConfig.voice ?? null` as a prop to `AionSettingsView`.
2. Add a `voiceConfig` prop to `AionSettingsView` and add a `VoiceSetupSection` StagePanel below the cadence toggle — three `<textarea>` fields (description, example_message, guardrails) initialized from the prop.
3. Wire the save button to `saveAionVoiceConfig(voice)` using the existing `useTransition` pattern (see lines 50–88 in `AionSettingsView.tsx`).
4. Optionally: surface the synthesized-default state with a subtle label ("Currently using auto-generated voice — customize below") when `aion_config.voice_default_derived === true`.
5. Test end-to-end: fill in the form → navigate to any deal with a queue item → click "Draft a message" → confirm the draft reflects the new voice.
6. (Follow-up queue card) Add Option C's live draft preview as the next Phase A enhancement.

## References

- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — current settings page; voice section goes here
- `src/app/(dashboard)/settings/aion/page.tsx` — server component that hydrates `AionSettingsView`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–206` — all voice types and server actions
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt`, shows exactly how voice fields are injected
- `src/app/api/aion/draft-follow-up/route.ts` — the endpoint "Draft a message" hits
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:348` — the "Draft a message" button
