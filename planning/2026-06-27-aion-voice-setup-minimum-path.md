# Aion voice setup: minimum path to first real draft

_Researched: 2026-06-27 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How I understood it:** The primer's framing of the Brain tab and aion_config is outdated. I've re-scoped this as: what is the minimum path for Daniel to explicitly set his communication style and immediately see a voice-matched follow-up draft?

## Current state

**The primer is significantly outdated.** The actual codebase is much further along than the context suggests.

- `public.workspaces.aion_config` **already exists** as a JSONB column. `getAionConfig()` reads it directly via Supabase's typed client at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:94`.
- `saveAionVoiceConfig(voice)` **already exists** and writes `{description, example_message, guardrails}` to that column (`aion-config-actions.ts:178`). This is the correct write path.
- `/api/aion/draft-follow-up/route.ts` **is live and fully wired**: auth gate, tier gate, kill switch, voice config injection, and draft generation all complete (`draft-follow-up/route.ts:1–73`).
- `generateFollowUpDraft()` **already injects voice config** into the system prompt — `voice.description`, `voice.example_message`, and `voice.guardrails` all land in the model prompt when set (`src/app/api/aion/lib/generate-draft.ts:62–74`).
- The Follow-Up Card in the Deal Lens **already calls** `/api/aion/draft-follow-up` and renders the result (`src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:348`).
- The Aion chat at `/aion` (labeled "Nodes" in the nav at `src/shared/ui/layout/Shell.tsx:16`) is fully functional with tool use, streaming, sidebar, and session management. `ChatInterface.tsx` is not "unwired."
- A 5-state onboarding machine exists: `no_voice → no_example → no_guardrails → needs_test_draft → configured` (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`). The chat route uses this state to potentially force a 4-step voice setup conversation.

**The bypass that defeats the onboarding flow:** `applyVoiceDefaultIfEmpty()` synthesizes a generic voice from the workspace name whenever the DB has no explicit voice stored. It sets `voice_default_derived: true` on the in-memory config (`src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts:43`). `getOnboardingState()` checks this flag first and immediately returns `'configured'` (`aion-chat-types.ts:248`). Result: every workspace starts as `'configured'` so the 4-step forcing block **never fires** and there is no user-facing prompt to enter voice preferences.

**The settings page gap:** `/settings/aion` contains only the Aion card beta consent toggle and cadence learning opt-in. No voice setup form exists (`src/app/(dashboard)/settings/aion/AionSettingsView.tsx:90`). The only affordance to enter explicit voice is the Sidebar overflow → "Tune Aion's voice," which calls `resetAionVoiceConfig()` and then expects the user to type their style into the chat.

## Intended state

Daniel opens the Aion tab, clicks something obvious, writes 3 paragraphs about how he communicates with clients, hits save, and immediately sees a draft follow-up generated against his most recent deal using that voice. The draft validates that the voice settings are working. From that point forward, every Follow-Up Card draft in the Deal Lens respects the saved voice.

## The gap

- No form UI to enter `voice.description`, `voice.example_message`, `voice.guardrails` directly
- `needs_test_draft` onboarding state has no UI trigger — the test draft can only appear by navigating to a specific deal
- New workspaces bypass the 4-step chat onboarding entirely via `voice_default_derived`
- `/settings/aion` has no voice section

## Options

### Option A: Voice setup form in `/settings/aion`
- **What it is:** Add a `VoiceSetupSection` client component to `AionSettingsView.tsx` with three `<textarea>` fields for description, example message, and guardrails. On save, call `saveAionVoiceConfig()`. Post-save: fetch the workspace's most recent deal, call `/api/aion/draft-follow-up`, and render the result inline as a test.
- **Effort:** Medium — one new component (~150 lines), a small server action to fetch the most recent deal for test-draft context, and a stitch into the existing settings page.
- **Main risk:** Settings is a cold path; owners may not find voice setup naturally. Also, the "3 paragraphs" maps cleanly to `voice.description`, but the example message and guardrails fields need good placeholder copy to be self-explanatory.
- **Unlocks:** Every subsequent Follow-Up Card draft in the Deal Lens personalizes immediately. The test draft closes the loop within the same page visit.

### Option B: Voice setup panel inline on `/aion`
- **What it is:** When `voice_default_derived === true`, show a dismissable nudge card at the top of the Aion landing state. Expanding it reveals the three fields inline in the chat surface, styled as a `stage-panel`. Save clears the derived flag; the draft result appears as an Aion message in the chat.
- **Effort:** Medium-large — needs new UI mounted in `ChatInterface.tsx` or `AionPageClient.tsx`, careful integration with `SessionContext` to inject the test-draft result as an assistant message, and handling the dismiss/expand state.
- **Main risk:** The chat surface is complex and the panel would need portal/z-index discipline. The "draft as assistant message" approach is tricky because the draft channel requires a deal context.
- **Unlocks:** Same as Option A, but in the primary Aion surface. Better discoverability for owners who live in `/aion`.

### Option C: Remove the `voice_default_derived` bypass
- **What it is:** Stop calling `synthesizeDefaultVoice` for workspaces with no stored voice. Let `getOnboardingState` return `'no_voice'` for new workspaces, triggering the existing 4-step chat conversation.
- **Effort:** Small — delete 2 lines in `aion-config-helpers.ts` and update `getOnboardingState`.
- **Main risk:** The chat onboarding collects voice through conversation, which is indirect. The `needs_test_draft` state (step 4) still has no test-draft UI wired, so the flow reaches a dead end. The conversational "write 3 paragraphs in a chat" UX doesn't match Daniel's described goal of a focused form. Risk of regressing new-user experience.
- **Unlocks:** The existing chat forcing block starts collecting voice — but without the test-draft wiring it's incomplete.

## Recommendation

**Option A.** The data pipeline is fully assembled: schema exists, write action exists, draft generation is live, voice is already injected into every draft. This is a pure UI gap. Option A fills it with a focused, self-explanatory form that matches exactly what Daniel described.

Option B has better discoverability but requires deeper surgery into `ChatInterface`. Option C is the smallest code change but produces the worst UX and leaves `needs_test_draft` unwired.

The only design decision is how to handle the test-draft deal selection. The simplest approach: fetch `public.deals` ordered by `updated_at DESC LIMIT 1` for the workspace, pass it through `getDealContextForAion()`, and call the existing draft endpoint. If no deals exist, skip the test draft with a note.

Scope for the initial build: the three fields + save + test draft panel. Kill the `voice_default_derived` bypass only after the form ships, so owners who already synthesized a default can see the form populated with it as a starting point rather than empty.

## Next steps for Daniel

1. Create `src/app/(dashboard)/settings/aion/VoiceSetupSection.tsx` — client component with three `<textarea>` fields, `useTransition` + `saveAionVoiceConfig()` for the save action, and a test-draft panel below that calls `/api/aion/draft-follow-up` after save.
2. Add a server action in `src/app/(dashboard)/settings/aion/` (or in `aion-config-actions.ts`) that fetches the workspace's most recent deal and calls `getDealContextForAion()` — this becomes the test-draft context source.
3. Mount `<VoiceSetupSection />` in `AionSettingsView.tsx` above the Cadence Learning section, visible to all owners/admins regardless of card beta status.
4. Pre-populate the form fields from `state.aionConfig.voice` (load it server-side alongside `getWorkspaceFeatureState`) so existing derived defaults appear editable, not blank.
5. After the form ships, remove the `applyVoiceDefaultIfEmpty` bypass so explicit setup becomes the primary path for new workspaces.
6. Verify end-to-end: save voice → test draft appears → navigate to a Deal Lens → click Follow-Up Card generate → draft matches the saved voice.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `saveAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, `OnboardingState`
- `src/app/api/aion/draft-follow-up/route.ts` — draft endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, voice injection
- `src/app/(dashboard)/(features)/events/components/follow-up-card.tsx:348` — existing draft call pattern
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page to extend
