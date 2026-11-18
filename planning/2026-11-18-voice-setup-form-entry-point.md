# Voice Setup Form: Surfacing the Missing Entry Point

_Researched: 2026-11-18 · Unusonic Research Agent_

## The question

Scope Phase A of the Aion agent architecture (section 26 of `docs/reference/follow-up-engine-design.md`). Specifically: given the Brain tab is currently paused and `public.workspaces.aion_config` doesn't exist, what's the minimum path to unblock voice setup + first real draft? Context: the goal is to have Daniel open the Brain tab, write 3 paragraphs about how he talks to clients, and immediately see an Aion-generated follow-up draft that respects that voice.

**How I understood this:** The primer used to compile this question is from April 2026. As of this run (November 2026), the backend is significantly further along. I'm re-framing to: what's the missing UI piece between the fully-built backend and Daniel's "3 paragraphs → draft" goal?

---

## Current state

The backend is built. The primer is stale. What exists:

- `public.workspaces.aion_config` exists — JSONB, fully typed as `AionConfig`, read and written throughout the app (`aion-config-actions.ts:94`)
- `/api/aion/draft-follow-up` is fully implemented — auth, tier gate, kill switch, voice injection, `generateFollowUpDraft` (`src/app/api/aion/draft-follow-up/route.ts:21`)
- `generateFollowUpDraft` injects all three voice fields into the system prompt (`src/app/api/aion/lib/generate-draft.ts:52`)
- `AionVoiceConfig` type (`description`, `example_message`, `guardrails`) is defined and used (`aion-config-actions.ts:12`)
- 5-state onboarding machine (`no_voice → no_example → no_guardrails → needs_test_draft → configured`) is implemented and wired into the chat greeting (`src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts:247`)
- `save_voice_config` chat tool saves voice fields to `aion_config` via LLM tool call (`src/app/api/aion/chat/tools/core.ts:118`)
- `saveAionVoiceConfig` server action exists but is never called from any UI form (`aion-config-actions.ts:178`)
- The Brain tab renders `ChatInterface` — it is not paused (`src/app/(dashboard)/aion/AionPageClient.tsx:66`)

**The bypass that hides the problem:** Wk 11 §3.8 introduced `synthesizeDefaultVoice` + `voice_default_derived: true`. Every new workspace gets a default voice synthesized from the workspace name on first read (`aion-config-helpers.ts:35`), and `getOnboardingState` immediately returns `'configured'` for any workspace with this flag (`aion-chat-types.ts:248`). The 4-step onboarding flow never fires for a new user. The only entry point is the sidebar overflow "Tune Aion's voice," which calls `resetAionVoiceConfig` — not obvious.

---

## Intended state

Daniel opens the Brain tab (or settings), writes how he talks to clients in three plain paragraphs (style, example, rules), saves, and sees an Aion-generated follow-up draft for a real deal. The whole sequence takes under five minutes.

The 4-step conversational flow to collect voice already exists and works. The `needs_test_draft` onboarding state already offers a test draft. These just need a discoverable, direct entry point.

---

## The gap

- `saveAionVoiceConfig` (server action) is defined but never called from any UI component
- No dedicated form surface maps to the three voice fields (`description`, `example_message`, `guardrails`)
- New workspaces skip voice setup entirely via `voice_default_derived`; the only reset path is a buried sidebar overflow menu item
- The `/settings/aion` page covers card beta consent but has no voice config section

---

## Options

### Option A: Voice setup form in `/settings/aion`

- **What it is:** Add a `VoiceSetupSection` component to the existing settings page — three labeled textareas (description, example message, guardrails) that call `saveAionVoiceConfig` on submit. Pre-populate from stored voice when it's not default-derived. After save, show a "Go to Brain tab" CTA. The `needs_test_draft` greeting fires automatically in the Brain tab.
- **Effort:** Small. The server action, DB column, and types are built. This is a ~120-line component plus a data-loading change in the page server component.
- **Main risk:** Settings is a detour — users already on the Brain tab have to navigate away.
- **Unlocks:** A direct "3 paragraphs → save → draft" flow accessible to any workspace admin.

