# Aion Phase A: voice setup form + first real draft

_Researched: 2026-06-10 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The planning primer's stated assumptions are outdated. The Aion system is substantially more built than described.

**What already exists:**

`public.workspaces.aion_config` (JSONB) is live — added in migration `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql`. The `AionConfig` type at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50–74` includes `voice?: AionVoiceConfig` with three fields: `description`, `example_message`, and `guardrails`.

`saveAionVoiceConfig(voice)` is a working Server Action at `aion-config-actions.ts:178–206`. It reads the current config, strips the `voice_default_derived` flag, merges in the new voice, and writes back via the service-role client (RLS on `public.workspaces` has no UPDATE policy for authenticated callers).

The draft pipeline is fully wired. `/api/aion/draft-follow-up/route.ts` reads `aionConfig.voice` and passes it to `generateFollowUpDraft()` at `src/app/api/aion/lib/generate-draft.ts:25–46`. `buildFollowUpPrompt()` at `generate-draft.ts:52–137` injects `voice.description`, `voice.example_message`, and `voice.guardrails` directly into the system prompt under a `--- How This Company Communicates ---` block.

Default voice synthesis is in place. `synthesizeDefaultVoice(workspaceName)` at `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` generates a generic placeholder voice from the workspace name. `applyVoiceDefaultIfEmpty()` applies it on every `getAionConfig()` read, so the draft pipeline always has something — but it's generic, not Daniel's actual voice.

The `/aion` chat page (`src/app/(dashboard)/aion/page.tsx`) is live. The `/settings/aion` page (`src/app/(dashboard)/settings/aion/`) also exists and is live — but `AionSettingsView.tsx` covers only beta consent, cadence learning opt-in, memory backfill, and admin access requests. **No voice setup UI exists anywhere.**

`resetAionVoiceConfig()` at `aion-config-actions.ts:214–256` already surfaces as "Tune Aion's voice" in the `AionSidebar` header overflow, per the docstring — but there's no form to land on when that trigger fires.

## Intended state

Daniel opens a voice setup flow, writes about how he communicates with clients (description), pastes or writes a sample message (example), optionally adds constraints (guardrails), saves, then triggers a follow-up draft from any deal card. The draft uses his voice immediately — no further config needed. Re-tuning is accessible any time from the `/settings/aion` page or the Aion sidebar overflow.

## The gap

- No voice setup form UI anywhere in the codebase
- `saveAionVoiceConfig()` is ready but nothing calls it
- The "Tune Aion's voice" sidebar overflow trigger exists in code comments but is not yet rendered/wired to a destination
- The `/settings/aion` page is missing a voice section; it currently shows only consent and beta-access controls
- `onboarding_state` in `AionConfig` is defined but nothing reads or writes it

## Options

### Option A: Voice form section in /settings/aion

- **What it is:** Add a "How Aion writes for you" section to `AionSettingsView.tsx` (or a new child component `VoiceSetupSection.tsx`). Three textarea fields with helpful placeholder copy, a save button calling `saveAionVoiceConfig()`, and a visible current state (shows derived default if no explicit voice set). The existing `resetAionVoiceConfig()` action adds a "Reset to default" path.
- **Effort:** Small — ~100 lines of UI, no new routes, no schema changes
- **Main risk:** The 3-field form may feel mechanical vs. the "write 3 paragraphs" UX in the question. Fields need good placeholder copy to guide Daniel.
- **Unlocks:** Voice immediately flows into `/api/aion/draft-follow-up`. First real draft respecting Daniel's voice is one page-save away.

### Option B: Multi-step modal triggered from AionSidebar overflow

- **What it is:** Build a 2–3 step wizard modal that fires when "Tune Aion's voice" is clicked in the `AionSidebar` header overflow. Step 1: describe your communication style (maps to `description`). Step 2: write an example message (maps to `example_message`). Step 3 (optional): add hard guardrails. Wire the `onboarding_state` field to track progress across steps.
- **Effort:** Medium — modal component, step state machine, AionSidebar overflow wire-up (~250 lines)
- **Main risk:** Sidebar overflow is not yet rendered (the docstring describes intent, not shipped UI). Two things to build instead of one.
- **Unlocks:** Same end state as Option A, plus a more natural onboarding path for future new workspaces. Sets `onboarding_state` correctly for future use.

### Option C: Freeform prose → Aion extracts voice config

- **What it is:** Single textarea where Daniel writes freely about how he communicates. On save, a small server action calls the Aion API to extract structured `{description, example_message, guardrails}` from the prose, presents a confirmation step, then calls `saveAionVoiceConfig()`.
- **Effort:** Medium-large — LLM call on write path, new extraction prompt, confirmation UI, error handling for parse failures
- **Main risk:** LLM step adds latency and a failure mode on save. If the extraction is wrong, Daniel has to correct machine output rather than just type what he meant. More moving parts for a settings form.
- **Unlocks:** The "write 3 paragraphs naturally" UX from the queue question description. Best UX but most complexity.

## Recommendation

**Option A.** The infrastructure is complete; only the UI form is missing. Build the voice section in `/settings/aion` first, ship it, and let Daniel use it against real deals. The 3-field structure (`description`, `example_message`, `guardrails`) is expressive enough — the placeholder copy does the work of guiding freeform input. Good placeholders:

- description: _How you communicate — tone, pace, what to avoid. E.g. "Casual but precise. No filler. Get to the point fast."_
- example_message: _Paste a real message you sent that landed well._
- guardrails: _Hard rules Aion must not break. E.g. "Never quote prices I didn't confirm. Always leave a door open."_

The Option B modal is the right long-term onboarding pattern and should be built next — but it shouldn't block Daniel from getting a real voice-aware draft today. Option C is appealing but adds complexity to a form that can be kept simple; save it for a "let Aion suggest your voice from sent emails" feature once send-history data exists.

Accept the tradeoff: a settings-page form is slightly less tactile than a chat-guided flow, but it's shippable in an afternoon and immediately activates the live draft pipeline.

## Next steps for Daniel

1. Create `src/app/(dashboard)/settings/aion/VoiceSetupSection.tsx` — a client component with three `<textarea>` fields and a save button. Import `saveAionVoiceConfig` from `aion-config-actions.ts`.
2. Add a `currentVoice` prop to `AionSettingsView.tsx` and pass the current `aion_config.voice` from the page server component (read via `getAionConfig()` or directly from the workspace row).
3. Mount `<VoiceSetupSection>` inside `AionSettingsView.tsx` above the cadence section — keep it always visible, not gated behind the beta flag.
4. Test end-to-end: save voice, open any deal with a follow-up queue item, trigger a draft, verify the voice block appears in the generated text (add `console.log(systemPrompt)` in `generate-draft.ts:buildFollowUpPrompt` during dev).
5. Wire the "Tune Aion's voice" overflow item in `AionSidebar.tsx` to navigate to `/settings/aion` (a `router.push('/settings/aion')` is sufficient — the section is already there after step 3).
6. Remove the `voice_default_derived` status note from the UI (or keep it as a subtle callout — "currently using auto-generated defaults — set your own voice below").

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:12–206` — AionConfig type, getAionConfig, saveAionVoiceConfig, resetAionVoiceConfig
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — synthesizeDefaultVoice, applyVoiceDefaultIfEmpty
- `src/app/api/aion/lib/generate-draft.ts:52–137` — buildFollowUpPrompt (voice injection)
- `src/app/api/aion/draft-follow-up/route.ts` — full draft pipeline
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings page (no voice section)
- `supabase/migrations/pre-baseline/20260407140000_aion_voice_foundation.sql` — aion_config column origin
