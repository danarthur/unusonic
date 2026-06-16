# Aion Phase A: Minimum path to voice setup + first draft

_Researched: 2026-06-16 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: The primer's description of current state is partially stale (dated 2026-04-10). As of this run, `aion_config` already exists and the Aion chat at `/aion` is live. The "Brain tab paused" note no longer applies — there is no separate Brain tab; the full Aion page IS the experience. The premise of the question has partially self-resolved; the gap is narrower and different from what was assumed._

## Current state

**Schema — already done.** `aion_config JSONB NOT NULL DEFAULT '{}'` was added to `public.workspaces` in `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:6`. Three-field voice shape (`description`, `example_message`, `guardrails`) lives in `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16`.

**Server actions — already done.** `saveAionVoiceConfig()` (`aion-config-actions.ts:178`) and `getAionConfigForWorkspace()` (`aion-config-actions.ts:106`) are wired and correct. `resetAionVoiceConfig()` (`aion-config-actions.ts:214`) clears the stored voice and triggers re-onboarding.

**Draft generation — already done.** `POST /api/aion/draft-follow-up` reads `aion_config.voice`, passes it to `generateFollowUpDraft()` (`api/aion/lib/generate-draft.ts:25`), and injects it verbatim into the system prompt (`generate-draft.ts:63-74`). The Follow-Up Card on the deal page already has a "Draft a message" button calling this route (`follow-up-card.tsx:348`).

**Onboarding state machine — exists but bypassed.** A 5-state machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) is defined at `aion-chat-types.ts:225-257` and fed into the chat route's system prompt at `chat/route.ts:122,174`. However: `applyVoiceDefaultIfEmpty` in `aion-config-helpers.ts` synthesizes a generic default voice from the workspace name and sets `voice_default_derived = true` when the stored voice is empty. `getOnboardingState` short-circuits to `'configured'` when that flag is set (`aion-chat-types.ts:248`). The 4-step conversational setup **never fires** for a new workspace — it only fires after an owner manually clicks "Tune Aion's voice" in the sidebar settings (`AionSidebar.tsx:998-1012`), which calls `resetAionVoiceConfig()` to clear the flag.

**The gap summary:** No form UI exists to directly enter voice config. The only path is conversational (ask Aion to walk you through it), and even that is suppressed by the auto-derived default. If Daniel opens `/aion` today on a fresh workspace, he sees a normal greeting and no prompt to configure voice — ever.

## Intended state