### Option B: Prominent in-Brain entry point

- **What it is:** When `voice_default_derived === true`, show a one-time entry card or chip row in `ChatInterface` (extends `AionLandingStarters` or adds a state check). Clicking calls `resetAionVoiceConfig` and the next chat turn fires the `no_voice` greeting, starting the 4-step chat flow.
- **Effort:** Small. One state-conditional block in `ChatInterface` or `AionLandingStarters`.
- **Main risk:** 4 sequential chat turns before seeing a draft. The LLM must correctly invoke `save_voice_config` after each paragraph; tone quality degrades if the model doesn't save mid-turn.
- **Unlocks:** Chat-native setup without leaving the Brain tab.

### Option C: Single-turn freeform in the Brain tab

- **What it is:** A single textarea prompt in the Brain tab ("Tell me how you talk to clients — paste anything"). One LLM call parses the freeform text into the three fields, saves them, then immediately calls `draft_follow_up` for the top queue item.
- **Effort:** Medium. New parsing step, new UI component, new API route or extended chat tool.
- **Main risk:** Parsing fidelity — the model may not reliably split one blob of text into three distinct fields. Adds latency and an extra LLM call before the draft.
- **Unlocks:** Literal "paste 3 paragraphs → draft appears" in one interaction.

---

## Recommendation

Option A. The server action, DB column, and all voice types are built — the only gap is a form that calls `saveAionVoiceConfig`. The settings page at `/settings/aion` already exists, has the right administrative scope, and has a visual pattern to follow (StagePanel sections). Adding a `VoiceSetupSection` component is the smallest change that closes the full loop.

After save, `voice_default_derived` is cleared (the merge logic in `saveAionVoiceConfig` already drops the flag at `aion-config-actions.ts:190`). The Brain tab then sees `onboarding_state = 'needs_test_draft'` and the greeting offers a draft automatically. No additional wiring needed.

Option B keeps setup in the chat but requires 4 sequential turns and depends on LLM tool-call reliability. Option C is appealing UX-wise but over-engineers the parsing step when three labeled textareas already communicate the distinction clearly. Build the form first; refine UX based on what Daniel's real friction is after one use.

---

## Next steps for Daniel

1. Add `src/app/(dashboard)/settings/aion/VoiceSetupSection.tsx` — three labeled `<textarea>` fields calling `saveAionVoiceConfig` from `aion-config-actions.ts`. Show a "Voice configured" state when `voice.description` exists and `!voice_default_derived`.
2. In the page server component for `/settings/aion`, call `getAionConfig()` alongside the existing feature state load, and pass `aionConfig` and `voiceDefaultDerived` as props to `AionSettingsView`.
3. Mount `VoiceSetupSection` near the top of `AionSettingsView` — above the card beta section, no consent gate. Visible to any workspace admin.
4. After `saveAionVoiceConfig` resolves successfully, navigate to `/aion`. The `needs_test_draft` greeting fires automatically and offers a test draft.
5. Confirm with a quick manual test: open `/settings/aion`, fill in three paragraphs, save, land on Brain tab, verify the draft offer appears.

---

## References

- `src/app/(dashboard)/(features)/aion/actions/aion-config-actions.ts` — `saveAionVoiceConfig`, `getAionConfig`, `AionVoiceConfig` type
- `src/app/(dashboard)/(features)/aion/actions/aion-config-helpers.ts` — `synthesizeDefaultVoice`, `applyVoiceDefaultIfEmpty`
- `src/app/(dashboard)/(features)/aion/lib/aion-chat-types.ts` — `getOnboardingState`, `OnboardingState`
- `src/app/api/aion/chat/tools/core.ts:118` — `save_voice_config` chat tool
- `src/app/api/aion/chat/route/prompts.ts:284` — onboarding system-prompt injection
- `src/app/api/aion/draft-follow-up/route.ts` — draft generation endpoint
- `src/app/api/aion/lib/generate-draft.ts` — voice-injected prompt builder
- `src/app/(dashboard)/settings/aion/AionSettingsView.tsx` — settings page to extend
