# Aion voice setup: minimum path to voice config + first draft

_Researched: 2026-05-18 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

## Current state

The planning primer is significantly outdated. As of today the backend is essentially complete.

**`aion_config` exists.** `public.workspaces.aion_config` is a live JSONB column read and written by multiple production paths. `getAionConfig()` and `getAionConfigForWorkspace()` both query it (`aion-config-actions.ts:84–120`). The `AionVoiceConfig` type (`description`, `example_message`, `guardrails`) is defined at `aion-config-actions.ts:12–16` and the write action `saveAionVoiceConfig` at `aion-config-actions.ts:178–206`.

**`/api/aion/draft-follow-up` is fully wired.** Auth guard, tier gate, kill-switch check, voice injection, and `generateFollowUpDraft()` are all live at `app/api/aion/draft-follow-up/route.ts`. The prompt builder at `app/api/aion/lib/generate-draft.ts:52–137` injects `voice.description`, `voice.example_message`, and `voice.guardrails` verbatim into the system prompt.

**The 5-state onboarding machine exists.** `getOnboardingState(config)` at `aion-chat-types.ts:247–265` drives the chat route through `no_voice → no_example → no_guardrails → needs_test_draft → configured`. Each state fires a targeted greeting and locks the model's behavior. The `draft_follow_up` chat tool at `chat/tools/core.ts:318` calls the draft route inline.

**There is one blocker: the `voice_default_derived` bypass.** `applyVoiceDefaultIfEmpty()` (`aion-config-helpers.ts:35–45`) synthesizes a default voice from the workspace name on every read and sets `voice_default_derived: true`. When that flag is set, `getOnboardingState` returns `'configured'` and the 4-step forcing block never fires. New workspaces silently skip setup. The only current escape hatch is the "Tune Aion's voice" overflow item in the `AionSidebar` (`AionSidebar.tsx:973–1043`), which calls `resetAionVoiceConfig` and restarts the flow.

**The Brain tab does not exist as a form surface.** Voice setup happens only through conversational chat — there is no standalone form. The CadenceLearningToggle comment notes it "can live inside the Brain tab" (`CadenceLearningToggle.tsx:14`), confirming the Brain tab was always planned but never shipped.

## Intended state

Daniel opens a direct setup surface (Brain tab or a settings section), fills three fields in plain text — style description, example message, guardrails — submits, and immediately sees a rendered follow-up draft that uses those values. No chat required. The backend already handles everything after those three fields are submitted: `saveAionVoiceConfig` stores them, `generateFollowUpDraft` uses them.

## The gap

- No dedicated form UI for `AionVoiceConfig` (description / example_message / guardrails)
- No "Preview draft" button that calls `draft-follow-up` with form values + a minimal sample deal context
- `voice_default_derived` bypass means new workspaces never encounter the onboarding flow naturally
- "Tune Aion's voice" CTA in the sidebar is invisible — buried in an overflow menu Daniel has no reason to open

## Options

### Option A: Expose the existing chat-based onboarding directly

Add a prominent "Set up Aion's voice" CTA to `/settings/aion` that calls `resetAionVoiceConfig()` client-side and redirects to `/aion`. The existing 4-step chat flow handles the rest.

- **What it is:** A single button in the settings page. No new components.
- **Effort:** Small (< 1 hour, single file change to `AionSettingsView.tsx`)
- **Main risk:** Chat-based setup is slow and non-obvious for "write 3 paragraphs" intent. The four turns feel procedural when Daniel just wants to dump his style.
- **Unlocks:** Voice-configured drafts with zero new backend work.

### Option B: Add a voice setup form to `/settings/aion`

Add a `VoiceSetupForm` section to the existing settings page with three labeled textareas and a "Preview draft" button. On save, call `saveAionVoiceConfig`. On preview, POST to `/api/aion/draft-follow-up` with the form values as voice and a hardcoded stub deal context.

- **What it is:** ~120 lines of new React in `AionSettingsView.tsx` or a new `VoiceSetupForm.tsx` alongside it. No migration, no new route, no schema change.
- **Effort:** Medium (2–3 hours: form, validation, preview fetch, draft display)
- **Main risk:** Needs a plausible stub deal context for the preview so the draft looks realistic, not generic. A hardcoded context ("wedding, 90 guests, proposal sent 8 days ago") is fine for v1.
- **Unlocks:** Daniel fills three fields, sees a real draft, closes the loop in one sitting.

### Option C: Build the Brain tab as a dedicated config surface inside `/aion`

Add a "Brain" tab to `AionSidebar` with the voice form, cadence toggle, and playbook rules in one place. This is the full design-doc vision.

- **What it is:** New sidebar tab, refactored settings, voice form, full playbook UI.
- **Effort:** Large (days, touches AionSidebar + settings + new playbook UI)
- **Main risk:** Over-scoped for the immediate goal. The playbook and cadence UI aren't needed to get the first voice-configured draft.
- **Unlocks:** The full Brain tab vision. But blocks the near-term goal behind a larger build.

## Recommendation

**Ship Option B.** The backend is complete; the only thing standing between Daniel and his goal is a form. The settings page is the right home: it's where other Aion config lives, it's accessible outside the chat flow, and it keeps the concern separated from the conversational surface.

The form should have three clearly labeled fields matching `AionVoiceConfig` exactly (`description` as "Your communication style", `example_message` as "Paste a real follow-up you've sent", `guardrails` as "Rules Aion should always follow"). Include a "Preview a draft" button that hits `/api/aion/draft-follow-up` with the current form values plus a stub deal context (hardcode something realistic — wedding show, proposal sent 9 days ago, no reply). Render the result inline. Save and preview can be the same action.

Option A feels like the right instinct but the chat flow adds unnecessary friction for a structured three-field task. Option C is correct long-term but overkill for today's goal.

The `voice_default_derived` flag is already handled: `saveAionVoiceConfig` strips it on write (`aion-config-actions.ts:190–191`), so saving through the form permanently replaces the synthesized default.

## Next steps for Daniel

1. Open `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — add a `VoiceSetupForm` section below the cadence toggle or as a new sibling component.
2. Wire the form to `saveAionVoiceConfig` from `aion-config-actions.ts`. Read current voice via `getAionConfig()` in the server component to pre-populate.
3. Add a "Preview draft" button: POST `{ context: stubContext, workspaceId }` to `/api/aion/draft-follow-up` and render the returned `draft` string inline. Use `STUB_DEAL_CONTEXT` — a hardcoded `AionDealContext` shaped object with wedding archetype, 90 guests, proposal sent 9 days ago.
4. Verify `saveAionVoiceConfig` write path works end-to-end: the function uses `supabase.from('workspaces').update(...)` scoped to `workspace_id`, with no RLS UPDATE policy — confirm the server action's session client can write (it has been doing so for the kill switch; the same path applies).
5. Hide the chat-based 4-step onboarding behind the existing "Tune Aion's voice" sidebar overflow for power users; it can stay as the secondary path.
6. Test: fill the form, preview, save, open a deal and trigger a follow-up draft from the deal card — confirm the draft reflects the submitted voice.

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `AionVoiceConfig`, `saveAionVoiceConfig`, `getAionConfig`
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `applyVoiceDefaultIfEmpty`, `voice_default_derived` bypass
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:225–265` — `OnboardingState`, `getOnboardingState`
- `src/app/api/aion/draft-follow-up/route.ts` — complete draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts` — `generateFollowUpDraft`, `buildFollowUpPrompt`
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — target file for the form
- `src/app/(dashboard)/(features)/aion/components/AionSidebar.tsx:973–1043` — "Tune Aion's voice" overflow item