Daniel opens the Aion page (or a lightweight voice setup sheet within it), pastes or types his communication style, an example message, and any guardrails. He hits save. He then clicks "Generate test draft" (or navigates to any deal's Follow-Up Card and clicks "Draft a message") and sees output that sounds like him.

The infrastructure is 100% wired — schema, actions, API, and draft UI all exist. The gap is purely a UI layer to let him write into those three fields directly.

## The gap

- No form/sheet in the Aion page for entering `description`, `example_message`, `guardrails`
- `voice_default_derived` suppresses the existing conversational onboarding for new workspaces
- No "test draft" affordance on the voice setup surface itself (Daniel must navigate to a deal after saving)

## Options

### Option A: Voice setup sheet in the Aion sidebar

- **What it is:** A slide-in sheet (or inline panel below `SidebarSettingsMenu`) with three labeled textareas. Save calls `saveAionVoiceConfig()`. An optional "Generate test draft" button at the bottom calls `/api/aion/draft-follow-up` with a stubbed `AionDealContext` (one fake deal, reason: "stall") to immediately show what Aion would write. The existing sidebar settings button in `AionSidebar.tsx:364` opens this instead of (or in addition to) the reset-only menu item.
- **Effort:** Small — no schema work, no new API routes. New TSX component + wiring to existing action and fetch.
- **Main risk:** Stub deal context in the test draft may look disconnected from reality. Daniel won't see his real follow-up logic until he goes to an actual deal.
- **Unlocks:** Daniel can configure voice in under 5 minutes and see a representative draft immediately.

### Option B: Remove `voice_default_derived` auto-bypass; let chat onboarding fire

- **What it is:** Modify `applyVoiceDefaultIfEmpty` in `aion-config-helpers.ts` to NOT synthesize a default or set `voice_default_derived`. New workspaces land in `no_voice` state; the chat route's greeting (`buildGreeting()` at `chat/route.ts:126`) guides them through the 4-step sequence conversationally. Daniel types his paragraphs as chat messages; Aion extracts and saves via `updateAionConfigForWorkspace()`.
- **Effort:** Small to change the bypass logic; medium to verify the 4-step chat flow actually works end-to-end (it was designed but may not be fully implemented in `buildGreeting`).
- **Main risk:** Forces all new users through Q&A before they can use any other Aion feature. Cannot paste a block of text — each field is one conversational turn. High friction.
- **Unlocks:** Voice setup stays in-product without any new UI surface.

### Option C: Aion-extracted voice from free-form paste

- **What it is:** A form (same as Option A) with a single large textarea for free-form description. A "Let Aion extract" button calls the `/api/aion/chat` route with a special prompt asking Aion to parse the pasted text into `description`, `example_message`, and `guardrails` fields and return structured JSON. The UI previews the extracted values, Daniel confirms, save calls `saveAionVoiceConfig()`.
- **Effort:** Medium — requires a new API endpoint or special chat mode for structured extraction, plus extraction prompt engineering.
- **Main risk:** Adds LLM call latency to what should be a simple form save. Extraction can hallucinate or misinterpret.
- **Unlocks:** Best product experience if it works — natural input, structured storage.

## Recommendation

**Build Option A.** Daniel's stated goal is to write 3 paragraphs and see a draft — that is exactly a form with three fields. The server action, API route, and type definitions are already correct. The only work is a `VoiceSetupSheet` component (~120 lines) and wiring it to the sidebar settings button that already exists in `AionSidebar.tsx`.

The "test draft" within the sheet is worth including. Use a minimal stub `AionDealContext` with the workspace name and reason "stall" — enough for the prompt to demonstrate voice without needing a real deal. The Follow-Up Card's "Draft a message" button then serves as the real-world verification once Daniel has actual deals.

Option B's risk (blocking the general chat for all new users) is too high for what would be a partial UX improvement. Option C is the ideal end-state but adds complexity that isn't justified until the simple form has been validated.

## Next steps for Daniel

1. Create `src/app/(dashboard)/(features)/aion/components/VoiceSetupSheet.tsx` — three `<textarea>` fields bound to `AionVoiceConfig` fields, a Save button calling `saveAionVoiceConfig()`, and a "Generate test draft" button POSTing to `/api/aion/draft-follow-up` with a stub context.
2. Open `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:1014` — replace (or augment) `SidebarSettingsMenu`'s "Tune Aion's voice" `handleTuneVoice` callback to open the new sheet instead of calling `resetAionVoiceConfig()` directly. The reset should become a secondary action inside the sheet ("Clear and restart").
3. Pass the current `aionConfig.voice` (already read by `ChatInterface`) as an initial prop to the sheet so returning users see their saved values and can edit in place.
4. In `AionSidebar.tsx`, load current config with `getAionConfig()` (already a server action) to pre-populate the form — or lift it as a prop from `ChatInterface.tsx` which already has access.
5. Test: open `/aion`, click settings gear, enter voice fields, save, click "Generate test draft", verify output sounds like the description.
6. Verify the existing Follow-Up Card "Draft a message" on any deal now reflects the saved voice — no code change needed, the route already reads `aion_config.voice`.

## References

- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql:6` — `aion_config` column
- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12-16,178` — `AionVoiceConfig` type + `saveAionVoiceConfig()`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225-257` — `getOnboardingState()` state machine
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty()` (sets `voice_default_derived`)
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:982-1051` — `SidebarSettingsMenu` + "Tune Aion's voice" action
- `src/app/api/aion/draft-follow-up/route.ts:53-62` — reads voice, passes to generator
- `src/app/api/aion/lib/generate-draft.ts:63-74` — voice injected into system prompt
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:348` — "Draft a message" button (already calls draft API)
- `src/app/api/aion/chat/route.ts:108-122` — reads `aionConfig`, derives `onboardingState`
