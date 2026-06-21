# Aion Phase A: Voice Setup + First Real Draft

_Researched: 2026-06-21 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How I understood this:** The question's premises need updating — the backend has outpaced the primer. `aion_config` already exists. There is no "Brain tab" at all (paused or otherwise). The real gap is the UI form. This doc re-scopes around that.

## Current state

**`aion_config` is live and typed.** The `public.workspaces` table has an `aion_config: Json` column (`src/types/supabase.ts:7782`). The `AionConfig` type is fully defined at `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts:50-74` with:

- `voice?: AionVoiceConfig` — three free-text fields: `description`, `example_message`, `guardrails` (lines 12-16)
- `follow_up_playbook`, `learned`, `kill_switch`, `learn_owner_cadence` also defined

**The write action is ready.** `saveAionVoiceConfig(voice: AionVoiceConfig)` at `aion-config-actions.ts:178-206` merges the three fields into the workspace's `aion_config`, strips the `voice_default_derived` flag, and revalidates `/aion`. A fallback synthesizes a default voice from the workspace name when voice is empty (`applyVoiceDefaultIfEmpty`, imported on line 6).

**The draft pipeline already respects voice.** `/api/aion/draft-follow-up/route.ts:53-63` loads `aionConfig`, checks `kill_switch`, then calls `generateFollowUpDraft({ context, voice: aionConfig.voice ?? null })`. Inside `generate-draft.ts:63-75`, if any voice field is populated, it injects a `--- How This Company Communicates ---` block into the system prompt with description, example message, and guardrails.

**The existing Aion settings page lives at `/settings/aion`.** `AionSettingsView.tsx` covers consent, cadence learning toggle, memory backfill, and pending access requests — but has no section for voice configuration.

**There is no Brain tab.** The `/aion` route renders `ChatInterface` directly (`AionPageClient.tsx:74`). No dedicated "Brain" page or route exists. `CadenceLearningToggle.tsx` has a comment saying it "can live inside the Brain tab" — but it is currently mounted inside `/settings/aion`, not a brain route.

## Intended state

Daniel opens `/settings/aion`, fills in three text areas — how he writes, an example message, and any hard rules — saves, then opens the Follow-Up Card on any deal, clicks "Draft with Aion," and sees a message that sounds like him. The `description` field maps to communication style, `example_message` to an actual message he's sent, and `guardrails` to rules like "never use 'excited'" or "never follow up more than twice in a week." The backend prompt injection already handles this; only the form is needed.

## The gap

- No form exists for entering or editing `AionVoiceConfig.description`, `.example_message`, `.guardrails`
- No entry point sends Daniel to voice setup (no nav link, no prompt, no onboarding state check)
- `aion_config.voice` will be `undefined` for all workspaces until someone saves it, so every draft falls back to generic tone
- The synthesized default (`applyVoiceDefaultIfEmpty`) softens this but does not replace real voice copy

## Options

### Option A: Add voice setup section to `/settings/aion`
- **What it is:** New `VoiceSetupSection` component inside `AionSettingsView.tsx`. Three `<textarea>` fields for description, example message, guardrails. Save button calls `saveAionVoiceConfig()`. Pre-populate from `getAionConfig()` passed as a prop from the server component.
- **Effort:** Small — 1 day. No new routes, no new server actions, no schema changes.
- **Main risk:** Settings page is low discovery — Daniel may forget to fill it in and wonder why drafts sound generic.
- **Unlocks:** Voice is persisted. Every follow-up draft that runs against this workspace immediately uses the configured voice. CadenceLearningToggle is already here, so voice setup fits the existing pattern.

### Option B: Guided voice setup in the Aion chat onboarding flow
- **What it is:** When `aion_config.voice` is unset and `onboarding_state !== 'voice_done'`, the chat route detects this and instructs Aion to ask the user four structured questions (style, example, guardrails, confirm). Aion's responses are parsed and saved by calling `updateAionConfigForWorkspace()`. The chat session doubles as voice setup.
- **Effort:** Medium — 2-3 days. Requires a state machine branch in the chat route, a parser for Aion's structured output, and onboarding state transitions.
- **Main risk:** Conversational setup is harder to edit later. If Daniel wants to change his voice, he has to know where the setting lives.
- **Unlocks:** Zero-friction onboarding — Daniel goes to `/aion`, Aion asks, it's done. Could be genuinely delightful.

### Option C: New `/aion/brain` route with live draft preview
- **What it is:** A dedicated page at `src/app/(dashboard)/aion/brain/page.tsx`. Voice setup form on the left, live draft preview on the right that generates a sample draft using the form values (not yet saved). Saves to `saveAionVoiceConfig()` on confirm.
- **Effort:** Medium-large — 3-4 days. New route, new layout, preview requires an API call to `draft-follow-up` with a mock context.
- **Main risk:** Needs a mock deal context for the preview (real data or fabricated); adds a new route to maintain. Premature if voice setup stays a one-time action.
- **Unlocks:** A "Brain" concept that can grow: voice today, learned patterns later, playbook rules, cadence toggle — all in one place.

## Recommendation

**Ship Option A first.** The backend is already complete. Daniel needs to be unblocked today, not in a week. Adding a `VoiceSetupSection` to `AionSettingsView.tsx` is a single-file change that directly calls the `saveAionVoiceConfig` action that already exists. The three text areas map directly to the three `AionVoiceConfig` fields that `buildFollowUpPrompt` already reads. Zero schema work, zero API work, zero route work.

The discoverability risk (Option A's main downside) is manageable: add a one-line prompt in `AionFirstVisitPrompt.tsx` linking to `/settings/aion#voice`, and add a nav highlight when voice is unconfigured — neither is blocking for v1.

Option B is appealing for onboarding but the state machine complexity is a trap for a feature that needs to work immediately. Option C is the right eventual destination for "Brain" but is premature until there are at least two more things to put there.

Accept the tradeoff: settings-first, then surface a link to it from the chat interface after it's proven working.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx`. Add a `VoiceSetupSection` below the cadence toggle — three `<textarea>` fields using `StagePanel` and the existing Button component.
2. Pass `initialVoice: AionVoiceConfig | undefined` from the settings page server component (`page.tsx`) using `getAionConfig()`.
3. Wire save to `saveAionVoiceConfig(voice)` on form submit via `useTransition` — same pattern as `handleDisable` already in the file.
4. Test: fill in the form, save, open any deal's Follow-Up Card, click "Draft with Aion," confirm the draft reflects the voice copy.
5. (Optional, do after v1 works) Add a small banner to `AionFirstVisitPrompt.tsx` linking to `/settings/aion` when `voice_default_derived === true`, so new workspaces are nudged to configure real voice.
6. Delete `src/app/(dashboard)/(features)/aion/components/ArthurInput.tsx` if it ever got created — the research agent found it does not exist, so nothing to do here.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionConfig`, `AionVoiceConfig`, `saveAionVoiceConfig`, `getAionConfig`
- `src/app/api/aion/draft-follow-up/route.ts` — voice load + kill switch + `generateFollowUpDraft` call
- `src/app/api/aion/lib/generate-draft.ts` — `buildFollowUpPrompt` with voice injection block (lines 63-75)
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — existing settings page to extend
- `src/types/supabase.ts:7782` — `aion_config: Json` on workspaces row type
- `src/app/(dashboard)/(features)/aion/components/AionFirstVisitPrompt.tsx` — onboarding nudge surface
