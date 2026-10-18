# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-07-23 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The primer's "current notable state" is significantly out of date. As of the codebase at this run:

**`public.workspaces.aion_config` exists and is fully live.** `getAionConfig()` and `saveAionVoiceConfig()` in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:84,178` read/write a `voice: {description, example_message, guardrails}` JSONB object. New workspaces get a synthesized default voice derived from the workspace name (`applyVoiceDefaultIfEmpty` in `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:35`) — so the 4-step chat onboarding is silently bypassed for all new users.

**`/api/aion/draft-follow-up` is fully built.** `src/app/api/aion/draft-follow-up/route.ts:21` authenticates, tier-gates, loads `aion_config.voice`, and calls `generateFollowUpDraft()`. That function in `src/app/api/aion/lib/generate-draft.ts:52` injects `voice.description`, `voice.example_message`, and `voice.guardrails` into the system prompt.

**`getDealContextForAion()` exists.** `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:545` assembles deal + client + proposal + follow-up log into `AionDealContext` — exactly what the draft route expects.

**The "Brain tab" is now `/aion`.** `src/app/(dashboard)/aion/AionPageClient.tsx:66` renders `<ChatInterface>`. No separate Brain tab exists. The 4-step voice onboarding runs in-chat (states: `no_voice → no_example → no_guardrails → needs_test_draft → configured`) but only fires when `voice_default_derived` is NOT set — which it always is for new users.

**The NudgeComposer is manual-only.** `src/app/(dashboard)/(features)/events/components/aion-deal-card/nudge-composer.tsx:34` opens a blank textarea. There is no "Generate with Aion" button. Nothing in the UI calls `/api/aion/draft-follow-up`.

**learn-from-edit is built.** `src/app/api/aion/learn-from-edit/route.ts:25` extracts vocabulary patterns from edited drafts and persists them to `aion_config.learned` + `cortex.aion_memory`.

## Intended state

Daniel opens `/aion`, either the first-visit form or the sidebar overflow "Tune Aion's voice" (currently reached via `resetAionVoiceConfig()` in `aion-config-actions.ts:214`), writes one paragraph each for voice description, example message, and guardrails, saves — then opens any deal with a follow-up card, clicks "Draft nudge," and sees an AI-generated draft that reflects what he just wrote. Editing the draft fires `learn-from-edit` to refine the voice over time.

## The gap

- **Voice setup has no standalone form.** The only explicit path is the 4-step chat sequence, which new users never see (synthesized default bypasses it). The sidebar overflow "Tune Aion's voice" resets the config and sends the user back into chat — useful for retuning, not first-time setup.
- **NudgeComposer does not call the draft API.** The backend is ready; the frontend does not wire to it. When a user clicks "Draft nudge," they get a blank textarea, not an AI draft.
- **Voice quality for most users is the workspace-name default.** Until the user explicitly tunes their voice, all drafts use the generic synthesized preamble.

## Options

### Option A: Wire NudgeComposer to the draft API only

- **What it is:** Add a "Generate draft" button to `NudgeComposer` that calls `/api/aion/draft-follow-up` with the deal's `AionDealContext` (already assembled by `getDealContextForAion`). Pre-fill the textarea with the returned draft. User can edit and log. Learn-from-edit fires on submission.
- **Effort:** Small — ~50 lines across `nudge-composer.tsx` and one new client-side fetch call.
- **Main risk:** Voice quality is limited to the synthesized workspace-name default for most users. Daniel sees a draft immediately but it won't sound like him until he configures voice.
- **Unlocks:** Proves the full loop works (queue item → draft → log → learn). Can ship in a day.

### Option B: VoiceSetupForm + wired NudgeComposer

- **What it is:** Add a `VoiceSetupForm` component (three `<textarea>` fields: voice description, example message, guardrails) to `/settings/aion` or the `/aion` landing page. On submit, call `saveAionVoiceConfig`. Then apply Option A's NudgeComposer wire. End-to-end: Daniel opens the form, writes three paragraphs, saves, opens a deal, clicks "Draft nudge," sees a voice-aware AI draft.
- **Effort:** Medium — new form component (~120 lines), minor page integration, plus Option A's NudgeComposer change.
- **Main risk:** Form discovery. If buried in `/settings/aion`, Daniel has to know to go there first. The "Tune Aion's voice" sidebar overflow in `/aion` is a better insertion point: clicking it could open the form instead of just resetting to chat.
- **Unlocks:** The full intended experience. Voice config is visible and editable outside chat.

### Option C: In-chat voice setup gated on the deal card

- **What it is:** When a user with `voice_default_derived=true` clicks "Draft nudge," show a "Set up your voice first" callout that links to `/aion` and triggers the 4-step chat flow. After the flow completes, they return to the deal.
- **Effort:** Medium — requires the deal card to know the user's onboarding state (one server action call), plus a callout component, plus the handoff back to the deal page.
- **Main risk:** Context-switching. Sending someone from the deal card to a chat and back is jarring. The 4-step chat flow also fragments what should be a single 3-paragraph mental model into sequential Q&A.
- **Unlocks:** Reuses the existing chat infrastructure exactly as designed in §26. No new form component needed.

## Recommendation

**Option B.** The backend is done. The gap is entirely in the UI: a form for voice input and a button that calls the draft API. Option A ships faster but leaves the voice quality problem unaddressed — Daniel would get drafts that don't sound like him, which is worse than no draft. Option C avoids building a form but creates a bad UX; the 4-step chat flow was designed as an onboarding assistant, not a settings panel.

For the form, put it in the Aion sidebar header via the existing `SidebarSettingsMenu` in `AionSidebar.tsx:982`. "Tune Aion's voice" should open a slide-out form panel instead of just calling `resetAionVoiceConfig` and sending the user to chat. This is one file change (sidebar) + one new component (the form) + the NudgeComposer wire.

Accept that the synthesized default voice is fine as a fallback — the form is for first-time explicit tuning and ongoing edits. The `voice_default_derived` flag correctly signals "not explicitly configured" so you can show an "Add your voice" nudge on first open.

## Next steps for Daniel

1. **Add `VoiceSetupForm` component** at `src/app/(dashboard)/(features)/aion/components/VoiceSetupForm.tsx` — three labeled textareas (voice description, example message, guardrails), a save button that calls `saveAionVoiceConfig`, and a cancel. ~120 lines.
2. **Replace "Tune Aion's voice" handler** in `AionSidebar.tsx:998` — instead of calling `resetAionVoiceConfig` and toasting, open the `VoiceSetupForm` in a panel/modal. Pre-populate with the current `getAionConfig()` values so editing feels natural.
3. **Add a "first-time" nudge** to the Aion chat landing when `voice_default_derived === true` — e.g., a one-line chip below the greeting: "Using default voice — tune it to sound like you."
4. **Add "Generate draft" to NudgeComposer** in `nudge-composer.tsx:33` — fetch button that calls `getDealContextForAion` then POSTs to `/api/aion/draft-follow-up`. Pre-fill the textarea with the result. Add a "Regenerate" affordance.
5. **Wire learn-from-edit** on NudgeComposer submit — if the user edits the AI draft before logging, POST to `/api/aion/learn-from-edit` fire-and-forget.
6. **Smoke test the full loop** — open `/aion`, tune voice, open a deal with a follow-up queue item, click "Draft nudge," confirm the draft reflects the voice you wrote.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig` type, `saveAionVoiceConfig`, `getAionConfig`, `resetAionVoiceConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `synthesizeDefaultVoice`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225` — `OnboardingState`, `getOnboardingState`
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982` — `SidebarSettingsMenu`, "Tune Aion's voice" handler
- `src/app/api/aion/draft-follow-up/route.ts` — fully functional draft route
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/(features)/events/components/aion-deal-card/nudge-composer.tsx` — the manual-only composer to extend
- `src/app/(dashboard)/(features)/events/actions/follow-up-actions.ts:509` — `AionDealContext`, `getDealContextForAion`
- `src/app/api/aion/learn-from-edit/route.ts` — vocabulary learning from draft edits
