# Aion Phase A: minimum path to voice setup + first real draft

_Researched: 2026-09-21 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

_Note: both premises in the queue item are outdated. `aion_config` exists and is wired. There is no "Brain tab" as a rendered UI surface — but `/settings/aion` is the functional equivalent. The question is re-read as: what's the minimum path to give a voice form that writes to `aion_config.voice` and immediately produces a voice-respecting draft?_

## Current state

**Voice config storage** — `public.workspaces.aion_config` is live and typed. `AionConfig.voice?: AionVoiceConfig` holds `{ description, example_message, guardrails }` (`aion-config-actions.ts:12–16`). The column is confirmed in the generated types at `src/types/supabase.ts:7895`.

**Server Actions** — `saveAionVoiceConfig(voice)` at `aion-config-actions.ts:178` reads the current config, merges, writes to `workspaces` via the server client, and calls `revalidatePath`. `getAionConfig()` at `aion-config-actions.ts:84` reads and applies a synthesized default if voice is empty.

**Draft pipeline** — `/api/aion/draft-follow-up/route.ts:52–68` is authenticated (401 on no user), tier-gated, kill-switch-gated, and calls `generateFollowUpDraft({ context, voice: aionConfig.voice ?? null })`. `generate-draft.ts:52` builds a system prompt that injects `voice.description`, `voice.example_message`, and `voice.guardrails` when present.

**Existing settings page** — `/settings/aion/AionSettingsView.tsx` exists and already renders `CadenceLearningToggle` (line 204) and `MemoryBackfillSection`. It loads `getAionConfig()` server-side. No voice form exists here.

**What doesn't exist** — there is no UI anywhere in the dashboard for entering voice config. Auth onboarding (`onboarding-wizard.tsx`) does not capture voice. "Brain tab" is mentioned only as a hypothetical in a comment at `CadenceLearningToggle.tsx:14`. The `/aion` page is a full chat interface, not a setup surface.

**Model note** — `generate-draft.ts` currently uses `getModel('fast')` which routes to `claude-haiku-4-5-20251001` (a temp override set 2026-04-21 per `models.ts:69–73`). The draft will work but quality is ceiling-limited by Haiku until the override is removed.

## Intended state

Daniel opens `/settings/aion`, writes three text blocks (how he writes, an example message he'd actually send, hard rules), hits save, then triggers a test draft from a live deal. The draft reflects his style. The voice config persists across sessions and is injected into every subsequent follow-up draft workspace-wide.

## The gap

- No voice setup form component
- No "test draft" affordance to see the voice config in action immediately after saving
- Model temp-override (Haiku) caps draft quality regardless of voice config

## Options

### Option A: Voice form in `/settings/aion`
- **What it is:** Add a `VoiceSetupSection` component to `AionSettingsView.tsx` — three `<textarea>` fields (description, example message, guardrails) pre-populated from `getAionConfig()`, a save button calling `saveAionVoiceConfig`. Add a "Test with most-recent deal" button that hits `/api/aion/draft-follow-up` and surfaces the result inline.
- **Effort:** Small (one new component, one file edit, one fetch call in a client component)
- **Main risk:** Settings page is already long; needs section ordering thought. No new risk to the draft pipeline itself.
- **Unlocks:** Daniel can set voice today. Every follow-up draft immediately improves. Can iterate on the form without touching the chat or pipeline.

### Option B: In-chat guided setup in `ChatInterface`
- **What it is:** Detect `!aion_config.voice` in `ChatInterface.tsx`, show a three-step inline prompt sequence (Aion asks each question, Daniel responds, responses are saved to `voice.description / example_message / guardrails` progressively). Uses the existing `AionOnboardingShell` layout for polish.
- **Effort:** Medium (chat route must parse structured responses, session state for onboarding step tracking, `onboarding_state` transitions)
- **Main risk:** Adds a conditional branch to the chat route and session context; regression surface for existing chat users. `onboarding_state` field exists in the config type but is unused.
- **Unlocks:** A more fluid UX — feels like Aion is onboarding you. Good for new workspaces.

### Option C: Dedicated brain panel at `/aion?tab=brain`
- **What it is:** Add a "Brain" tab to the `/aion` page (alongside the chat) containing the voice form, cadence toggle (move it from settings), and a live draft preview column. New route segment or URL param with conditional rendering inside `AionPageClient.tsx`.
- **Effort:** Large (new layout, tab navigation state, moving CadenceLearningToggle, draft preview streaming)
- **Main risk:** Scope creep. Most of the value is the voice form, which is small; wrapping it in a tab system adds weeks of UI work.
- **Unlocks:** The full "Brain" concept Daniel described. Appropriate once voice is validated.

## Recommendation

**Ship Option A first.** The settings/aion page is the right home — it already has the cadence toggle and memory backfill, making it the de-facto Aion config surface. Adding a three-field voice form there requires one new component and a trivial edit to `AionSettingsView.tsx`. The entire draft pipeline already works; this is literally just the front door.

The tradeoff you're accepting: it's a settings page, not a "Brain" experience. That's fine — validate that voice config actually improves drafts before investing in a richer UX. Option B's conversational onboarding is attractive but adds real complexity to the chat route; defer until the voice-to-draft feedback loop is proven. Option C should absorb the Option A component when you do build the Brain tab.

One other thing to fix alongside: remove the Haiku temp override in `models.ts:69–73`. If the API key issue is resolved, upgrade `getModel('fast')` for draft generation — voice config improves draft quality only as much as the model can use it.

## Next steps for Daniel

1. Read `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` to understand current structure and where to insert the form.
2. Create `src/app/(dashboard)/settings/aion/VoiceSetupSection.tsx` — three textareas (`description`, `example_message`, `guardrails`), save button calling `saveAionVoiceConfig`. Pre-populate from props (parent already calls `getAionConfig()`).
3. Add `VoiceSetupSection` to `AionSettingsView.tsx` above `CadenceLearningToggle`, passing `initialVoice={config.voice}`.
4. Add a "Test draft" button in `VoiceSetupSection` that calls `/api/aion/draft-follow-up` with a hard-coded recent deal context (or accept a `dealId` prop). Display the result inline.
5. Check `src/app/api/aion/lib/models.ts:69–73` — if the API key limitation is resolved, remove the Haiku override for `'fast'` to restore Sonnet-quality drafts.
6. Smoke-test end to end: fill the form, save, trigger test draft, confirm voice description appears in the generated output.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig` type (12–16), `saveAionVoiceConfig` (178), `getAionConfig` (84)
- `src/app/api/aion/draft-follow-up/route.ts` — full draft route
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt`, voice injection
- `src/app/api/aion/lib/models.ts:69–73` — Haiku temp override
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings page
- `src/app/(dashboard)/(features)/aion/components/CadenceLearningToggle.tsx:14` — "Brain tab" comment
- `src/types/supabase.ts:7895` — `aion_config` column confirmed
